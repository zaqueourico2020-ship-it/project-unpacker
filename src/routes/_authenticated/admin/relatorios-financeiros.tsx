import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { adminFinancialDashboard, adminCommissionsReport } from "@/lib/admin-finance.functions";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/admin-export";
import { FileDown, FileSpreadsheet } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/admin/relatorios-financeiros")({
  head: () => ({ meta: [{ title: "Relatórios Financeiros — Admin" }, { name: "robots", content: "noindex" }] }),
  component: RelatoriosFinanceirosPage,
});

function aggregate(sales: any[]) {
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const week = new Date(); week.setDate(week.getDate() - 7);
  const month = new Date(); month.setMonth(month.getMonth() - 1);
  const sum = (since: Date) => sales
    .filter((s) => new Date(s.created_at) >= since)
    .reduce((acc, r) => ({
      gross: acc.gross + Number(r.gross_amount || 0),
      commission: acc.commission + Number(r.gf_commission || 0),
      net: acc.net + Number(r.partner_net || 0),
      count: acc.count + 1,
    }), { gross: 0, commission: 0, net: 0, count: 0 });
  return { day: sum(day), week: sum(week), month: sum(month) };
}

function RelatoriosFinanceirosPage() {
  const fetchDash = useServerFn(adminFinancialDashboard);
  const fetchCom = useServerFn(adminCommissionsReport);
  const dq = useQuery({ queryKey: ["admin-fin-totals"], queryFn: () => fetchDash() });
  const cq = useQuery({ queryKey: ["admin-fin-com"], queryFn: () => fetchCom() });
  const agg = useMemo(() => aggregate(cq.data?.sales ?? []), [cq.data]);
  const t = dq.data?.totals;

  const rows = [
    ["Período", "Vendas", "Faturamento bruto", "Comissão GF", "Líquido parceiros"],
    ["Hoje", agg.day.count, agg.day.gross, agg.day.commission, agg.day.net],
    ["Últimos 7 dias", agg.week.count, agg.week.gross, agg.week.commission, agg.week.net],
    ["Últimos 30 dias", agg.month.count, agg.month.gross, agg.month.commission, agg.month.net],
    [],
    ["Total em carteiras (disponível)", t?.available ?? 0],
    ["Total em carteiras (pendente)", t?.pending ?? 0],
    ["Total em carteiras (bloqueado)", t?.blocked ?? 0],
    ["Carteira GF", t?.gf_balance ?? 0],
    ["Total sacado", t?.total_withdrawn ?? 0],
    ["Total depositado", t?.total_deposited ?? 0],
  ];

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("Relatório Financeiro — Grupo GF", 14, 16);
    doc.setFontSize(10); doc.text(new Date().toLocaleString("pt-BR"), 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Período", "Vendas", "Bruto", "Comissão GF", "Líquido"]],
      body: [
        ["Hoje", String(agg.day.count), brl(agg.day.gross), brl(agg.day.commission), brl(agg.day.net)],
        ["7 dias", String(agg.week.count), brl(agg.week.gross), brl(agg.week.commission), brl(agg.week.net)],
        ["30 dias", String(agg.month.count), brl(agg.month.gross), brl(agg.month.commission), brl(agg.month.net)],
      ],
    });
    autoTable(doc, {
      head: [["Indicador", "Valor"]],
      body: [
        ["Saldo disponível (total)", brl(t?.available ?? 0)],
        ["Saldo pendente (total)", brl(t?.pending ?? 0)],
        ["Saldo bloqueado (total)", brl(t?.blocked ?? 0)],
        ["Carteira GF", brl(t?.gf_balance ?? 0)],
        ["Total sacado", brl(t?.total_withdrawn ?? 0)],
        ["Total depositado", brl(t?.total_deposited ?? 0)],
      ],
    });
    doc.save(`relatorio-financeiro-${Date.now()}.pdf`);
  };

  const exportXLSX = () => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financeiro");
    XLSX.writeFile(wb, `relatorio-financeiro-${Date.now()}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Relatórios Financeiros</h1>
          <p className="text-sm text-muted-foreground">Comissão diária/semanal/mensal e totais consolidados.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportPDF}><FileDown className="mr-1 h-4 w-4" /> PDF</Button>
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet className="mr-1 h-4 w-4" /> Excel</Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {(["day", "week", "month"] as const).map((k, i) => {
          const label = ["Hoje", "Últimos 7 dias", "Últimos 30 dias"][i];
          const v = agg[k];
          return (
            <div key={k} className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">{label}</div>
              <div className="mt-2 text-2xl font-bold">{brl(v.commission)}</div>
              <div className="text-xs text-muted-foreground">Comissão GF · {v.count} vendas · bruto {brl(v.gross)}</div>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Total em carteiras (disponível)", brl(t?.available ?? 0)],
              ["Total em carteiras (pendente)", brl(t?.pending ?? 0)],
              ["Total em carteiras (bloqueado)", brl(t?.blocked ?? 0)],
              ["Carteira GF", brl(t?.gf_balance ?? 0)],
              ["Total sacado", brl(t?.total_withdrawn ?? 0)],
              ["Total depositado", brl(t?.total_deposited ?? 0)],
            ].map(([k, v]) => (
              <tr key={k} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{k}</td>
                <td className="px-3 py-2 text-right font-bold">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
