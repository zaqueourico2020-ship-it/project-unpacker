import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminListPartners, adminSetPartnerStatus, adminSetPartnerBadges } from "@/lib/partners.functions";
import { CheckCircle2, XCircle, PauseCircle, RefreshCw, Store, BadgeCheck, Truck } from "lucide-react";
import { StoreBadges } from "@/components/StoreBadges";

export const Route = createFileRoute("/_authenticated/admin/parceiros")({
  head: () => ({ meta: [{ title: "Parceiros — Admin Grupo GF" }, { name: "robots", content: "noindex" }] }),
  component: AdminPartners,
});

type P = any;
const TABS: Array<{ k: "pending" | "approved" | "rejected" | "suspended" | "all"; label: string }> = [
  { k: "pending", label: "Pendentes" },
  { k: "approved", label: "Aprovados" },
  { k: "rejected", label: "Rejeitados" },
  { k: "suspended", label: "Suspensos" },
  { k: "all", label: "Todos" },
];

function AdminPartners() {
  const list = useServerFn(adminListPartners);
  const setStatus = useServerFn(adminSetPartnerStatus);
  const setBadges = useServerFn(adminSetPartnerBadges);
  const [tab, setTab] = useState<typeof TABS[number]["k"]>("pending");
  const [rows, setRows] = useState<P[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await list({ data: { status: tab } });
      setRows(r.partners);
    } finally { setLoading(false); }
  }, [list, tab]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, status: "approved" | "rejected" | "suspended" | "pending") => {
    let reason: string | null = null;
    if (status === "rejected") {
      reason = prompt("Motivo da rejeição:") || "";
      if (!reason) return;
    } else {
      if (!confirm(`Confirmar ação: ${status}?`)) return;
    }
    await setStatus({ data: { id, status, rejection_reason: reason } });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2"><Store size={20} /> Parceiros</h1>
        <button onClick={load} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-3 py-1.5 rounded text-sm ${tab === t.k ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum parceiro nesta categoria.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                {p.logo_url ? <img src={p.logo_url} alt="" className="h-12 w-12 rounded object-cover" /> : <div className="h-12 w-12 rounded bg-muted" />}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate">{p.nome_loja}</strong>
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted">{p.tipo}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-x-3">
                    <span>{p.nome}</span>
                    <span>{p.documento}</span>
                    <span>{p.email}</span>
                    <span>{p.telefone}</span>
                  </div>
                  {p.descricao && <p className="text-xs mt-2 text-muted-foreground line-clamp-2">{p.descricao}</p>}
                  {p.rejection_reason && <p className="text-xs mt-2 text-red-500">Motivo: {p.rejection_reason}</p>}
                  {p.status === "approved" && (
                    <div className="mt-2">
                      <StoreBadges status={p.status} verified={p.verified} reliable_shipping={p.reliable_shipping} compact />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {p.status !== "approved" && (
                  <button onClick={() => act(p.id, "approved")} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700">
                    <CheckCircle2 size={14} /> Aprovar
                  </button>
                )}
                {p.status !== "rejected" && (
                  <button onClick={() => act(p.id, "rejected")} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700">
                    <XCircle size={14} /> Rejeitar
                  </button>
                )}
                {p.status === "approved" && (
                  <>
                    <button
                      onClick={async () => { await setBadges({ data: { id: p.id, verified: !p.verified } }); await load(); }}
                      className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded border ${p.verified ? "bg-blue-600 text-white border-blue-600" : "border-border hover:bg-accent"}`}
                    >
                      <BadgeCheck size={14} /> {p.verified ? "Verificado" : "Marcar Verificado"}
                    </button>
                    <button
                      onClick={async () => { await setBadges({ data: { id: p.id, reliable_shipping: !p.reliable_shipping } }); await load(); }}
                      className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded border ${p.reliable_shipping ? "bg-amber-600 text-white border-amber-600" : "border-border hover:bg-accent"}`}
                    >
                      <Truck size={14} /> {p.reliable_shipping ? "Entrega Confiável" : "Marcar Entrega Confiável"}
                    </button>
                    <button onClick={() => act(p.id, "suspended")} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700">
                      <PauseCircle size={14} /> Suspender
                    </button>
                  </>
                )}
                {(p.status === "rejected" || p.status === "suspended") && (
                  <button onClick={() => act(p.id, "pending")} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-border hover:bg-accent">
                    Reabrir análise
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-600",
    approved: "bg-emerald-500/15 text-emerald-600",
    rejected: "bg-red-500/15 text-red-600",
    suspended: "bg-slate-500/15 text-slate-500",
  };
  return <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${map[status] || ""}`}>{status}</span>;
}