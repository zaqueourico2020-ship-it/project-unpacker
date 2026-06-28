import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listBalanceBlocks, blockBalance, releaseBlock } from "@/lib/admin-finance.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { brl, dateBR } from "@/lib/admin-export";

export const Route = createFileRoute("/_authenticated/admin/bloqueios")({
  head: () => ({ meta: [{ title: "Bloqueios de Saldo — Admin" }, { name: "robots", content: "noindex" }] }),
  component: BloqueiosPage,
});

function BloqueiosPage() {
  const fetchList = useServerFn(listBalanceBlocks);
  const doBlock = useServerFn(blockBalance);
  const doRelease = useServerFn(releaseBlock);
  const [status, setStatus] = useState<"all" | "active" | "released">("active");
  const [email, setEmail] = useState(""); const [amount, setAmount] = useState(""); const [reason, setReason] = useState("");

  const q = useQuery({ queryKey: ["balance-blocks", status], queryFn: () => fetchList({ data: { status } }) });
  const rows = q.data?.blocks ?? [];

  const submitBlock = async () => {
    const v = Number(amount.replace(",", "."));
    if (!email || !v || !reason) return toast.error("Preencha e-mail, valor e motivo");
    try {
      await doBlock({ data: { user_email: email, amount: v, reason } });
      toast.success("Saldo bloqueado");
      setEmail(""); setAmount(""); setReason(""); q.refetch();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  const release = async (id: string) => {
    const note = window.prompt("Observação (opcional):") ?? undefined;
    try { await doRelease({ data: { block_id: id, note } }); toast.success("Bloqueio liberado"); q.refetch(); }
    catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Bloqueios de Saldo</h1>
        <p className="text-sm text-muted-foreground">Bloquear valores em disputa, estorno ou cancelamento. Saldo bloqueado não pode ser sacado.</p>
      </header>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold">Novo bloqueio</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2"><Label>E-mail do vendedor</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Valor (R$)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Motivo</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Disputa #..." /></div>
        </div>
        <div className="mt-3"><Button onClick={submitBlock}>Bloquear saldo</Button></div>
      </div>

      <div className="flex gap-2">
        {(["active", "released", "all"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-sm ${status === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
            {s === "active" ? "Ativos" : s === "released" ? "Liberados" : "Todos"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Vendedor</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-left">Motivo</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Criado</th>
              <th className="px-3 py-2 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sem bloqueios.</td></tr>}
            {rows.map((b: any) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-3 py-2">{b.user_name ?? b.user_id.slice(0, 8)}</td>
                <td className="px-3 py-2 text-right font-bold">{brl(Number(b.amount))}</td>
                <td className="px-3 py-2">{b.reason}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${b.status === "active" ? "bg-red-500/15 text-red-600" : "bg-emerald-500/15 text-emerald-600"}`}>{b.status}</span></td>
                <td className="px-3 py-2">{dateBR(b.created_at)}</td>
                <td className="px-3 py-2 text-right">
                  {b.status === "active" && <Button size="sm" variant="outline" onClick={() => release(b.id)}>Liberar</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
