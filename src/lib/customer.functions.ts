import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminAccess } from "@/lib/admin-access";

/* Generated Supabase types lag the schema after a new migration.
   We use `any` casts intentionally so server fns keep building. */

/* ---------------- Notifications ---------------- */

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { notifications: (data ?? []) as any[] };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    let q = supabase.from("notifications").update({ read: true }).eq("user_id", userId);
    if (data.id) q = q.eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const pushNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      kind: z.string().min(1).max(40),
      title: z.string().min(1).max(160),
      body: z.string().max(500).optional(),
      link: z.string().max(255).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { error } = await admin.from("notifications").insert({
      user_id: userId,
      kind: data.kind,
      title: data.title,
      body: data.body ?? null,
      link: data.link ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Pedidos do cliente (rastreamento) ---------------- */

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("orders")
      .select("id, items, subtotal, discount, total, status, payment_method, paid_at, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.warn("[orders] list skipped:", error.message);
      return { orders: [] as any[] };
    }
    return { orders: (data ?? []) as any[] };
  });

/* ---------------- Cashback ---------------- */

async function expireUserCashback(supabase: any, userId: string) {
  const { error } = await supabase
    .from("cashback_credits")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString());
  if (error) console.warn("[cashback] expiration skipped:", error.message);
}

export const listCashback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    await expireUserCashback(supabase, userId);
    const { data, error } = await supabase
      .from("cashback_credits")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[cashback] list skipped:", error.message);
      return { credits: [], available: 0, totalEarned: 0, totalUsed: 0, totalExpired: 0 };
    }
    const credits = (data ?? []) as any[];
    const available = credits
      .filter(c => c.status === "active")
      .reduce((s, c) => s + Number(c.amount) - Number(c.used_amount), 0);
    const totalEarned = credits.reduce((s, c) => s + Number(c.amount), 0);
    const totalUsed = credits.reduce((s, c) => s + Number(c.used_amount), 0);
    const totalExpired = credits
      .filter(c => c.status === "expired")
      .reduce((s, c) => s + (Number(c.amount) - Number(c.used_amount)), 0);
    return { credits, available, totalEarned, totalUsed, totalExpired };
  });

export const consumeCashback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ amount: z.number().min(0.01).max(1_000_000) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    await expireUserCashback(supabase, userId);
    const { data: credits, error } = await supabase
      .from("cashback_credits")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("expires_at", { ascending: true });
    if (error) throw new Error(error.message);
    let remaining = data.amount;
    for (const c of (credits ?? []) as any[]) {
      if (remaining <= 0) break;
      const avail = Number(c.amount) - Number(c.used_amount);
      if (avail <= 0) continue;
      const take = Math.min(avail, remaining);
      const newUsed = Number(c.used_amount) + take;
      const newStatus = newUsed >= Number(c.amount) ? "used" : "active";
      const { error: upErr } = await supabase
        .from("cashback_credits")
        .update({ used_amount: newUsed, status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", c.id);
      if (upErr) throw new Error(upErr.message);
      remaining -= take;
    }
    return { consumed: data.amount - Math.max(0, remaining), shortfall: Math.max(0, remaining) };
  });

/* ---------------- Admin ---------------- */

export const adminCashbackReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    await assertAdminAccess(context);
    await supabase
      .from("cashback_credits")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());
    const { data, error } = await supabase
      .from("cashback_credits")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const credits = (data ?? []) as any[];
    const sum = (arr: any[], f: (c: any) => number) => arr.reduce((s, c) => s + f(c), 0);
    return {
      credits,
      totals: {
        issued: sum(credits, c => Number(c.amount)),
        used: sum(credits, c => Number(c.used_amount)),
        active: sum(credits.filter(c => c.status === "active"), c => Number(c.amount) - Number(c.used_amount)),
        expired: sum(credits.filter(c => c.status === "expired"), c => Number(c.amount) - Number(c.used_amount)),
        transferred: sum(credits.filter(c => c.status === "transferred"), c => Number(c.amount) - Number(c.used_amount)),
      },
    };
  });

export const adminMarkExpiredTransferred = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    await assertAdminAccess(context);
    const { error } = await supabase
      .from("cashback_credits")
      .update({ status: "transferred", updated_at: new Date().toISOString() })
      .eq("status", "expired");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
