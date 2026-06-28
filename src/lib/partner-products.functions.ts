import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getApprovedPartner(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("partners")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Você não é um parceiro cadastrado.");
  if (data.status !== "approved") throw new Error("Seu cadastro de parceiro ainda não foi aprovado.");
  return data;
}

const VariantInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  sku: z.string().max(120).optional().nullable(),
  price: z.number().min(0).max(10_000_000),
  discount_price: z.number().min(0).max(10_000_000).optional().nullable(),
  stock: z.number().int().min(0).max(100_000_000),
  image_url: z.string().max(10_000_000).optional().nullable(),
  attributes: z.record(z.string(), z.any()).optional(),
});

const ProductInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(500),
  description: z.string().max(20_000).optional().nullable(),
  sku: z.string().max(120).optional().nullable(),
  price: z.number().min(0).max(10_000_000),
  discount_price: z.number().min(0).max(10_000_000).optional().nullable(),
  cost_price: z.number().min(0).max(10_000_000),
  stock_quantity: z.number().int().min(0).max(100_000_000),
  brand: z.string().max(200).optional().nullable(),
  category: z.string().max(200).optional().nullable(),
  subcategory: z.string().max(200).optional().nullable(),
  image_url: z.string().max(10_000_000).optional().nullable(),
  images: z.array(z.string().max(10_000_000)).max(20).optional(),
  notes: z.string().max(10_000).optional().nullable(),
  active: z.boolean().optional(),
  variants: z.array(VariantInput).max(100).optional(),
});

export const partnerListMyProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const partner = await getApprovedPartner(context.supabase, context.userId);
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("partner_products")
      .select("*, product_variants(*)")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { products: data ?? [], partner };
  });

export const partnerUpsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProductInput.parse(d))
  .handler(async ({ context, data }) => {
    const partner = await getApprovedPartner(context.supabase, context.userId);
    const supabase = context.supabase as any;

    const payload: any = {
      name: data.name,
      description: data.description || null,
      sku: data.sku || null,
      price: data.price,
      discount_price: data.discount_price ?? null,
      cost_price: data.cost_price,
      stock_quantity: data.stock_quantity,
      brand: data.brand || null,
      category: data.category || null,
      subcategory: data.subcategory || null,
      image_url: data.image_url || null,
      images: data.images ?? [],
      notes: data.notes || null,
      active: data.active ?? true,
    };

    let productId = data.id;
    if (productId) {
      const { error } = await supabase
        .from("partner_products")
        .update(payload)
        .eq("id", productId)
        .eq("partner_id", partner.id);
      if (error) {
        console.error("[partnerUpsertProduct] update error", error);
        throw new Error(`Falha ao atualizar produto: ${error.message}`);
      }
    } else {
      const { data: row, error } = await supabase
        .from("partner_products")
        .insert({ ...payload, partner_id: partner.id })
        .select("id")
        .single();
      if (error) {
        console.error("[partnerUpsertProduct] insert error", error);
        throw new Error(`Falha ao criar produto: ${error.message}`);
      }
      productId = row.id;
    }

    if (data.variants) {
      await supabase.from("product_variants").delete().eq("partner_product_id", productId);
      if (data.variants.length) {
        const rows = data.variants.map((v) => ({
          partner_product_id: productId,
          name: v.name,
          sku: v.sku || null,
          price: v.price,
          discount_price: v.discount_price ?? null,
          stock: v.stock,
          image_url: v.image_url || null,
          attributes: v.attributes ?? {},
        }));
        const { error } = await supabase.from("product_variants").insert(rows);
        if (error) throw new Error(error.message);
      }
    }

    return { ok: true, id: productId };
  });

export const partnerDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const partner = await getApprovedPartner(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("partner_products")
      .delete()
      .eq("id", data.id)
      .eq("partner_id", partner.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
