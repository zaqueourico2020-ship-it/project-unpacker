import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdminAccess, getAdminDb } from "@/lib/admin-access";

// ---------- Configurações ----------
export const getCommissionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    const { data: globalRow } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", "commission_rate_default")
      .maybeSingle();
    const { data: partners } = await db
      .from("partners")
      .select("id, nome_loja, slug, status, commission_rate")
      .order("nome_loja", { ascending: true });
    return {
      globalRate: Number(globalRow?.value?.rate ?? 10),
      partners: partners ?? [],
    };
  });

export const updateGlobalCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ rate: z.number().min(0).max(100) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    const { error } = await db
      .from("platform_settings")
      .upsert(
        {
          key: "commission_rate_default",
          value: { rate: data.rate },
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updatePartnerCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      partnerId: z.string().uuid(),
      rate: z.number().min(0).max(100).nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    const { error } = await db
      .from("partners")
      .update({ commission_rate: data.rate })
      .eq("id", data.partnerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Histórico e Relatórios ----------
export const listCommissionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      partnerId: z.string().uuid().optional(),
      orderId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().min(1).max(1000).default(200),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    let q = db
      .from("commission_history")
      .select("*, partners(nome_loja, slug), partner_orders(order_id)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.partnerId) q = q.eq("partner_id", data.partnerId);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.orderId) {
      const { data: pos } = await db.from("partner_orders").select("id").eq("order_id", data.orderId);
      const ids = (pos ?? []).map((p: any) => p.id);
      if (ids.length === 0) return { rows: [] };
      q = q.in("partner_order_id", ids);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ---------- Carteira admin GF + Auditoria ----------
export const getAdminWalletStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    const { data: wallet } = await db.from("admin_wallet").select("*").eq("id", "gf").maybeSingle();
    const { data: txs } = await db
      .from("admin_wallet_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    return {
      wallet: wallet ?? { id: "gf", balance: 0, total_collected: 0, updated_at: null },
      transactions: txs ?? [],
    };
  });

export const listFinancialAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      partnerId: z.string().uuid().optional(),
      orderId: z.string().uuid().optional(),
      event: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().min(1).max(1000).default(200),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    let q = db
      .from("financial_audit_logs")
      .select("*, partners(nome_loja, slug)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.partnerId) q = q.eq("partner_id", data.partnerId);
    if (data.orderId) q = q.eq("order_id", data.orderId);
    if (data.event) q = q.eq("event", data.event);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const getCommissionReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    let q = db
      .from("commission_history")
      .select("partner_id, base_amount, commission_amount, partner_net, status, partners(nome_loja, slug)")
      .limit(10000);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    type Agg = { partnerId: string; nomeLoja: string; base: number; commission: number; net: number; count: number };
    const map = new Map<string, Agg>();
    let totalBase = 0;
    let totalCommission = 0;
    let totalNet = 0;
    for (const r of rows ?? []) {
      const pid = (r as any).partner_id as string;
      const nome = (r as any).partners?.nome_loja ?? "—";
      const base = Number((r as any).base_amount) || 0;
      const commission = Number((r as any).commission_amount) || 0;
      const net = Number((r as any).partner_net) || 0;
      totalBase += base;
      totalCommission += commission;
      totalNet += net;
      const cur = map.get(pid) ?? { partnerId: pid, nomeLoja: nome, base: 0, commission: 0, net: 0, count: 0 };
      cur.base += base;
      cur.commission += commission;
      cur.net += net;
      cur.count += 1;
      map.set(pid, cur);
    }
    const byPartner = Array.from(map.values()).sort((a, b) => b.commission - a.commission);
    return {
      totalBase: Math.round(totalBase * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      byPartner,
    };
  });

// ---------- Visão do parceiro ----------
export const listMyCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: partner } = await supabase
      .from("partners")
      .select("id, commission_rate")
      .eq("user_id", userId)
      .maybeSingle();
    if (!partner) return { rows: [], totals: { base: 0, commission: 0, net: 0 }, rate: null };
    const { data: rows, error } = await supabase
      .from("commission_history")
      .select("*")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const totals = (rows ?? []).reduce(
      (acc: any, r: any) => {
        acc.base += Number(r.base_amount) || 0;
        acc.commission += Number(r.commission_amount) || 0;
        acc.net += Number(r.partner_net) || 0;
        return acc;
      },
      { base: 0, commission: 0, net: 0 },
    );
    return { rows: rows ?? [], totals, rate: partner.commission_rate };
  });
