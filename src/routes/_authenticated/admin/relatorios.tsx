import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDashboard, listSales } from "@/lib/admin-sales.functions";
import { brl, dateBR, exportPDF, exportXLSX } from "@/lib/admin-export";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { FileDown, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/relatorios")({
  component: Relatorios,
});

function Relatorios() {
  const fetchDash = useServerFn(getDashboard);
  const fetchSales = useServerFn(listSales);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const params = useMemo(() => ({
    from: from ? new Date(from + "T00:00:00").toISOString() : undefined,
    to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
  }), [from, to]);

  const { data: dash } = useQuery({ queryKey: ["rep-dash", params], queryFn: () => fetchDash({ data: params }) });
  const { data: sales } = useQuery({ queryKey: ["rep-sales", params], queryFn: () => fetchSales({ data: { ...params, status: "approved" } }) });

  const rows = ((sales?.sales ?? []) as any[]).map((s) => ({
    Pedido: s.id.slice(0, 8),
    Cliente: s.customer_name,
    Data: dateBR(s.created_at),
    Valor: Number(s.total),
    Custo: Number(s.cost_total),
    Lucro: Number(s.profit),
    Pagamento: s.payment_type || s.payment_method || "—",
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Filtre por período e exporte</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="block text-xs text-muted-foreground">De</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <div><label className="block text-xs text-muted-foreground">Até</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <button onClick={() => exportXLSX(`relatorio_${Date.now()}`, rows)} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button onClick={() => exportPDF(`relatorio_${Date.now()}`, "Relatório de Vendas Aprovadas",
            ["Pedido","Cliente","Data","Valor","Custo","Lucro","Pagto"],
            rows.map(r => [r.Pedido, r.Cliente, r.Data, brl(r.Valor), brl(r.Custo), brl(r.Lucro), r.Pagamento]))}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent">
            <FileDown className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 font-semibold">Vendas por dia</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dash?.salesByDay ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => brl(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" name="Receita" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 font-semibold">Lucro por mês</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dash?.salesByMonth ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => brl(Number(v))} />
                <Legend />
                <Bar dataKey="profit" fill="#10b981" name="Lucro" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <h3 className="mb-3 font-semibold">Produtos mais vendidos</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dash?.topProducts ?? []} layout="vertical">
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
    </div>
  );
}
