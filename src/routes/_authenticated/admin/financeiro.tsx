import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminFinancialDashboard, runFridayRelease } from "@/lib/admin-finance.functions";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/admin-export";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Wallet, Clock, Gift, ArrowDown, ArrowUp, ShoppingBag, Building2, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/financeiro")({
  head: () => ({ meta: [{ title: "Dashboard Financeiro — Admin" }, { name: "robots", content: "noindex" }] }),
  component: FinanceiroPage,
});

function Card({ icon: Icon, label, value, accent }: any) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={`h-5 w-5 ${accent ?? "text-primary"}`} />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function FinanceiroPage() {
  const fetchDash = useServerFn(adminFinancialDashboard);
  const runRelease = useServerFn(runFridayRelease);
  const q = useQuery({ queryKey: ["admin-financial"], queryFn: () => fetchDash(), refetchInterval: 30000 });
  const t = q.data?.totals;
  const days = (q.data?.last30 ?? []).map((d) => ({ ...d, label: d.date.slice(5) }));

  const release = async () => {
    if (!confirm("Liberar agora todos os saldos pendentes vencidos?")) return;
    try { const r = await runRelease(); toast.success(`${r.released} pagamentos liberados`); q.refetch(); }
    catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Dashboard Financeiro</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada das carteiras e movimentações.</p>
        </div>
        <Button onClick={release}><PlayCircle className="mr-1 h-4 w-4" /> Liberar pendentes agora</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card icon={Wallet} label="Saldo Disponível" value={brl(t?.available ?? 0)} accent="text-emerald-500" />
        <Card icon={Clock} label="Saldo Pendente" value={brl(t?.pending ?? 0)} accent="text-amber-500" />
        <Card icon={Gift} label="Cashback" value={brl(t?.cashback ?? 0)} accent="text-pink-500" />
        <Card icon={Building2} label="Carteira GF" value={brl(t?.gf_balance ?? 0)} accent="text-cyan-500" />
        <Card icon={ArrowDown} label="Total Recebido (vendas)" value={brl(t?.total_received ?? 0)} accent="text-emerald-500" />
        <Card icon={ArrowUp} label="Total Sacado" value={brl(t?.total_withdrawn ?? 0)} accent="text-red-500" />
        <Card icon={ShoppingBag} label="Total de Vendas" value={String(t?.total_sales_count ?? 0)} accent="text-blue-500" />
        <Card icon={ArrowDown} label="Total Depositado" value={brl(t?.total_deposited ?? 0)} accent="text-violet-500" />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold">Movimentação últimos 30 dias</h3>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={days}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: any) => brl(Number(v))} />
              <Legend />
              <Bar dataKey="sales" name="Vendas" fill="#10b981" />
              <Bar dataKey="commission" name="Comissão GF" fill="#06b6d4" />
              <Bar dataKey="withdrawn" name="Sacado" fill="#f43f5e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
