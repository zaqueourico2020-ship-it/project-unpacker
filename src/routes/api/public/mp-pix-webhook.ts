// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook PIX para depósitos da Carteira GF.
 * Configurar no painel do Mercado Pago em:
 *   https://<dominio>/api/public/mp-pix-webhook
 */
export const Route = createFileRoute("/api/public/mp-pix-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}) as any);
          const url = new URL(request.url);
          const topic = url.searchParams.get("type") || (body as any)?.type;
          const paymentId =
            url.searchParams.get("data.id") ||
            ((body as any)?.data?.id ? String((body as any).data.id) : null);
          if (topic !== "payment" || !paymentId) return new Response("ignored");

          const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
          if (!token) return new Response("missing token", { status: 500 });

          const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return new Response("mp fetch failed");
          const payment: any = await res.json();
          const requestId = payment.external_reference as string | undefined;
          const status = payment.status as string | undefined;
          if (!requestId) return new Response("no ref");

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: req } = await supabaseAdmin
            .from("pix_requests").select("*").eq("id", requestId).maybeSingle();
          if (!req || req.kind !== "deposit") return new Response("not a deposit");
          if (req.status === "approved") return new Response("already processed");

          const mpStatus =
            status === "approved" ? "approved"
              : status === "rejected" || status === "cancelled" ? "rejected"
              : "pending";

          await supabaseAdmin.from("pix_requests").update({
            status: mpStatus, mp_payment_id: String(paymentId), raw_response: payment,
          }).eq("id", requestId);

          if (mpStatus === "approved") {
            const { data: w } = await supabaseAdmin
              .from("wallets").select("id,available_balance").eq("user_id", req.user_id).single();
            await supabaseAdmin
              .from("wallets")
              .update({ available_balance: Number(w!.available_balance) + Number(req.amount) })
              .eq("id", w!.id);
            await supabaseAdmin.from("wallet_transactions").insert({
              wallet_id: w!.id, user_id: req.user_id,
              type: "pix_deposit", status: "completed",
              amount: req.amount,
              description: "Depósito PIX confirmado",
              reference_id: req.id,
            });
            await supabaseAdmin.from("notifications").insert({
              user_id: req.user_id, kind: "pix_deposit",
              title: "Depósito confirmado ✅",
              body: `R$ ${Number(req.amount).toFixed(2)} adicionados à sua Carteira GF.`,
              link: "/carteira",
            });
          }
          return new Response("ok");
        } catch (e) {
          console.error("[mp-pix-webhook]", e);
          return new Response("error", { status: 200 });
        }
      },
    },
  },
});