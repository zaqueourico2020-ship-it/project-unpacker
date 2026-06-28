import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/disputa/abrir/$orderId")({
  head: () => ({ meta: [{ title: "Abrir disputa — Grupo GF" }, { name: "robots", content: "noindex" }] }),
  component: OpenDisputePage,
});

const REASONS = [
  { v: "nao_recebido", l: "Produto não recebido" },
  { v: "diferente_anunciado", l: "Produto diferente do anunciado" },
  { v: "com_defeito", l: "Produto com defeito" },
  { v: "reembolso", l: "Problema com reembolso" },
  { v: "outro", l: "Outro" },
];

function OpenDisputePage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [partnerOrder, setPartnerOrder] = useState<any>(null);
  const [reason, setReason] = useState("nao_recebido");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data: o } = await (supabase as any).from("orders").select("*").eq("id", orderId).maybeSingle();
      setOrder(o);
      const { data: po } = await (supabase as any).from("partner_orders").select("*").eq("order_id", orderId).maybeSingle();
      setPartnerOrder(po);
    })();
  }, [orderId]);

  const submit = async () => {
    setErr(""); setSending(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const { data: created, error } = await (supabase as any).from("disputes").insert({
        order_id: orderId,
        partner_order_id: partnerOrder?.id,
        partner_id: partnerOrder?.partner_id,
        customer_id: uid,
        reason, description,
      }).select().single();
      if (error) throw error;

      const urls: string[] = [];
      for (const f of files) {
        const key = `${created.id}/${Date.now()}-${f.name}`;
        const { error: upErr } = await (supabase as any).storage.from("dispute-attachments").upload(key, f);
        if (!upErr) {
          const { data: pub } = (supabase as any).storage.from("dispute-attachments").getPublicUrl(key);
          urls.push(pub.publicUrl);
        }
      }
      if (description || urls.length) {
        await (supabase as any).from("dispute_messages").insert({
          dispute_id: created.id, author_id: uid, author_role: "customer",
          message: description, attachments: urls,
        });
      }
      navigate({ to: "/" });
    } catch (e: any) {
      setErr(e.message ?? "Erro ao abrir disputa.");
    } finally { setSending(false); }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">🛡️ Abrir Disputa</h1>
      </div>
      {order && (
        <div className="mb-4 rounded-md border border-border bg-card p-3 text-sm">
          <div className="font-semibold">Pedido #{String(orderId).slice(0, 8)}</div>
          <div className="text-muted-foreground">Total: R$ {Number(order.total ?? 0).toFixed(2)}</div>
        </div>
      )}

      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Motivo</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            {REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Descrição</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5}
            placeholder="Explique o que aconteceu…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Anexar fotos (opcional)</span>
          <input type="file" multiple accept="image/*"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-xs" />
          <span className="mt-1 block text-xs text-muted-foreground">{files.length} arquivo(s)</span>
        </label>
        {err && <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{err}</div>}
        <button onClick={submit} disabled={sending || !description.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Send className="h-4 w-4" /> {sending ? "Enviando…" : "Abrir disputa"}
        </button>
        <p className="text-center text-xs text-muted-foreground">
          O vendedor terá 72 horas para responder. O valor da venda ficará bloqueado até a resolução.
        </p>
      </div>
    </div>
  );
}
