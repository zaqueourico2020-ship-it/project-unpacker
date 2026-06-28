import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdminAccess, getAdminDb } from "@/lib/admin-access";

const ProductInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  description: z.string().max(10_000).optional().nullable(),
  sku: z.string().max(64).optional().nullable(),
  price: z.number().min(0).max(1_000_000),
  cost_price: z.number().min(0).max(1_000_000),
  stock_quantity: z.number().min(0).max(10_000_000).transform((v) => Math.floor(v)),
  image_url: z.string().max(5_000_000).optional().nullable(),
  active: z.boolean().optional(),
  category: z.string().max(128).optional().nullable(),
  subcategory: z.string().max(128).optional().nullable(),
});


export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    const { data, error } = await db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { products: data ?? [] };
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProductInput.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    const payload: any = {
      name: data.name,
      sku: data.sku || null,
      price: data.price,
      cost_price: data.cost_price,
      stock_quantity: data.stock_quantity,
      image_url: data.image_url || null,
      active: data.active ?? true,
      category: data.category || null,
      subcategory: data.subcategory || null,
    };
    if (data.description !== undefined) payload.description = data.description || null;


    if (data.id) {
      const { error } = await db.from("products").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await db.from("products").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    const { error } = await db.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
