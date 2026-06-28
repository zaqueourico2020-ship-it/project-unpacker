import { useCallback, useEffect, useState } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listSellerConversations } from "@/lib/chat.functions";
import { ChatThread } from "@/components/ChatWidget";

export function SellerChat() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const fetchConvs = useServerFn(listSellerConversations);

  const refresh = useCallback(async () => {
    try {
      const r = await fetchConvs({});
      setConversations(r.conversations ?? []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [fetchConvs]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("seller-chat-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations" }, () => refresh())
      .subscribe();
    const interval = setInterval(refresh, 20000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [refresh]);

  return (
    <div className="grid gap-4 md:grid-cols-[320px_1fr]">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle className="h-4 w-4" /> Conversas
          </h2>
          <button onClick={refresh} aria-label="Atualizar" className="rounded-md p-1.5 hover:bg-accent">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {loading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
          {!loading && conversations.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma conversa ainda. Quando um cliente enviar mensagem, ela aparecerá aqui.
            </p>
          )}
          {conversations.map(c => (
            <button key={c.id} onClick={() => setSelected(c)}
              className={`block w-full border-b border-border px-4 py-3 text-left hover:bg-accent ${selected?.id === c.id ? "bg-accent" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{c.buyer_name || "Cliente"}</p>
                {Number(c.seller_unread) > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {c.seller_unread}
                  </span>
                )}
              </div>
              {c.product_name && <p className="truncate text-[11px] text-muted-foreground">Sobre: {c.product_name}</p>}
              <p className="truncate text-xs text-muted-foreground">{c.last_message || "Sem mensagens"}</p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(c.last_message_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {selected ? (
          <ChatThread
            key={selected.id}
            conversationId={selected.id}
            title={selected.buyer_name || "Cliente"}
            subtitle={selected.product_name ? `Sobre: ${selected.product_name}` : undefined}
            compact
          />
        ) : (
          <div className="flex h-[420px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Selecione uma conversa para responder ao cliente.
          </div>
        )}
      </div>
    </div>
  );
}
