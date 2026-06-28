import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Image as ImageIcon, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { openConversation, sendChatMessage, markChatRead } from "@/lib/chat.functions";

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: "buyer" | "seller";
  sender_name: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  _imgUrl?: string | null;
};

async function resolveImage(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  try {
    const { data } = await supabase.storage.from("chat-images").createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/* ---------- Thread de mensagens (usado por comprador e vendedor) ---------- */
export function ChatThread({ conversationId, title, subtitle, onClose, compact }: {
  conversationId: string;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  compact?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendMessage = useServerFn(sendChatMessage);
  const markRead = useServerFn(markChatRead);
  const fileRef = useRef<HTMLInputElement>(null);

  const appendMessage = useCallback(async (raw: any) => {
    const msg: ChatMessage = { ...raw, _imgUrl: await resolveImage(raw.image_url) };
    setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!cancelled) setMyId(u.user?.id ?? null);
      const { data, error } = await (supabase as any)
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (cancelled) return;
      if (error) {
        setErr("Não foi possível carregar o histórico. Verifique se o banco de dados do chat já foi configurado.");
        setLoading(false);
        return;
      }
      const resolved = await Promise.all(
        ((data ?? []) as any[]).map(async m => ({ ...m, _imgUrl: await resolveImage(m.image_url) })),
      );
      if (!cancelled) {
        setMessages(resolved);
        setLoading(false);
      }
      try { await markRead({ data: { conversationId } }); } catch {}
    })();

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` },
        payload => {
          appendMessage(payload.new);
          markRead({ data: { conversationId } }).catch(() => {});
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId, appendMessage, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const doSend = async (imagePath?: string) => {
    const body = text.trim();
    if (!body && !imagePath) return;
    setSending(true);
    setErr(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const senderName = (u.user?.user_metadata as any)?.name || u.user?.email || "";
      const r = await sendMessage({ data: { conversationId, body: body || undefined, imagePath, senderName } });
      if (r?.message) appendMessage(r.message);
      setText("");
    } catch (e: any) {
      setErr(e?.message || "Falha ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setErr("Imagem muito grande (máx. 8MB)."); return; }
    setSending(true);
    setErr(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Faça login novamente.");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${conversationId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("chat-images").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      await doSend(path);
    } catch (er: any) {
      setErr(er?.message || "Falha ao enviar imagem.");
      setSending(false);
    }
  };

  return (
    <div className={`flex flex-col ${compact ? "h-[420px]" : "h-full"}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 bg-card">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Fechar chat"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-background/60 px-3 py-3">
        {loading && <p className="text-center text-xs text-muted-foreground">Carregando conversa…</p>}
        {!loading && messages.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Nenhuma mensagem ainda. Envie a primeira mensagem! 👋
          </p>
        )}
        {messages.map(m => {
          const mine = m.sender_id === myId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"
              }`}>
                {m._imgUrl && (
                  <a href={m._imgUrl} target="_blank" rel="noreferrer">
                    <img src={m._imgUrl} alt="Imagem enviada" className="mb-1 max-h-48 rounded-lg object-cover" />
                  </a>
                )}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                <p className={`mt-0.5 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {err && <p className="px-4 py-1 text-[11px] text-red-400">{err}</p>}

      <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2">
        <button onClick={() => fileRef.current?.click()} disabled={sending}
          aria-label="Enviar imagem"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent disabled:opacity-50">
          <ImageIcon size={16} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImage} />
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } }}
          placeholder="Escreva sua mensagem…"
          maxLength={2000}
          className="h-9 flex-1 rounded-full border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <button onClick={() => doSend()} disabled={sending || !text.trim()}
          aria-label="Enviar mensagem"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50">
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

/* ---------- Botão + modal do comprador ---------- */
export function ChatButton({ partnerId = null, sellerName = "Grupo GF", productId, productName, className }: {
  partnerId?: string | null;
  sellerName?: string;
  productId?: string;
  productName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const openConv = useServerFn(openConversation);

  const handleOpen = async () => {
    setErr(null);
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      window.location.href = "/auth";
      return;
    }
    setOpen(true);
    setLoading(true);
    try {
      const buyerName = (data.user.user_metadata as any)?.name || data.user.email || "";
      const isUuid = productId && /^[0-9a-f-]{36}$/i.test(productId);
      const r = await openConv({
        data: {
          partnerId,
          productId: isUuid ? productId : undefined,
          productName,
          buyerName,
        },
      });
      setConversation(r.conversation);
    } catch (e: any) {
      setErr("O chat ainda não está disponível. Tente novamente mais tarde.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={handleOpen}
        className={className ?? "w-full mt-3 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition"}>
        <MessageCircle size={17} /> 💬 Conversar com o vendedor
      </button>

      {open && (
        <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}>
          <div className="flex h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-background sm:h-[600px] sm:rounded-2xl"
            onClick={e => e.stopPropagation()}>
            {loading && <p className="p-6 text-center text-sm text-muted-foreground">Abrindo conversa…</p>}
            {err && (
              <div className="p-6 text-center">
                <p className="text-sm text-red-400">{err}</p>
                <button onClick={() => setOpen(false)} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm">Fechar</button>
              </div>
            )}
            {!loading && !err && conversation && (
              <ChatThread
                conversationId={conversation.id}
                title={`💬 ${sellerName}`}
                subtitle={productName ? `Sobre: ${productName}` : "Atendimento ao comprador"}
                onClose={() => setOpen(false)}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
