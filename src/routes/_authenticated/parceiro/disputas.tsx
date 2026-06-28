import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Clock, Send, Paperclip } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parceiro/disputas")({
  head: () => ({ meta: [{ title: "Disputas — Parceiro" }, { name: "robots", content: "noindex" }] }),
  component: PartnerDisputesPage,
});

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  aguardando_resposta: "Aguardando resposta",
  resolvida: "Resolvida",
  encerrada: "Encerrada",
};
const REASON_LABEL: Record<string, string> = {
  nao_recebido: "Produto não recebido",
  diferente_anunciado: "Produto diferente do anunciado",
  com_defeito: "Produto com defeito",
  reembolso: "Problema com reembolso",
  outro: "Outro",
};

function deadlineLabel(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Prazo encerrado";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m restantes`;
}

function PartnerDisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    const { data: partner } = await (supabase as any)
      .from("partners").select("id").eq("user_id", uid).maybeSingle();
    if (!partner) { setLoading(false); return; }
    const { data } = await (supabase as any)
      .from("disputes").select("*").eq("partner_id", partner.id)
      .order("created_at", { ascending: false });
    setDisputes(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openDispute = async (d: any) => {
    setSelected(d);
    const { data } = await (supabase as any)
      .from("dispute_messages").select("*").eq("dispute_id", d.id).order("created_at");
    setMessages(data ?? []);
    if (d.status === "aberta") {
      await (supabase as any).from("disputes").update({ status: "em_analise" }).eq("id", d.id);
    }
  };

  const sendReply = async () => {
    if (!selected || (!reply.trim() && files.length === 0)) return;
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user!.id;
    const urls: string[] = [];
    for (const f of files) {
      const key = `${selected.id}/${Date.now()}-${f.name}`;
      const { error } = await (supabase as any).storage.from("dispute-attachments").upload(key, f);
      if (!error) {
        const { data: pub } = (supabase as any).storage.from("dispute-attachments").getPublicUrl(key);
        urls.push(pub.publicUrl);
      }
    }
    await (supabase as any).from("dispute_messages").insert({
      dispute_id: selected.id, author_id: uid, author_role: "seller",
      message: reply, attachments: urls,
    });
    await (supabase as any).from("disputes").update({ status: "aguardando_resposta", updated_at: new Date().toISOString() })
      .eq("id", selected.id);
    setReply(""); setFiles([]);
    openDispute(selected);
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Central de Disputas</h1>
      </header>

      {disputes.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma disputa aberta. 🎉
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-[1fr,1.5fr]">
        <div className="space-y-2">
          {disputes.map((d) => (
            <button
              key={d.id}
              onClick={() => openDispute(d)}
              className={`block w-full rounded-md border p-3 text-left text-sm transition ${selected?.id === d.id ? "border-primary bg-accent" : "border-border hover:bg-accent"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">Pedido #{String(d.order_id ?? d.id).slice(0, 8)}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{STATUS_LABEL[d.status]}</span>
              </div>
              <div className="text-xs text-muted-foreground">{REASON_LABEL[d.reason]}</div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600">
                <Clock className="h-3 w-3" /> {deadlineLabel(d.seller_deadline)}
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="space-y-3 rounded-md border border-border bg-card p-4">
            <div>
              <div className="text-sm font-semibold">Motivo: {REASON_LABEL[selected.reason]}</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{selected.description}</p>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto border-t border-border pt-3">
              {messages.map((m) => (
                <div key={m.id} className={`rounded-md p-2 text-sm ${m.author_role === "seller" ? "ml-8 bg-primary/10" : "mr-8 bg-muted"}`}>
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">{m.author_role}</div>
                  {m.message && <div>{m.message}</div>}
                  {Array.isArray(m.attachments) && m.attachments.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary underline">
                      📎 Anexo {i + 1}
                    </a>
                  ))}
                </div>
              ))}
            </div>

            {selected.status !== "resolvida" && selected.status !== "encerrada" && (
              <div className="space-y-2 border-t border-border pt-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Escreva sua resposta ou proponha uma solução…"
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"
                  rows={3}
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                    <Paperclip className="h-3 w-3" /> Anexar fotos
                    <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                  </label>
                  <span className="text-xs text-muted-foreground">{files.length} arquivo(s)</span>
                  <button onClick={sendReply} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                    <Send className="h-3 w-3" /> Enviar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
