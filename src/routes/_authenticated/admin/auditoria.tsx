import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminAuditLogs } from "@/lib/admin-finance.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { brl, dateBR } from "@/lib/admin-export";

export const Route = createFileRoute("/_authenticated/admin/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria Financeira — Admin" }, { name: "robots", content: "noindex" }] }),
  component: AuditPage,
});

function AuditPage() {
  const fetchLogs = useServerFn(adminAuditLogs);
  const [event, setEvent] = useState("");
  const q = useQuery({
    queryKey: ["audit-logs", event],
    queryFn: () => fetchLogs({ data: { event: event || undefined } }),
  });
  const rows = q.data?.logs ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Auditoria Financeira</h1>
        <p className="text-sm text-muted-foreground">Histórico imutável de todas as operações.</p>
      </header>

      <div className="flex gap-2">
        <Input placeholder="Filtrar por evento (ex: withdraw_approved)" value={event} onChange={(e) => setEvent(e.target.value)} className="max-w-xs" />
        <Button variant="outline" onClick={() => q.refetch()}>Buscar</Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Data/Hora</th>
              <th className="px-3 py-2 text-left">Evento</th>
              <th className="px-3 py-2 text-left">Ator</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-left">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>}
            {!q.isLoading && !rows.length && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sem registros.</td></tr>}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="px-3 py-2 whitespace-nowrap">{dateBR(r.created_at)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.event}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.actor?.slice(0, 8) ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold">{r.amount != null ? brl(Number(r.amount)) : "—"}</td>
                <td className="px-3 py-2"><pre className="max-w-md overflow-auto text-[10px] text-muted-foreground">{JSON.stringify(r.details, null, 2)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
