import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getProductsForCompare = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(4) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: products, error } = await admin
      .from("partner_products")
      .select("id, name, description, price, image_url, category, subcategory, stock_quantity, weight_kg, length_cm, width_cm, height_cm, partner_id")
      .in("id", data.ids)
      .eq("active", true)
      .eq("approval_status", "approved");
    if (error) throw new Error(error.message);

    const partnerIds = Array.from(new Set((products ?? []).map((p: any) => p.partner_id)));
    let partners: any[] = [];
    if (partnerIds.length) {
      const { data: pp } = await admin
        .from("partners")
        .select("id, nome_loja, slug, logo_url, verified, reliable_shipping, status")
        .in("id", partnerIds);
      partners = pp ?? [];
    }
    const byPartner = new Map(partners.map((p) => [p.id, p]));

    // sales per partner for tier
    let salesByPartner = new Map<string, number>();
    if (partnerIds.length) {
      const { data: orders } = await admin
        .from("partner_orders")
        .select("partner_id,status")
        .in("partner_id", partnerIds);
      (orders ?? []).forEach((o: any) => {
        if (o.status === "delivered") {
          salesByPartner.set(o.partner_id, (salesByPartner.get(o.partner_id) ?? 0) + 1);
        }
      });
    }

    const enriched = (products ?? []).map((p: any) => ({
      ...p,
      partner: byPartner.get(p.partner_id) ?? null,
      partner_sales: salesByPartner.get(p.partner_id) ?? 0,
    }));

    return { products: enriched };
  });
