import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdminAccess, getAdminDb } from "@/lib/admin-access";

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    const { data, error } = await db
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { orders: data ?? [] };
  });

const STATUS_NOTIFICATION: Record<string, { title: string; body: string }> = {
  approved: { title: "Pagamento aprovado ✅", body: "Recebemos a confirmação do pagamento do seu pedido." },
  preparing: { title: "Preparando envio 📦", body: "Seu pedido está sendo separado e embalado com cuidado." },
  shipped: { title: "Pedido em transporte 🚚", body: "Seu pedido saiu da nossa loja e está a caminho." },
  out_for_delivery: { title: "Saiu para entrega 🛵", body: "Seu pedido saiu para entrega e chega em breve!" },
  delivered: { title: "Pedido entregue 🎉", body: "Seu pedido foi entregue. Aproveite e avalie seus produtos!" },
  cancelled: { title: "Pedido cancelado", body: "Seu pedido foi cancelado. Fale com o suporte se tiver dúvidas." },
};

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "approved", "preparing", "shipped", "out_for_delivery", "delivered", "cancelled"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    const { data: order, error: readErr } = await db
      .from("orders")
      .select("id, user_id, status")
      .eq("id", data.id)
      .single();
    if (readErr) throw new Error(readErr.message);
    const { error } = await db
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Notificação automática para o cliente quando o status muda
    try {
      const notif = STATUS_NOTIFICATION[data.status];
      if (notif && order?.user_id && order.status !== data.status) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await (supabaseAdmin as any).from("notifications").insert({
          user_id: order.user_id,
          kind: "pedido",
          title: notif.title,
          body: notif.body,
          link: null,
        });
      }
    } catch (e) {
      console.warn("[orders] notification skipped:", (e as Error).message);
    }
    return { ok: true };
  });
