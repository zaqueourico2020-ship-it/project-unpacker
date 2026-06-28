import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const ItemSchema = z.object({
  name: z.string().min(1).max(255),
  qty: z.number().int().min(1).max(999),
  price: z.number().min(0).max(1_000_000),
  image: z.string().url().optional(),
  productId: z.string().uuid().optional(),
});


const InputSchema = z.object({
  items: z.array(ItemSchema).min(1).max(50),
  couponCode: z.string().max(64).optional(),
  discount: z.number().min(0).max(1_000_000).optional(),
  cashbackAmount: z.number().min(0).max(1_000_000).optional(),
  userId: z.string().uuid().optional(),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(30).refine((v) => v.replace(/\D/g, "").length >= 8, {
    message: "Telefone inválido",
  }),
  customerEmail: z.string().email().max(255).optional().or(z.literal("")),
  recipientName: z.string().min(1).max(120),
  recipientPhone: z.string().max(30).refine((v) => v.replace(/\D/g, "").length >= 8, {
    message: "Telefone inválido",
  }),
  zip: z.string().min(5).max(15),
  street: z.string().min(1).max(200),
  number: z.string().min(1).max(20),
  complement: z.string().max(120).optional().or(z.literal("")),
  neighborhood: z.string().min(1).max(120),
  city: z.string().min(1).max(120),
  state: z.string().min(2).max(60),
  reference: z.string().max(255).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export const createCheckout = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const subtotal = data.items.reduce((s, i) => s + i.price * i.qty, 0);
    const couponDiscount = data.discount && data.discount > 0 ? Math.min(data.discount, subtotal) : 0;
    let cashbackToUse = data.cashbackAmount && data.cashbackAmount > 0
      ? Math.min(data.cashbackAmount, Math.max(0, subtotal - couponDiscount))
      : 0;

    // Validate cashback against DB (server is source of truth)
    if (cashbackToUse > 0 && data.userId) {
      const { data: credits } = await admin
        .from("cashback_credits")
        .select("amount,used_amount,status,expires_at")
        .eq("user_id", data.userId)
        .eq("status", "active");
      const available = ((credits ?? []) as any[])
        .filter((c: any) => new Date(c.expires_at) > new Date())
        .reduce((s: number, c: any) => s + Number(c.amount) - Number(c.used_amount), 0);
      cashbackToUse = Math.min(cashbackToUse, available);
    } else {
      cashbackToUse = 0;
    }

    const totalDiscount = couponDiscount + cashbackToUse;
    const total = Math.max(0, subtotal - totalDiscount);

    // Enriquecer items com snapshot de custo (cost) a partir da tabela products
    const productIds = Array.from(new Set(data.items.map((i) => i.productId).filter(Boolean) as string[]));
    let costMap = new Map<string, number>();
    if (productIds.length > 0) {
      const { data: prods } = await admin.from("products").select("id,cost_price").in("id", productIds);
      costMap = new Map(((prods ?? []) as any[]).map((p) => [p.id as string, Number(p.cost_price) || 0]));
    }
    const itemsWithCost = data.items.map((i) => ({
      ...i,
      cost: i.productId ? (costMap.get(i.productId) ?? 0) : 0,
    }));
    const cost_total = itemsWithCost.reduce((s, i) => s + (i.cost || 0) * i.qty, 0);

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        customer_email: data.customerEmail || null,
        recipient_name: data.recipientName,
        recipient_phone: data.recipientPhone,
        zip: data.zip,
        street: data.street,
        number: data.number,
        complement: data.complement || null,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        reference: data.reference || null,
        notes: data.notes || null,
        items: itemsWithCost,
        subtotal,
        discount: totalDiscount,
        total,
        cost_total,
        profit: 0,
        coupon_code: data.couponCode || null,
        status: "pending",
        user_id: data.userId ?? null,
      })
      .select("id")
      .single();


    if (orderErr || !order) {
      console.error("Order insert error:", orderErr);
      return { url: null as string | null, orderId: null as string | null, error: "Falha ao salvar pedido." };
    }

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) {
      return { url: null, orderId: order.id, error: "Mercado Pago não está configurado." };
    }

    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const host = getRequestHost() ?? "localhost:3000";
    const origin = `${proto}://${host}`;
    const factor = subtotal > 0 ? total / subtotal : 1;

    const mpItems = data.items.map((i) => ({
      title: i.name.slice(0, 250),
      quantity: i.qty,
      unit_price: Math.round(i.price * factor * 100) / 100,
      currency_id: "BRL",
      picture_url: i.image,
    }));

    const publicBase = process.env.PUBLIC_SITE_URL || origin;

    const body = {
      items: mpItems,
      external_reference: order.id,
      back_urls: {
        success: `${origin}/?status=approved&order=${order.id}`,
        pending: `${origin}/?status=pending&order=${order.id}`,
        failure: `${origin}/?status=failure&order=${order.id}`,
      },
      auto_return: "approved",
      statement_descriptor: "GRUPO GF",
      notification_url: `${publicBase}/api/public/mp-webhook`,
      payer: data.customerEmail ? { email: data.customerEmail } : undefined,
    };

    try {
      const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("Mercado Pago error:", res.status, text);
        return { url: null, orderId: order.id, error: `Falha ao criar pagamento (${res.status}).` };
      }
      const json = (await res.json()) as { id?: string; init_point?: string; sandbox_init_point?: string };
      const url = json.init_point ?? json.sandbox_init_point ?? null;
      if (json.id) {
        await admin.from("orders").update({ mp_preference_id: json.id }).eq("id", order.id);
      }
      // Reserve cashback by consuming credits now; if payment fails the webhook will not refund — keep it simple
      if (cashbackToUse > 0 && data.userId) {
        const { data: credits } = await admin
          .from("cashback_credits")
          .select("*")
          .eq("user_id", data.userId)
          .eq("status", "active")
          .order("expires_at", { ascending: true });
        let remaining = cashbackToUse;
        for (const c of (credits ?? []) as any[]) {
          if (remaining <= 0) break;
          const avail = Number(c.amount) - Number(c.used_amount);
          if (avail <= 0) continue;
          const take = Math.min(avail, remaining);
          const newUsed = Number(c.used_amount) + take;
          const newStatus = newUsed >= Number(c.amount) ? "used" : "active";
          await admin.from("cashback_credits")
            .update({ used_amount: newUsed, status: newStatus, updated_at: new Date().toISOString() })
            .eq("id", c.id);
          remaining -= take;
        }
      }
      return { url, orderId: order.id, error: url ? null : "Resposta inválida do Mercado Pago.", cashbackUsed: cashbackToUse };

    } catch (err) {
      console.error("Mercado Pago request failed:", err);
      return { url: null, orderId: order.id, error: "Falha ao iniciar pagamento." };
    }
  });
