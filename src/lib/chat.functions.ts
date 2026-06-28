import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* Chat em tempo real entre comprador e vendedor.
   partner_id NULL = conversa com a loja oficial (Grupo GF). */

export const openConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      partnerId: z.string().uuid().nullable().optional(),
      productId: z.string().uuid().optional(),
      productName: z.string().max(200).optional(),
      buyerName: z.string().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    const partnerId = data.partnerId ?? null;

    let q = supabase.from("chat_conversations").select("*").eq("buyer_id", userId);
    q = partnerId ? q.eq("partner_id", partnerId) : q.is("partner_id", null);
    const { data: existing, error: selErr } = await q.maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (existing) {
      if (data.productName && existing.product_name !== data.productName) {
        await supabase.from("chat_conversations")
          .update({ product_id: data.productId ?? null, product_name: data.productName })
          .eq("id", existing.id);
        existing.product_name = data.productName;
      }
      return { conversation: existing };
    }

    const { data: inserted, error: insErr } = await supabase
      .from("chat_conversations")
      .insert({
        buyer_id: userId,
        buyer_name: data.buyerName ?? "",
        partner_id: partnerId,
        product_id: data.productId ?? null,
        product_name: data.productName ?? null,
      })
      .select()
      .single();
    if (insErr) {
      // corrida com índice único: tentar buscar de novo
      let q2 = supabase.from("chat_conversations").select("*").eq("buyer_id", userId);
      q2 = partnerId ? q2.eq("partner_id", partnerId) : q2.is("partner_id", null);
      const { data: again } = await q2.maybeSingle();
      if (again) return { conversation: again };
      throw new Error(insErr.message);
    }
    return { conversation: inserted };
  });

export const listBuyerConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("chat_conversations")
      .select("*")
      .eq("buyer_id", context.userId)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) {
      console.warn("[chat] list buyer skipped:", error.message);
      return { conversations: [] as any[] };
    }
    return { conversations: (data ?? []) as any[] };
  });

export const listSellerConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    try {
      const { data: partner } = await supabase
        .from("partners").select("id").eq("user_id", userId).maybeSingle();

      let q = supabase.from("chat_conversations").select("*");
      if (partner?.id) q = q.eq("partner_id", partner.id);
      else q = q.is("partner_id", null); // loja oficial: RLS garante admin/owner
      const { data, error } = await q.order("last_message_at", { ascending: false }).limit(200);
      if (error) {
        console.warn("[chat] list seller skipped:", error.message);
        return { conversations: [] as any[], partnerId: partner?.id ?? null };
      }
      return { conversations: (data ?? []) as any[], partnerId: partner?.id ?? null };
    } catch (e: any) {
      console.warn("[chat] list seller failed:", e?.message);
      return { conversations: [] as any[], partnerId: null };
    }
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      body: z.string().max(2000).optional(),
      imagePath: z.string().max(500).optional(),
      senderName: z.string().max(120).optional(),
    }).refine(v => (v.body && v.body.trim().length > 0) || v.imagePath, { message: "Mensagem vazia" }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;

    const { data: conv, error: convErr } = await supabase
      .from("chat_conversations").select("*").eq("id", data.conversationId).maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Conversa não encontrada.");

    const isBuyer = conv.buyer_id === userId;
    const role = isBuyer ? "buyer" : "seller";

    const { data: msg, error: msgErr } = await supabase
      .from("chat_messages")
      .insert({
        conversation_id: conv.id,
        sender_id: userId,
        sender_role: role,
        sender_name: data.senderName ?? "",
        body: data.body?.trim() || null,
        image_url: data.imagePath ?? null,
      })
      .select()
      .single();
    if (msgErr) throw new Error(msgErr.message);

    const preview = data.body?.trim() ? data.body.trim().slice(0, 120) : "📷 Imagem";
    const updates: any = { last_message: preview, last_message_at: new Date().toISOString() };
    if (isBuyer) updates.seller_unread = Number(conv.seller_unread ?? 0) + 1;
    else updates.buyer_unread = Number(conv.buyer_unread ?? 0) + 1;
    await supabase.from("chat_conversations").update(updates).eq("id", conv.id);

    // Notificações para o destinatário (best effort)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;
      const title = "💬 Nova mensagem no chat";
      const link = isBuyer ? (conv.partner_id ? "/parceiro/mensagens" : "/admin/chat") : "/";
      const recipients: string[] = [];
      if (isBuyer) {
        if (conv.partner_id) {
          const { data: p } = await admin.from("partners").select("user_id").eq("id", conv.partner_id).maybeSingle();
          if (p?.user_id) recipients.push(p.user_id);
        } else {
          const { data: admins } = await admin.from("user_roles").select("user_id").in("role", ["admin", "owner"]);
          for (const r of (admins ?? []) as any[]) {
            if (!recipients.includes(r.user_id)) recipients.push(r.user_id);
          }
        }
      } else {
        recipients.push(conv.buyer_id);
      }
      if (recipients.length > 0) {
        await admin.from("notifications").insert(
          recipients.map(uid => ({ user_id: uid, kind: "chat", title, body: preview, link })),
        );
      }
    } catch (e: any) {
      console.warn("[chat] notification skipped:", e?.message);
    }

    return { message: msg };
  });

export const markChatRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d),)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    const { data: conv } = await supabase
      .from("chat_conversations").select("*").eq("id", data.conversationId).maybeSingle();
    if (!conv) return { ok: false };
    const isBuyer = conv.buyer_id === userId;
    const updates = isBuyer ? { buyer_unread: 0 } : { seller_unread: 0 };
    await supabase.from("chat_conversations").update(updates).eq("id", conv.id);
    await supabase.from("chat_messages")
      .update({ read: true })
      .eq("conversation_id", conv.id)
      .eq("sender_role", isBuyer ? "seller" : "buyer")
      .eq("read", false);
    return { ok: true };
  });
