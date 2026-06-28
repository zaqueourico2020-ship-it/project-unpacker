// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";

/**
 * Mercado Pago webhook — configure no painel MP:
 *   https://<dominio>/api/public/mp-webhook
 *
 * Em payment.approved:
 *  - atualiza orders.status='approved', paid_at, mp_payment_id
 *  - credita 10% de cashback (válido 30 dias) para o user_id do pedido
 *  - cria notificações para o cliente
 */
export const Route = createFileRoute("/api/public/mp-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({} as any));
          const url = new URL(request.url);
          const topic = url.searchParams.get("type") || url.searchParams.get("topic") || (body as any)?.type;
          const paymentId =
            url.searchParams.get("data.id") ||
            ((body as any)?.data?.id ? String((body as any).data.id) : null) ||
            ((body as any)?.resource ? String((body as any).resource).split("/").pop() : null);

          if (topic !== "payment" || !paymentId) {
            return new Response("ignored", { status: 200 });
          }

          const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
          if (!token) return new Response("missing token", { status: 500 });

          const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return new Response("mp fetch failed", { status: 200 });
          const payment: any = await res.json();

          const orderId = payment.external_reference as string | undefined;
          const status = payment.status as string | undefined;
          if (!orderId) return new Response("no ref", { status: 200 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as any;

          const internalStatus =
            status === "approved" ? "approved"
              : status === "pending" || status === "in_process" ? "pending"
              : status === "cancelled" || status === "rejected" ? "cancelled"
              : null;

          const update: any = { mp_payment_id: String(paymentId) };
          if (internalStatus) update.status = internalStatus;
          if (payment.payment_method_id) update.payment_method = String(payment.payment_method_id);
          if (payment.payment_type_id) update.payment_type = String(payment.payment_type_id);
          if (status === "approved") update.paid_at = new Date().toISOString();

          // Buscar pedido atual para calcular lucro a partir dos itens
          const { data: current } = await admin
            .from("orders")
            .select("id,user_id,total,items,cost_total")
            .eq("id", orderId)
            .maybeSingle();
          if (current && status === "approved") {
            const items = (current.items ?? []) as any[];
            const costTotal = items.reduce(
              (s, i) => s + (Number(i.cost) || 0) * (Number(i.qty) || 0),
              0,
            );
            update.cost_total = costTotal;
            update.profit = Math.max(0, Number(current.total) - costTotal);
          }

          const { data: order, error: updErr } = await admin
            .from("orders")
            .update(update)
            .eq("id", orderId)
            .select("id,user_id,total")
            .single();
          if (updErr) {
            console.error("[mp-webhook] order update", updErr);
            return new Response("order update failed", { status: 200 });
          }

          if (status === "approved" && order?.user_id) {
            const { data: existing } = await admin
              .from("cashback_credits")
              .select("id")
              .eq("order_id", order.id)
              .maybeSingle();
            if (!existing) {
              const amount = Math.round(Number(order.total) * 0.10 * 100) / 100;
              const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
              await admin.from("cashback_credits").insert({
                user_id: order.user_id,
                order_id: order.id,
                amount,
                expires_at: expires,
                status: "active",
              });
              await admin.from("notifications").insert([
                {
                  user_id: order.user_id,
                  kind: "payment_approved",
                  title: "Pagamento aprovado ✅",
                  body: `Seu pedido foi confirmado. Total R$ ${Number(order.total).toFixed(2)}.`,
                },
                {
                  user_id: order.user_id,
                  kind: "cashback_credit",
                  title: `Você ganhou R$ ${amount.toFixed(2)} de cashback 🎁`,
                  body: "Disponível por 30 dias. Use em sua próxima compra. Após 30 dias o saldo expira.",
                },
              ]);
            }
          } else if (status === "rejected" || status === "cancelled") {
            if (order?.user_id) {
              await admin.from("notifications").insert({
                user_id: order.user_id,
                kind: "payment_failed",
                title: "Pagamento não aprovado",
                body: "Tente novamente ou escolha outra forma de pagamento.",
              });
            }
          }

          // ===== Carteira GF: split por parceiro + payout 12/88 =====
          if (status === "approved" && current) {
            const items = (current.items ?? []) as any[];
            const productIds = items.map((i: any) => i.productId).filter((x: any) => typeof x === "string");
            if (productIds.length > 0) {
              const { data: pps } = await admin
                .from("partner_products")
                .select("id, partner_id, price")
                .in("id", productIds);
              const byPartner = new Map<string, { items: any[]; subtotal: number }>();
              for (const it of items) {
                const pp = (pps ?? []).find((p: any) => p.id === it.productId);
                if (!pp) continue;
                const line = Number(it.price) * Number(it.qty);
                const cur = byPartner.get(pp.partner_id) ?? { items: [], subtotal: 0 };
                cur.items.push({ ...it, partner_product_id: pp.id });
                cur.subtotal += line;
                byPartner.set(pp.partner_id, cur);
              }
              const shipping_address = {
                zip: (current as any).zip, street: (current as any).street, number: (current as any).number,
                complement: (current as any).complement, neighborhood: (current as any).neighborhood,
                city: (current as any).city, state: (current as any).state,
              };
              for (const [partner_id, grp] of byPartner.entries()) {
                const { data: existingPo } = await admin
                  .from("partner_orders")
                  .select("id").eq("order_id", order.id).eq("partner_id", partner_id).maybeSingle();
                if (existingPo) continue;
                const total = grp.subtotal;
                const commission_rate = 12;
                const commission_amount = Math.round(total * 0.12 * 100) / 100;
                const partner_net = Math.round((total - commission_amount) * 100) / 100;
                const { data: poRow } = await admin.from("partner_orders").insert({
                  order_id: order.id, partner_id,
                  customer_user_id: order.user_id,
                  customer_name: (current as any).customer_name ?? "Cliente",
                  customer_phone: (current as any).customer_phone ?? null,
                  customer_email: (current as any).customer_email ?? null,
                  items: grp.items, shipping_address,
                  subtotal: grp.subtotal, total, shipping_cost: 0,
                  commission_rate, commission_amount, partner_net,
                  status: "paid",
                }).select("id").single();
                // Payout pending → available em 7 dias
                if (poRow?.id) {
                  await admin.from("partner_payouts").insert({
                    partner_id, partner_order_id: poRow.id,
                    gross_amount: total, commission_amount, net_amount: partner_net,
                    status: "pending",
                    available_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  });
                  // baixa de estoque
                  for (const it of grp.items) {
                    if (it.partner_product_id) {
                      await admin.rpc("decrement_partner_stock", { _id: it.partner_product_id, _qty: it.qty }).then(
                        () => {},
                        async () => {
                          const { data: pp } = await admin.from("partner_products").select("stock_quantity").eq("id", it.partner_product_id).maybeSingle();
                          if (pp) await admin.from("partner_products").update({ stock_quantity: Math.max(0, Number(pp.stock_quantity) - Number(it.qty)) }).eq("id", it.partner_product_id);
                        },
                      );
                    }
                  }
                  // notificar parceiro
                  const { data: partnerRow } = await admin.from("partners").select("user_id").eq("id", partner_id).maybeSingle();
                  if (partnerRow?.user_id) {
                    await admin.from("notifications").insert({
                      user_id: partnerRow.user_id, kind: "partner_sale",
                      title: "Nova venda 🎉",
                      body: `Venda de R$ ${total.toFixed(2)} confirmada. Líquido R$ ${partner_net.toFixed(2)} (após 7 dias).`,
                      link: "/parceiro/pedidos",
                    });
                  }
                }
              }
            }
          }

          return new Response("ok", { status: 200 });
        } catch (e: any) {
          console.error("[mp-webhook]", e);
          return new Response("error", { status: 200 });
        }
      },
    },
  },
});