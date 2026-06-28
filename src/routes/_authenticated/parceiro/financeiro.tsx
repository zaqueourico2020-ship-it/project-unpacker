import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getPartnerWallet, requestPartnerPayout } from "@/lib/partner-panel.functions";
import { Wallet, ArrowDownToLine, Clock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parceiro/financeiro")({
  component: FinanceiroPage,
});

const BRL = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function FinanceiroPage() {
  const wallet = useServerFn(getPartnerWallet);
  const request = useServerFn(requestPartnerPayout);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["partner-wallet"], queryFn: () => wallet({}) });
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [pix, setPix] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const saldos = data?.saldos ?? { disponivel: 0, pendente: 0, processando: 0, sacado: 0, totalBruto: 0, totalComissao: 0 };
  const payouts = data?.payouts ?? [];
  const orders = data?.orders ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const val = Number(String(amount).replace(",", "."));
    if (!val || val < 10) { setMsg({ kind: "err", text: "Valor mínimo de saque: R$ 10,00" }); return; }
    setBusy(true);
    try {
      await request({ data: { amount: val, method: "pix", pix_key: pix || null } });
      setMsg({ kind: "ok", text: "Solicitação de saque enviada com sucesso." });
      setAmount(""); setPix("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["partner-wallet"] });
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.message || "Falha ao solicitar saque." });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" /> Carteira GF</h1>
        <button onClick={() => setOpen(true)} disabled={saldos.disponivel < 10}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <ArrowDownToLine className="h-4 w-4" /> Solicitar saque
        </button>
      </div>

      {msg && (
        <div className={`p-3 rounded text-sm ${msg.kind === "ok" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300"}`}>{msg.text}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Saldo disponível" value={BRL(saldos.disponivel)} accent="text-emerald-600" />
        <Card label="A liberar (7 dias)" value={BRL(saldos.pendente)} accent="text-amber-600" icon={<Clock className="h-4 w-4" />} />
        <Card label="Saques em processo" value={BRL(saldos.processando)} accent="text-sky-600" />
        <Card label="Total já sacado" value={BRL(saldos.sacado)} accent="text-foreground" icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card label="Vendas brutas (todas)" value={BRL(saldos.totalBruto)} />
        <Card label="Comissão Grupo GF (12%)" value={BRL(saldos.totalComissao)} />
        <Card label="Sua participação (88%)" value={BRL(saldos.totalBruto - saldos.totalComissao)} accent="text-primary" />
      </div>

      <section>
        <h2 className="font-semibold mb-2">Histórico de saques</h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Valor</th>
                <th className="text-left px-3 py-2">Ref.</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p: any) => {
                const isWithdraw = Number(p.net_amount) < 0;
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2">{new Date(p.created_at).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2">{isWithdraw ? "Saque" : "Crédito de venda"}</td>
                    <td className="px-3 py-2 uppercase text-xs">{p.status}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${isWithdraw ? "text-red-600" : "text-emerald-600"}`}>{BRL(Math.abs(Number(p.net_amount)))}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.payout_reference || "—"}</td>
                  </tr>
                );
              })}
              {!payouts.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhuma movimentação ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Extrato de vendas</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Bruto</th>
                <th className="text-right px-3 py-2">Comissão</th>
                <th className="text-right px-3 py-2">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any, i: number) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2">{new Date(o.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-3 py-2 uppercase text-xs">{o.status}</td>
                  <td className="px-3 py-2 text-right">{BRL(o.total)}</td>
                  <td className="px-3 py-2 text-right">{BRL(o.commission_amount)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{BRL(o.partner_net)}</td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Sem vendas ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-card border border-border p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">Solicitar saque</h3>
            <p className="text-xs text-muted-foreground mb-4">Disponível: <strong className="text-emerald-600">{BRL(saldos.disponivel)}</strong></p>
            <form onSubmit={submit} className="space-y-3">
              <label className="block">
                <span className="block text-xs text-muted-foreground mb-1">Valor (mínimo R$ 10,00)</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm" placeholder="0,00" />
              </label>
              <label className="block">
                <span className="block text-xs text-muted-foreground mb-1">Chave PIX (CPF, e-mail ou telefone)</span>
                <input value={pix} onChange={(e) => setPix(e.target.value)} required
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
              </label>
              <p className="text-[11px] text-muted-foreground">O saque é processado pela equipe Grupo GF em até 2 dias úteis.</p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded border border-border px-3 py-2 text-sm">Cancelar</button>
                <button type="submit" disabled={busy} className="flex-1 rounded bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold disabled:opacity-60">
                  {busy ? "Enviando..." : "Confirmar saque"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, accent, icon }: { label: string; value: string; accent?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground flex items-center gap-1">{icon} {label}</p>
      <p className={`mt-2 text-xl font-bold ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
