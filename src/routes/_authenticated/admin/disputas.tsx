import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Check, X, DollarSign } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/disputas")({
  head: () => ({ meta: [{ title: "Disputas — Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminDisputesPage,
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

function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [partial, setPartial] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    let q = (supabase as any).from("disputes").select("*, partners(nome_loja)")
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setDisputes(data ?? []);
  };

  useEffect(() => { load(); }, [filter]);

  const open = async (d: any) => {
    setSelected(d);
    const { data } = await (supabase as any)
      .from("dispute_messages").select("*").eq("dispute_id", d.id).order("created_at");
    setMessages(data ?? []);
  };

  const resolve = async (resolution: string, amount?: number) => {
    if (!selected) return;
    const { error } = await (supabase as any).rpc("resolve_dispute", {
      _dispute_id: selected.id, _resolution: resolution, _refund_amount: amount ?? null,
    });
    if (error) { alert("Erro: " + error.message); return; }
    setSelected(null); setPartial("");
    load();
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Operações → Disputas</h1>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-sm">
          <option value="all">Todas</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </header>

      <div className="grid gap-3 md:grid-cols-[1fr,1.5fr]">
        <div className="space-y-2">
          {disputes.length === 0 && <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma disputa.</div>}
          {disputes.map((d) => (
            <button key={d.id} onClick={() => open(d)} className={`block w-full rounded-md border p-3 text-left text-sm ${selected?.id === d.id ? "border-primary bg-accent" : "border-border hover:bg-accent"}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">#{String(d.order_id ?? d.id).slice(0, 8)}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{STATUS_LABEL[d.status]}</span>
              </div>
              <div className="text-xs text-muted-foreground">Loja: {d.partners?.nome_loja ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{REASON_LABEL[d.reason]}</div>
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
                <div key={m.id} className={`rounded-md p-2 text-sm ${m.author_role === "seller" ? "ml-8 bg-primary/10" : m.author_role === "customer" ? "mr-8 bg-muted" : "bg-amber-50"}`}>
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">{m.author_role}</div>
                  {m.message && <div>{m.message}</div>}
                  {Array.isArray(m.attachments) && m.attachments.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary underline">📎 Anexo {i + 1}</a>
                  ))}
                </div>
              ))}
            </div>

            {selected.status !== "resolvida" && selected.status !== "encerrada" && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="text-xs font-semibold">Decisão final:</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => resolve("liberar_vendedor")} className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">
                    <Check className="h-3 w-3" /> Liberar para vendedor
                  </button>
                  <button onClick={() => resolve("reembolso_total")} className="inline-flex items-center gap-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground">
                    <X className="h-3 w-3" /> Reembolso total
                  </button>
                  <div className="flex items-center gap-1">
                    <input value={partial} onChange={(e) => setPartial(e.target.value)} placeholder="R$"
                      className="w-20 rounded-md border border-input bg-background px-2 py-1 text-xs" />
                    <button onClick={() => resolve("reembolso_parcial", parseFloat(partial))}
                      disabled={!partial || isNaN(parseFloat(partial))}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50">
                      <DollarSign className="h-3 w-3" /> Reembolso parcial
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
