import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } }) as any;
}

// Public: count of followers for a store + whether current user follows (if logged in attached)
export const getStoreFollowInfo = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ sellerId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(url, key, { auth: { persistSession: false } }) as any;
    const { count } = await sb
      .from("followers")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", data.sellerId);
    return { count: count ?? 0 };
  });

// Authenticated: is the current user following this store?
export const isFollowingStore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sellerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await (context.supabase as any)
      .from("followers")
      .select("id")
      .eq("seller_id", data.sellerId)
      .eq("follower_id", context.userId)
      .maybeSingle();
    return { following: !!row };
  });

export const followStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sellerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("followers")
      .insert({ seller_id: data.sellerId, follower_id: context.userId });
    if (error && !String(error.message).toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const unfollowStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sellerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("followers")
      .delete()
      .eq("seller_id", data.sellerId)
      .eq("follower_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Customer: list stores I follow
export const listFollowedStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data: rows, error } = await supabase
      .from("followers")
      .select("seller_id, created_at, partners!inner(id, slug, nome_loja, logo_url, banner_url, descricao, verified, status)")
      .eq("follower_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const stores = (rows ?? [])
      .map((r: any) => ({ ...r.partners, followed_at: r.created_at }))
      .filter((s: any) => s && s.status === "approved");
    return { stores };
  });

// Partner: my follower stats (total + week + month + level tier)
export const getPartnerFollowerStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data: partner } = await supabase
      .from("partners").select("id").eq("user_id", context.userId).maybeSingle();
    if (!partner) return { total: 0, week: 0, month: 0, tier: null as any };

    const sb = await publicClient();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ count: total }, { count: week }, { count: month }] = await Promise.all([
      sb.from("followers").select("id", { count: "exact", head: true }).eq("seller_id", partner.id),
      sb.from("followers").select("id", { count: "exact", head: true }).eq("seller_id", partner.id).gte("created_at", weekAgo),
      sb.from("followers").select("id", { count: "exact", head: true }).eq("seller_id", partner.id).gte("created_at", monthAgo),
    ]);
    const t = total ?? 0;
    let tier: { key: string; label: string; emoji: string } | null = null;
    if (t >= 5000) tier = { key: "diamante", label: "Diamante", emoji: "💎" };
    else if (t >= 1000) tier = { key: "ouro", label: "Ouro", emoji: "🥇" };
    else if (t >= 500) tier = { key: "prata", label: "Prata", emoji: "🥈" };
    else if (t >= 100) tier = { key: "bronze", label: "Bronze", emoji: "🥉" };
    return { total: t, week: week ?? 0, month: month ?? 0, tier };
  });
