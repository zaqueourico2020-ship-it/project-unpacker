import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ===== Reputation / levels =====
export type PartnerLevel =
  | "iniciante" | "bronze" | "prata" | "ouro" | "diamante" | "elite";

export function computeLevel(opts: { sales: number; avgRating: number; cancelRate: number }): { key: PartnerLevel; label: string; emoji: string } {
  const { sales, avgRating, cancelRate } = opts;
  // Elite if very strong
  if (sales >= 100 && avgRating >= 4.8 && cancelRate <= 0.05) return { key: "elite", label: "Elite GF", emoji: "⭐" };
  if (sales > 2000) return { key: "diamante", label: "Diamante GF", emoji: "💎" };
  if (sales >= 501) return { key: "ouro", label: "Ouro GF", emoji: "🥇" };
  if (sales >= 101) return { key: "prata", label: "Prata GF", emoji: "🥈" };
  if (sales >= 11) return { key: "bronze", label: "Bronze GF", emoji: "🥉" };
  return { key: "iniciante", label: "Iniciante GF", emoji: "🟫" };
}

async function getMyPartner(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("partners").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Parceiro não encontrado.");
  return data;
}

// ===== Dashboard =====
export const getPartnerDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const partner = await getMyPartner(context.supabase, context.userId);
    const supabase = context.supabase as any;
    const { data: orders } = await supabase
      .from("partner_orders").select("status,total,partner_net,commission_amount,created_at")
      .eq("partner_id", partner.id);
    const list = orders ?? [];
    const sales = list.filter((o: any) => o.status === "delivered").length;
    const totalOrders = list.length;
    const faturamento = list.filter((o: any) => o.status !== "cancelled" && o.status !== "refunded")
      .reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const saldoDisponivel = list.filter((o: any) => o.status === "delivered")
      .reduce((s: number, o: any) => s + Number(o.partner_net || 0), 0);
    const saldoPendente = list.filter((o: any) => ["pending","paid","preparing","shipped"].includes(o.status))
      .reduce((s: number, o: any) => s + Number(o.partner_net || 0), 0);
    const cancelled = list.filter((o: any) => o.status === "cancelled").length;
    const cancelRate = totalOrders ? cancelled / totalOrders : 0;
    const level = computeLevel({ sales, avgRating: 5, cancelRate });
    return {
      partner,
      stats: { sales, totalOrders, faturamento, saldoDisponivel, saldoPendente, cancelRate },
      level,
    };
  });

// ===== Orders list =====
export const getPartnerOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    status: z.enum(["pending","paid","preparing","shipped","delivered","cancelled","all"]).optional(),
  }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const partner = await getMyPartner(context.supabase, context.userId);
    let q: any = (context.supabase as any)
      .from("partner_orders").select("*")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false });
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { orders: rows ?? [] };
  });

export const updatePartnerOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["preparing","shipped","delivered","cancelled"]),
    tracking_code: z.string().max(120).optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const partner = await getMyPartner(context.supabase, context.userId);
    const patch: any = { status: data.status };
    if (data.tracking_code !== undefined) patch.tracking_code = data.tracking_code;
    if (data.status === "shipped") patch.shipped_at = new Date().toISOString();
    if (data.status === "delivered") patch.delivered_at = new Date().toISOString();
    const { error } = await (context.supabase as any)
      .from("partner_orders").update(patch)
      .eq("id", data.id).eq("partner_id", partner.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Minha Loja =====
const StoreUpdate = z.object({
  nome_loja: z.string().min(2).max(120).optional(),
  descricao: z.string().max(2000).optional().nullable(),
  logo_url: z.string().max(5_000_000).optional().nullable(),
  banner_url: z.string().max(5_000_000).optional().nullable(),
  cover_url: z.string().max(5_000_000).optional().nullable(),
  store_banners: z.array(z.string().max(5_000_000)).max(8).optional(),
  direct_checkout_enabled: z.boolean().optional(),
  telefone: z.string().max(30).optional(),
  social: z.object({
    whatsapp: z.string().max(40).optional().nullable(),
    instagram: z.string().max(120).optional().nullable(),
    facebook: z.string().max(120).optional().nullable(),
    site: z.string().max(200).optional().nullable(),
  }).optional(),
});

export const updatePartnerStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StoreUpdate.parse(d))
  .handler(async ({ context, data }) => {
    const partner = await getMyPartner(context.supabase, context.userId);
    const patch: any = {};
    if (data.nome_loja !== undefined) patch.nome_loja = data.nome_loja;
    if (data.descricao !== undefined) patch.descricao = data.descricao;
    if (data.logo_url !== undefined) patch.logo_url = data.logo_url;
    if (data.banner_url !== undefined) patch.banner_url = data.banner_url;
    if (data.cover_url !== undefined) patch.cover_url = data.cover_url;
    if (data.store_banners !== undefined) patch.store_banners = data.store_banners;
    if (data.direct_checkout_enabled !== undefined) patch.direct_checkout_enabled = data.direct_checkout_enabled;
    if (data.telefone !== undefined) patch.telefone = data.telefone;
    if (data.social) {
      const endereco = (partner.endereco ?? {}) as any;
      patch.endereco = { ...endereco, social: { ...(endereco.social ?? {}), ...data.social } };
    }
    const { error } = await (context.supabase as any)
      .from("partners").update(patch).eq("id", partner.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Public store page =====
export const getStoreBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
    const admin = createClient(url, key, { auth: { persistSession: false } }) as any;
    const { data: partner, error } = await admin
      .from("partners")
      .select("id, slug, nome_loja, descricao, logo_url, banner_url, endereco, created_at, status, verified, reliable_shipping, level_manual")
      .eq("slug", data.slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!partner || partner.status !== "approved") return { store: null, products: [], stats: null, level: null };

    const [{ data: prods }, { data: orders }] = await Promise.all([
      admin.from("partner_products")
        .select("id, name, description, price, discount_price, brand, images, image_url, stock_quantity, category, subcategory, active, product_variants(id,name,sku,price,discount_price,stock,image_url,attributes)")
        .eq("partner_id", partner.id).eq("active", true)
        .order("created_at", { ascending: false }).limit(200),
      admin.from("partner_orders")
        .select("status,total").eq("partner_id", partner.id),
    ]);

    const list = orders ?? [];
    const sales = list.filter((o: any) => o.status === "delivered").length;
    const cancelled = list.filter((o: any) => o.status === "cancelled").length;
    const cancelRate = list.length ? cancelled / list.length : 0;
    const level = computeLevel({ sales, avgRating: 5, cancelRate });
    return {
      store: partner,
      products: prods ?? [],
      stats: { sales, totalOrders: list.length, cancelRate, avgRating: 5 },
      level,
    };
  });

// ===== Listing of approved partners for homepage section =====
export const listFeaturedPartners = createServerFn({ method: "GET" })
  .handler(async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await (sb as any)
      .from("partners")
      .select("id, slug, nome_loja, logo_url, banner_url")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw new Error(error.message);
    return { partners: data ?? [] };
  });

// ===== Carteira GF: saldos + saques =====
export const getPartnerWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const partner = await getMyPartner(context.supabase, context.userId);
    const supabase = context.supabase as any;
    const [{ data: payouts }, { data: pOrders }] = await Promise.all([
      supabase.from("partner_payouts").select("*").eq("partner_id", partner.id).order("created_at", { ascending: false }),
      supabase.from("partner_orders").select("status,total,commission_amount,partner_net,created_at").eq("partner_id", partner.id),
    ]);
    const list = (payouts ?? []) as any[];
    const now = Date.now();
    const disponivel = list
      .filter((p) => p.status === "pending" && p.available_at && new Date(p.available_at).getTime() <= now)
      .concat(list.filter((p) => p.status === "available"))
      .reduce((s, p) => s + Number(p.net_amount || 0), 0);
    const pendente = list
      .filter((p) => p.status === "pending" && (!p.available_at || new Date(p.available_at).getTime() > now))
      .reduce((s, p) => s + Number(p.net_amount || 0), 0);
    const sacado = list.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.net_amount || 0), 0);
    const processando = list.filter((p) => p.status === "processing").reduce((s, p) => s + Number(p.net_amount || 0), 0);
    const totalBruto = (pOrders ?? []).reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const totalComissao = (pOrders ?? []).reduce((s: number, o: any) => s + Number(o.commission_amount || 0), 0);
    return {
      partner,
      saldos: { disponivel, pendente, processando, sacado, totalBruto, totalComissao },
      payouts: list,
      orders: pOrders ?? [],
    };
  });

export const requestPartnerPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    amount: z.number().min(10).max(1_000_000),
    method: z.enum(["pix", "ted"]).default("pix"),
    pix_key: z.string().max(200).optional().nullable(),
    bank_info: z.string().max(500).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const partner = await getMyPartner(context.supabase, context.userId);
    const supabase = context.supabase as any;
    const { data: payouts } = await supabase.from("partner_payouts").select("*").eq("partner_id", partner.id);
    const now = Date.now();
    const disponivel = (payouts ?? [])
      .filter((p: any) => (p.status === "pending" && p.available_at && new Date(p.available_at).getTime() <= now) || p.status === "available")
      .reduce((s: number, p: any) => s + Number(p.net_amount || 0), 0);
    if (data.amount > disponivel + 0.0001) {
      throw new Error(`Saldo disponível: R$ ${disponivel.toFixed(2)}. Solicitação ultrapassa o disponível.`);
    }
    const ref = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: row, error } = await supabase.from("partner_payouts").insert({
      partner_id: partner.id,
      gross_amount: 0, commission_amount: 0, net_amount: -data.amount,
      status: "processing",
      payout_method: data.method,
      payout_reference: ref,
      notes: [data.pix_key ? `PIX: ${data.pix_key}` : null, data.bank_info, data.notes].filter(Boolean).join(" | ") || null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row?.id, reference: ref };
  });
