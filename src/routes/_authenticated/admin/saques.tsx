import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listWithdrawals, withdrawalAction } from "@/lib/admin-finance.functions";
import { Button } from "@/components/ui/button";
import { brl, dateBR } from "@/lib/admin-export";
import { Check, X, CheckCircle2, RefreshCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/saques")({
  head: () => ({ meta: [{ title: "Central de Saques — Admin" }, { name: "robots", content: "noindex" }] }),
  component: SaquesPage,
});

const STATUSES = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "approved", label: "Aprovados" },
  { value: "paid", label: "Pagos" },
  { value: "rejected", label: "Rejeitados" },
];

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-600",
    approved: "bg-blue-500/15 text-blue-600",
    paid: "bg-emerald-500/15 text-emerald-600",
    rejected: "bg-red-500/15 text-red-600",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[s] ?? "bg-muted"}`}>{s}</span>;
}

function SaquesPage() {
  const fetchList = useServerFn(listWithdrawals);
  const doAction = useServerFn(withdrawalAction);
  const [status, setStatus] = useState("pending");
  const q = useQuery({
    queryKey: ["admin-withdrawals", status],
    queryFn: () => fetchList({ data: { status } }),
    refetchInterval: 15000,
  });
  const rows = q.data?.withdrawals ?? [];

  const run = async (request_id: string, action: "approved" | "rejected" | "paid", verb: string) => {
    const note = window.prompt(`${verb} — observação (opcional):`) ?? undefined;
    try {
      await doAction({ data: { request_id, action, note } });
      toast.success(`Saque ${verb.toLowerCase()}`);
      q.refetch();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Central de Saques</h1>
          <p className="text-sm text-muted-foreground">Aprovar, rejeitar e marcar como pago. Todas as ações ficam no log financeiro.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}><RefreshCcw className="mr-1 h-4 w-4" /> Recarregar</Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button key={s.value} onClick={() => setStatus(s.value)}
            className={`rounded-full border px-3 py-1.5 text-sm ${status === s.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Vendedor</th>
              <th className="px-3 py-2 text-left">E-mail</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-left">Chave PIX</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>}
            {!q.isLoading && !rows.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum saque.</td></tr>}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{r.user_name ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.user_email ?? "—"}</td>
                <td className="px-3 py-2 text-right font-bold">{brl(Number(r.amount))}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.pix_key ?? "—"}</td>
                <td className="px-3 py-2">{dateBR(r.created_at)}</td>
                <td className="px-3 py-2"><StatusBadge s={r.status} /></td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {r.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => run(r.id, "approved", "Aprovar")}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => run(r.id, "rejected", "Rejeitar")}><X className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                    {(r.status === "approved" || r.status === "pending") && (
                      <Button size="sm" onClick={() => run(r.id, "paid", "Marcar como pago")}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Pago</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
