// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: a } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  const { data: o } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" });
  if (!a && !o) throw new Error("Acesso negado");
}

export const listWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("pix_requests")
      .select("id,user_id,amount,status,pix_key,created_at,updated_at")
      .eq("kind", "withdraw")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids: string[] = Array.from(new Set((rows ?? []).map((r: any) => String(r.user_id))));
    const profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id,full_name").in("id", ids);
      profs?.forEach((p) => { profilesMap[p.id] = { full_name: p.full_name, email: null }; });
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      users?.users.forEach((u) => {
        if (ids.includes(u.id)) profilesMap[u.id] = { ...(profilesMap[u.id] ?? { full_name: null }), email: u.email ?? null };
      });
    }
    return {
      withdrawals: (rows ?? []).map((r) => ({
        ...r,
        user_name: profilesMap[r.user_id]?.full_name ?? null,
        user_email: profilesMap[r.user_id]?.email ?? null,
      })),
    };
  });

export const withdrawalAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    request_id: z.string().uuid(),
    action: z.enum(["approved", "rejected", "paid"]),
    note: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context.supabase as any).rpc("admin_withdrawal_action", {
      _request_id: data.request_id, _action: data.action, _note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminFinancialDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [walletsRes, pixRes, salesRes, adminRes] = await Promise.all([
      supabaseAdmin.from("wallets").select("available_balance,pending_balance,total_cashback,blocked_balance"),
      supabaseAdmin.from("pix_requests").select("kind,status,amount,created_at"),
      supabaseAdmin.from("sales").select("gross_amount,gf_commission,created_at"),
      supabaseAdmin.from("admin_wallet").select("balance,total_collected").eq("id", "gf").maybeSingle(),
    ]);
    const wallets = walletsRes.data ?? [];
    const sum = (k: string) => wallets.reduce((s, r: any) => s + Number(r[k] ?? 0), 0);
    const totals = {
      available: sum("available_balance"),
      pending: sum("pending_balance"),
      cashback: sum("total_cashback"),
      blocked: sum("blocked_balance"),
      gf_balance: Number(adminRes.data?.balance ?? 0),
      gf_collected: Number(adminRes.data?.total_collected ?? 0),
      total_received: (salesRes.data ?? []).reduce((s, r: any) => s + Number(r.gross_amount || 0), 0),
      total_sales_count: (salesRes.data ?? []).length,
      total_withdrawn: (pixRes.data ?? [])
        .filter((p: any) => p.kind === "withdraw" && p.status === "paid")
        .reduce((s, r: any) => s + Number(r.amount || 0), 0),
      total_deposited: (pixRes.data ?? [])
        .filter((p: any) => p.kind === "deposit" && p.status === "approved")
        .reduce((s, r: any) => s + Number(r.amount || 0), 0),
    };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days: { date: string; sales: number; commission: number; withdrawn: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const sales = (salesRes.data ?? [])
        .filter((s: any) => s.created_at?.slice(0, 10) === key)
        .reduce((sum: number, r: any) => sum + Number(r.gross_amount || 0), 0);
      const commission = (salesRes.data ?? [])
        .filter((s: any) => s.created_at?.slice(0, 10) === key)
        .reduce((sum: number, r: any) => sum + Number(r.gf_commission || 0), 0);
      const withdrawn = (pixRes.data ?? [])
        .filter((p: any) => p.kind === "withdraw" && p.status === "paid" && p.created_at?.slice(0, 10) === key)
        .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      days.push({ date: key, sales, commission, withdrawn });
    }
    return { totals, last30: days };
  });

export const adminAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    event: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q: any = (supabaseAdmin as any).from("financial_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.event) q = q.eq("event", data.event);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { logs: rows ?? [] };
  });

export const runFridayRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await (context.supabase as any).rpc("release_pending_friday");
    if (error) throw new Error(error.message);
    return { released: Number(data ?? 0) };
  });

export const listBalanceBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any).from("balance_blocks").select("*").order("created_at", { ascending: false }).limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids: string[] = Array.from(new Set((rows ?? []).map((r: any) => String(r.user_id))));
    const names: Record<string, string | null> = {};
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id,full_name").in("id", ids);
      profs?.forEach((p: any) => { names[p.id] = p.full_name; });
    }
    return { blocks: (rows ?? []).map((r: any) => ({ ...r, user_name: names[r.user_id] ?? null })) };
  });

export const blockBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    user_email: z.string().email(),
    amount: z.number().positive().max(1_000_000),
    reason: z.string().min(3).max(300),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.admin.listUsers();
    const target = u.users.find((x) => x.email?.toLowerCase() === data.user_email.toLowerCase());
    if (!target) throw new Error("Usuário não encontrado");
    const { error } = await (context.supabase as any).rpc("admin_block_balance", {
      _user: target.id, _amount: data.amount, _reason: data.reason, _order_id: null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const releaseBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    block_id: z.string().uuid(), note: z.string().max(300).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context.supabase as any).rpc("admin_release_block", {
      _block_id: data.block_id, _note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCommissionsReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(); since.setDate(since.getDate() - 90);
    const { data } = await supabaseAdmin.from("sales")
      .select("gross_amount,gf_commission,partner_net,created_at,partner_id")
      .gte("created_at", since.toISOString());
    return { sales: data ?? [] };
  });