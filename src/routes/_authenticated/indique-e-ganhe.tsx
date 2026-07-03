import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Share2, Gift, Users, CheckCircle2, Clock } from "lucide-react";
import { getReferralOverview, applyReferralCode } from "@/lib/referral.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/indique-e-ganhe")({
  head: () => ({ meta: [{ title: "Indique e Ganhe — Grupo GF" }, { name: "description", content: "Convide amigos e ganhe R$ 5,00 na Carteira GF por cada indicação válida." }] }),
  component: IndiquePage,
});

const BRL = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, { label: string; cls: string; icon?: any }> = {
  signed_up: { label: "Aguardando primeira compra", cls: "bg-amber-500/15 text-amber-600", icon: Clock },
  rewarded: { label: "Recompensa paga", cls: "bg-emerald-500/15 text-emerald-600", icon: CheckCircle2 },
  not_first: { label: "Não elegível", cls: "bg-muted text-muted-foreground" },
};

function IndiquePage() {
  const fetchFn = useServerFn(getReferralOverview);
  const applyFn = useServerFn(applyReferralCode);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["referral-overview"], queryFn: () => fetchFn({}) });
  const [applyCode, setApplyCode] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = data?.code ? `${origin}/auth?ref=${data.code}` : "";
  const qrUrl = link ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}` : "";

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const share = async () => {
    if (navigator.share && link) {
      try { await navigator.share({ title: "Grupo GF", text: "Ganhe R$ 5 na Carteira GF cadastrando-se com meu código!", url: link }); } catch {}
    } else {
      copy(link, "Link");
    }
  };

  const submitApply = async () => {
    if (!applyCode.trim()) return;
    try {
      await applyFn({ data: { code: applyCode.trim().toUpperCase() } });
      toast.success("Código aplicado!");
      setApplyCode("");
      qc.invalidateQueries({ queryKey: ["referral-overview"] });
    } catch (e: any) { toast.error(e?.message || "Erro"); }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary"><Gift className="h-7 w-7" /></div>
        <h1 className="text-3xl font-bold">Indique e Ganhe R$ 5,00</h1>
        <p className="text-muted-foreground">Convide amigos. Quando fizerem a 1ª compra acima de R$ 50,00, você ganha R$ 5 na Carteira GF.</p>
      </header>

      {isLoading ? <p className="text-center text-muted-foreground">Carregando…</p> : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Saldo Carteira" value={BRL(Number(data?.wallet.available_balance || 0))} accent="text-emerald-600" />
            <Stat label="Total indicados" value={String(data?.stats.total ?? 0)} icon={<Users className="h-4 w-4" />} />
            <Stat label="Pendentes" value={String(data?.stats.pending ?? 0)} accent="text-amber-600" />
            <Stat label="Recebido em bônus" value={BRL(data?.stats.totalRewarded ?? 0)} accent="text-primary" />
          </div>

          <section className="grid gap-4 md:grid-cols-2 rounded-xl border border-border bg-card p-5">
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Seu código</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-lg font-mono font-bold tracking-wider">{data?.code}</code>
                  <Button size="icon" variant="outline" onClick={() => copy(data?.code || "", "Código")}><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Seu link</p>
                <div className="flex items-center gap-2 mt-1">
                  <input readOnly value={link} className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs" />
                  <Button size="icon" variant="outline" onClick={() => copy(link, "Link")}><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
              <Button className="w-full" onClick={share}><Share2 className="mr-2 h-4 w-4" /> Compartilhar</Button>
            </div>
            <div className="flex flex-col items-center justify-center">
              {qrUrl && <img src={qrUrl} alt="QR Code de indicação" className="rounded-lg border border-border" />}
              <p className="text-xs text-muted-foreground mt-2">Escaneie para se cadastrar</p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold mb-2">Recebi um código de indicação</h2>
            <p className="text-xs text-muted-foreground mb-3">Aplique antes da sua primeira compra.</p>
            <div className="flex gap-2">
              <input value={applyCode} onChange={(e) => setApplyCode(e.target.value.toUpperCase())} placeholder="CÓDIGO" maxLength={20}
                className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm font-mono uppercase" />
              <Button onClick={submitApply}>Aplicar</Button>
            </div>
          </section>

          <section>
            <h2 className="font-semibold mb-2">Histórico de indicações</h2>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Data cadastro</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">1ª compra</th>
                    <th className="text-right px-3 py-2">Bônus</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.referrals ?? []).map((r: any) => {
                    const s = STATUS_LABEL[r.status] ?? { label: r.status, cls: "bg-muted" };
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-3 py-2">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                        <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span></td>
                        <td className="px-3 py-2 text-right">{r.first_order_total ? BRL(Number(r.first_order_total)) : "—"}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-600">{r.rewarded_at ? BRL(Number(r.reward_amount)) : "—"}</td>
                      </tr>
                    );
                  })}
                  {!data?.referrals.length && <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Nenhuma indicação ainda. Compartilhe seu código!</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent, icon }: { label: string; value: string; accent?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground flex items-center gap-1">{icon} {label}</p>
      <p className={`mt-2 text-xl font-bold ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
