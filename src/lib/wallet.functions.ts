// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [w, p, lvl] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("level,lifetime_spent,full_name,pix_key,birthday").eq("id", userId).maybeSingle(),
      supabase.from("cashback_levels").select("*").order("min_spent"),
    ]);
    return {
      wallet: w.data ?? { available_balance: 0, pending_balance: 0, total_cashback: 0 },
      profile: p.data ?? null,
      levels: lvl.data ?? [],
    };
  });

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return { transactions: data ?? [] };
  });

export const updatePixKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pix_key: z.string().trim().min(3).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ pix_key: data.pix_key })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestPixDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ amount: z.number().positive().max(50000) }).parse(d))
  .handler(async ({ data, context }) => {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) throw new Error("Mercado Pago não configurado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await context.supabase
      .from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const { data: { user } } = await context.supabase.auth.getUser();
    const email = user?.email ?? `user-${context.userId}@grupogf.local`;

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("pix_requests")
      .insert({ user_id: context.userId, kind: "deposit", amount: data.amount, status: "pending" })
      .select("id").single();
    if (reqErr || !req) throw new Error(reqErr?.message ?? "Falha ao criar pedido");

    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const host = getRequestHost() ?? "localhost:3000";
    const baseUrl = process.env.PUBLIC_SITE_URL || `${proto}://${host}`;

    const res = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": req.id,
      },
      body: JSON.stringify({
        transaction_amount: data.amount,
        description: `Depósito Carteira GF - ${profile?.full_name ?? email}`,
        payment_method_id: "pix",
        external_reference: req.id,
        notification_url: `${baseUrl}/api/public/mp-pix-webhook`,
        payer: { email, first_name: profile?.full_name ?? "Cliente" },
      }),
    });
    const payment = await res.json();
    if (!res.ok) {
      await supabaseAdmin.from("pix_requests").update({ status: "rejected", raw_response: payment }).eq("id", req.id);
      throw new Error(payment?.message ?? "Falha no Mercado Pago");
    }

    const qr = payment?.point_of_interaction?.transaction_data;
    await supabaseAdmin.from("pix_requests").update({
      mp_payment_id: String(payment.id),
      qr_code: qr?.qr_code ?? null,
      qr_code_base64: qr?.qr_code_base64 ?? null,
      copy_paste: qr?.qr_code ?? null,
      raw_response: payment,
    }).eq("id", req.id);

    return {
      id: req.id,
      qr_code: qr?.qr_code ?? null,
      qr_code_base64: qr?.qr_code_base64 ?? null,
      copy_paste: qr?.qr_code ?? null,
    };
  });

export const requestPixWithdraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    amount: z.number().positive().max(50000),
    pix_key: z.string().trim().min(3).max(120),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Saque seguro: valida saldo, considera blocked_balance e bloqueios ativos
    const { data: req, error } = await (context.supabase as any).rpc("request_pix_withdraw_secure", {
      _amount: data.amount, _pix_key: data.pix_key,
    });
    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("insufficient")) throw new Error("Saldo insuficiente (considere valores bloqueados)");
      throw new Error(error.message);
    }
    return { ok: true, request_id: req };
  });

export const transferToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    to_email: z.string().email(),
    amount: z.number().positive().max(50000),
    note: z.string().max(200).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin.auth.admin.listUsers();
    const dest = target.users.find((u) => u.email?.toLowerCase() === data.to_email.toLowerCase());
    if (!dest) throw new Error("Destinatário não encontrado");
    const { data: ref, error } = await context.supabase.rpc("transfer_balance", {
      _to_user: dest.id, _amount: data.amount, _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true, ref };
  });

// Admin-only
export const adminGetRevenue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data: isOwner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" });
    if (!isAdmin && !isOwner) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date();
    const day = today.toISOString().slice(0, 10);
    const week = new Date(today); week.setDate(today.getDate() - 7);
    const month = new Date(today); month.setMonth(today.getMonth() - 1);
    const year = new Date(today); year.setFullYear(today.getFullYear() - 1);
    const sum = async (since: Date) => {
      const { data } = await supabaseAdmin.from("sales").select("gf_commission,gross_amount")
        .gte("created_at", since.toISOString());
      const arr = (data ?? []) as { gf_commission: number; gross_amount: number }[];
      return {
        commission: arr.reduce((s, r) => s + Number(r.gf_commission || 0), 0),
        gross: arr.reduce((s, r) => s + Number(r.gross_amount || 0), 0),
        count: arr.length,
      };
    };
    const [d, w, m, y] = await Promise.all([
      sum(new Date(day)), sum(week), sum(month), sum(year),
    ]);
    return { day: d, week: w, month: m, year: y };
  });