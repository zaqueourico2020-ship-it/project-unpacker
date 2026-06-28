import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listSales } from "@/lib/admin-sales.functions";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateBR, exportPDF, exportXLSX } from "@/lib/admin-export";
import { FileDown, FileSpreadsheet, Filter } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/vendas")({
  component: VendasPage,
});

const STATUS = [
  { v: "all", l: "Todos" },
  { v: "pending", l: "Pendente" },
  { v: "approved", l: "Pago" },
  { v: "preparing", l: "Em preparo" },
  { v: "shipped", l: "Enviado" },
  { v: "delivered", l: "Entregue" },
  { v: "cancelled", l: "Cancelado" },
];

function VendasPage() {
  const fetch = useServerFn(listSales);
  const qc = useQueryClient();
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [status, setStatus] = useState<string>("all");

  const params = useMemo(() => ({
    from: from ? new Date(from + "T00:00:00").toISOString() : undefined,
    to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
    status,
  }), [from, to, status]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-sales", params],
    queryFn: () => fetch({ data: params }),
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-sales-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-sales"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const sales = (data?.sales ?? []) as any[];

  const exportRows = sales.map((s) => ({
    "Pedido": s.id.slice(0, 8),
    "Cliente": s.customer_name,
    "Data/Hora": dateBR(s.created_at),
    "Produtos": (s.items ?? []).map((i: any) => `${i.qty}x ${i.name}`).join(" | "),
    "Qtd Total": (s.items ?? []).reduce((a: number, i: any) => a + Number(i.qty || 0), 0),
    "Valor": Number(s.total),
    "Custo": Number(s.cost_total),
    "Lucro": Number(s.profit),
    "Pagamento": s.payment_type || s.payment_method || "—",
    "Status": s.status,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vendas</h1>
          <p className="text-sm text-muted-foreground">{sales.length} venda(s) no período</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-muted-foreground">De</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">Até</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
              {STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </div>
          <button
            onClick={() => exportXLSX(`vendas_${Date.now()}`, exportRows)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button
            onClick={() => exportPDF(`vendas_${Date.now()}`, "Relatório de Vendas",
              ["Pedido","Cliente","Data","Qtd","Valor","Custo","Lucro","Pagto","Status"],
              sales.map((s) => [
                s.id.slice(0,8), s.customer_name, dateBR(s.created_at),
                (s.items ?? []).reduce((a: number, i: any) => a + Number(i.qty || 0), 0),
                brl(s.total), brl(s.cost_total), brl(s.profit),
                s.payment_type || s.payment_method || "—", s.status,
              ]))}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
          >
            <FileDown className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Pedido</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Data/Hora</th>
              <th className="px-3 py-2">Produtos</th>
              <th className="px-3 py-2 text-right">Qtd</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Custo</th>
              <th className="px-3 py-2 text-right">Lucro</th>
              <th className="px-3 py-2">Pagto</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">Carregando…</td></tr>}
            {!isLoading && sales.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">Nenhuma venda encontrada.</td></tr>}
            {sales.map((s) => {
              const qty = (s.items ?? []).reduce((a: number, i: any) => a + Number(i.qty || 0), 0);
              return (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-mono text-xs">#{s.id.slice(0, 8)}</td>
                  <td className="px-3 py-2">{s.customer_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{dateBR(s.created_at)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs">
                    {(s.items ?? []).map((i: any, idx: number) => (
                      <div key={idx}>{i.qty}× {i.name}</div>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right">{qty}</td>
                  <td className="px-3 py-2 text-right">{brl(s.total)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{brl(s.cost_total)}</td>
                  <td className="px-3 py-2 text-right text-emerald-500">{brl(s.profit)}</td>
                  <td className="px-3 py-2 text-xs">{s.payment_type || s.payment_method || "—"}</td>
                  <td className="px-3 py-2 text-xs">{s.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
