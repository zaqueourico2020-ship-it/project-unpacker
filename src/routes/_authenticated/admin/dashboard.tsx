import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getDashboard } from "@/lib/admin-sales.functions";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateBR } from "@/lib/admin-export";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { DollarSign, TrendingUp, Wallet, Package, ShoppingBag, Boxes, BadgePercent } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  component: Dashboard,
});

function KPI({ icon: Icon, label, value, accent }: any) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={`h-5 w-5 ${accent || "text-primary"}`} />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function Dashboard() {
  const fetchDash = useServerFn(getDashboard);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => fetchDash({ data: {} }),
    refetchInterval: 30000,
  });

  // Realtime: qualquer mudança em orders revalida dashboard + vendas
  useEffect(() => {
    const ch = supabase
      .channel("admin-orders-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
        qc.invalidateQueries({ queryKey: ["admin-sales"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;
  const { kpis, salesByDay, salesByMonth, topProducts, recent } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Atualizado em tempo real</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI icon={DollarSign} label="Faturamento Hoje" value={brl(kpis.revenueToday)} accent="text-emerald-500" />
        <KPI icon={TrendingUp} label="Faturamento Mês" value={brl(kpis.revenueMonth)} accent="text-blue-500" />
        <KPI icon={Wallet} label="Total Investido (estoque)" value={brl(kpis.totalInvested)} accent="text-orange-500" />
        <KPI icon={BadgePercent} label="Lucro Bruto (Mês)" value={brl(kpis.profitGrossMonth)} accent="text-green-500" />
        <KPI icon={BadgePercent} label="Lucro Líquido (Mês)" value={brl(kpis.profitNetMonth)} accent="text-green-600" />
        <KPI icon={ShoppingBag} label="Produtos Vendidos (Mês)" value={kpis.productsSoldMonth} accent="text-violet-500" />
        <KPI icon={Boxes} label="Estoque Atual" value={kpis.stockUnits} accent="text-cyan-500" />
        <KPI icon={Package} label="Pedidos Recentes" value={recent.length} accent="text-pink-500" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 font-semibold">Vendas por dia (30d)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => brl(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" name="Receita" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" stroke="#10b981" name="Lucro" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 font-semibold">Receita x Lucro por mês (12m)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => brl(Number(v))} />
                <Legend />
                <Bar dataKey="revenue" fill="#3b82f6" name="Receita" />
                <Bar dataKey="profit" fill="#10b981" name="Lucro" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <h3 className="mb-3 font-semibold">Top 10 produtos mais vendidos</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#8b5cf6" name="Unidades" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold">Últimas vendas aprovadas (tempo real)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Data</th>
                <th className="px-2 py-2">Cliente</th>
                <th className="px-2 py-2">Pagamento</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-right">Lucro</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">Nenhuma venda ainda.</td></tr>
              )}
              {recent.map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-2 py-2">{dateBR(r.created_at)}</td>
                  <td className="px-2 py-2">{r.customer_name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.payment_type || r.payment_method || "—"}</td>
                  <td className="px-2 py-2 text-right">{brl(r.total)}</td>
                  <td className="px-2 py-2 text-right text-emerald-500">{brl(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
