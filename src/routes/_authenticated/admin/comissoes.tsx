import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Percent, Save, RefreshCw, Search, BarChart3, Wallet, ScrollText } from "lucide-react";
import {
  getCommissionSettings,
  updateGlobalCommission,
  updatePartnerCommission,
  listCommissionHistory,
  getCommissionReport,
  getAdminWalletStatus,
  listFinancialAuditLogs,
} from "@/lib/admin-commissions.functions";

export const Route = createFileRoute("/_authenticated/admin/comissoes")({
  head: () => ({ meta: [{ title: "Comissões — Admin Grupo GF" }, { name: "robots", content: "noindex" }] }),
  component: ComissoesPage,
});

type Partner = { id: string; nome_loja: string; slug: string; status: string; commission_rate: number | null };

function ComissoesPage() {
  const fetchSettings = useServerFn(getCommissionSettings);
  const saveGlobal = useServerFn(updateGlobalCommission);
  const savePartner = useServerFn(updatePartnerCommission);
  const fetchHistory = useServerFn(listCommissionHistory);
  const fetchReport = useServerFn(getCommissionReport);
  const fetchWallet = useServerFn(getAdminWalletStatus);
  const fetchAudit = useServerFn(listFinancialAuditLogs);

  const [loading, setLoading] = useState(true);
  const [globalRate, setGlobalRate] = useState(10);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [report, setReport] = useState<{ totalBase: number; totalCommission: number; totalNet: number; byPartner: any[] } | null>(null);
  const [wallet, setWallet] = useState<{ balance: number; total_collected: number; updated_at: string | null } | null>(null);
  const [walletTxs, setWalletTxs] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [partnerFilter, setPartnerFilter] = useState<string>("");
  const [orderFilter, setOrderFilter] = useState<string>("");

  const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());

  const loadAll = async () => {
    setLoading(true);
    try {
      const filterPayload = {
        from: from || undefined,
        to: to || undefined,
        partnerId: partnerFilter || undefined,
        orderId: isUuid(orderFilter) ? orderFilter.trim() : undefined,
      };
      const [s, h, r, w, a] = await Promise.all([
        fetchSettings(),
        fetchHistory({ data: { limit: 200, ...filterPayload } }),
        fetchReport({ data: { from: filterPayload.from, to: filterPayload.to } }),
        fetchWallet(),
        fetchAudit({ data: { limit: 200, ...filterPayload } }),
      ]);
      setGlobalRate(Number(s.globalRate ?? 10));
      setPartners(s.partners as Partner[]);
      setHistory(h.rows);
      setReport(r);
      setWallet(w.wallet as any);
      setWalletTxs(w.transactions);
      setAudit(a.rows);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar comissões");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter((p) => p.nome_loja.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
  }, [partners, search]);

  const onSaveGlobal = async () => {
    try {
      await saveGlobal({ data: { rate: Number(globalRate) } });
      toast.success("Comissão global atualizada");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  };

  const onSavePartner = async (p: Partner, value: string) => {
    const trimmed = value.trim();
    const rate = trimmed === "" ? null : Number(trimmed);
    if (rate !== null && (isNaN(rate) || rate < 0 || rate > 100)) {
      toast.error("Taxa inválida (0-100)");
      return;
    }
    try {
      await savePartner({ data: { partnerId: p.id, rate } });
      setPartners((arr) => arr.map((x) => (x.id === p.id ? { ...x, commission_rate: rate } : x)));
      toast.success(`Comissão de ${p.nome_loja} atualizada`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  };

  const fmt = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Percent className="h-6 w-6" /> Sistema de Comissão
          </h1>
          <p className="text-sm text-muted-foreground">Configure taxas globais e individuais. Veja relatórios e histórico completo.</p>
        </div>
        <button
          onClick={loadAll}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      {/* Global */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Comissão global padrão</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2">
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={globalRate}
              onChange={(e) => setGlobalRate(Number(e.target.value))}
              className="w-24 bg-transparent py-2 text-right outline-none"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <button
            onClick={onSaveGlobal}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Save className="h-4 w-4" /> Salvar global
          </button>
          <span className="text-xs text-muted-foreground">Vale para todo parceiro sem taxa individual.</span>
        </div>
      </section>

      {/* Carteira Admin GF */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Carteira Administrativa GF
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Saldo atual" value={fmt(Number(wallet?.balance ?? 0))} />
          <Stat label="Total acumulado (12%)" value={fmt(Number(wallet?.total_collected ?? 0))} />
          <Stat label="Atualizado em" value={wallet?.updated_at ? new Date(wallet.updated_at).toLocaleString("pt-BR") : "—"} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-2">Data</th>
                <th className="py-2 pr-2">Tipo</th>
                <th className="py-2 pr-2">Descrição</th>
                <th className="py-2 pr-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {walletTxs.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="py-2 pr-2 whitespace-nowrap">{new Date(t.created_at).toLocaleString("pt-BR")}</td>
                  <td className="py-2 pr-2 text-xs">{t.type}</td>
                  <td className="py-2 pr-2">{t.description ?? "—"}</td>
                  <td className="py-2 pr-2 text-right font-medium">{fmt(Number(t.amount))}</td>
                </tr>
              ))}
              {!walletTxs.length && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sem movimentações.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Filtros relatório */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Relatório e filtros
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">De</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          <label className="text-xs text-muted-foreground">Até</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          <label className="text-xs text-muted-foreground">Vendedor</label>
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.nome_loja}</option>
            ))}
          </select>
          <label className="text-xs text-muted-foreground">Pedido</label>
          <input
            value={orderFilter}
            onChange={(e) => setOrderFilter(e.target.value)}
            placeholder="UUID do pedido"
            className="w-64 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <button onClick={loadAll} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">Aplicar</button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Base bruta (subtotal)" value={fmt(report?.totalBase ?? 0)} />
          <Stat label="Comissão da plataforma (12%)" value={fmt(report?.totalCommission ?? 0)} />
          <Stat label="Líquido aos parceiros (88%)" value={fmt(report?.totalNet ?? 0)} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-2">Parceiro</th>
                <th className="py-2 pr-2 text-right">Pedidos</th>
                <th className="py-2 pr-2 text-right">Base</th>
                <th className="py-2 pr-2 text-right">Comissão</th>
                <th className="py-2 pr-2 text-right">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {(report?.byPartner ?? []).map((r) => (
                <tr key={r.partnerId} className="border-t border-border">
                  <td className="py-2 pr-2">{r.nomeLoja}</td>
                  <td className="py-2 pr-2 text-right">{r.count}</td>
                  <td className="py-2 pr-2 text-right">{fmt(r.base)}</td>
                  <td className="py-2 pr-2 text-right">{fmt(r.commission)}</td>
                  <td className="py-2 pr-2 text-right">{fmt(r.net)}</td>
                </tr>
              ))}
              {!report?.byPartner?.length && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Sem registros no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Por parceiro */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Taxas individuais por parceiro</h2>
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar parceiro…"
              className="bg-transparent py-1.5 text-sm outline-none"
            />
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-2">Loja</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2 text-right">Taxa (%)</th>
                <th className="py-2 pr-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <PartnerRow key={p.id} p={p} onSave={onSavePartner} />
              ))}
              {!filtered.length && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">{loading ? "Carregando…" : "Nenhum parceiro."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Histórico */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Histórico de comissões</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-2">Data</th>
                <th className="py-2 pr-2">Parceiro</th>
                <th className="py-2 pr-2">Pedido</th>
                <th className="py-2 pr-2 text-right">Taxa</th>
                <th className="py-2 pr-2 text-right">Base</th>
                <th className="py-2 pr-2 text-right">Comissão</th>
                <th className="py-2 pr-2 text-right">Líquido</th>
                <th className="py-2 pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => {
                const base = Number(r.base_amount) || 0;
                const comm = Number(r.commission_amount) || 0;
                const rate = base > 0 ? (comm / base) * 100 : 0;
                const oid = r.partner_orders?.order_id as string | undefined;
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 pr-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                    <td className="py-2 pr-2">{r.partners?.nome_loja ?? "—"}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{oid ? oid.slice(0, 8) : "—"}</td>
                    <td className="py-2 pr-2 text-right">{rate.toFixed(2)}%</td>
                    <td className="py-2 pr-2 text-right">{fmt(base)}</td>
                    <td className="py-2 pr-2 text-right">{fmt(comm)}</td>
                    <td className="py-2 pr-2 text-right">{fmt(Number(r.partner_net))}</td>
                    <td className="py-2 pr-2"><StatusPill status={r.status} /></td>
                  </tr>
                );
              })}
              {!history.length && (
                <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Sem registros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Logs de auditoria */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground flex items-center gap-2">
          <ScrollText className="h-4 w-4" /> Logs de auditoria financeira
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-2">Data</th>
                <th className="py-2 pr-2">Evento</th>
                <th className="py-2 pr-2">Parceiro</th>
                <th className="py-2 pr-2">Pedido</th>
                <th className="py-2 pr-2 text-right">Valor</th>
                <th className="py-2 pr-2">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="py-2 pr-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                  <td className="py-2 pr-2 text-xs"><span className="rounded bg-muted px-2 py-0.5">{r.event}</span></td>
                  <td className="py-2 pr-2">{r.partners?.nome_loja ?? "—"}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{r.order_id ? String(r.order_id).slice(0, 8) : "—"}</td>
                  <td className="py-2 pr-2 text-right">{r.amount != null ? fmt(Number(r.amount)) : "—"}</td>
                  <td className="py-2 pr-2 text-xs text-muted-foreground"><pre className="whitespace-pre-wrap break-all">{JSON.stringify(r.details, null, 0)}</pre></td>
                </tr>
              ))}
              {!audit.length && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sem logs no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    accrued: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    reversed: "bg-red-100 text-red-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${map[status] ?? "bg-muted text-muted-foreground"}`}>{status}</span>;
}

function PartnerRow({ p, onSave }: { p: Partner; onSave: (p: Partner, v: string) => void }) {
  const [val, setVal] = useState<string>(p.commission_rate == null ? "" : String(p.commission_rate));
  useEffect(() => {
    setVal(p.commission_rate == null ? "" : String(p.commission_rate));
  }, [p.commission_rate]);
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-2">
        <div className="font-medium">{p.nome_loja}</div>
        <div className="text-xs text-muted-foreground">{p.slug}</div>
      </td>
      <td className="py-2 pr-2 text-xs capitalize text-muted-foreground">{p.status}</td>
      <td className="py-2 pr-2 text-right">
        <input
          type="number"
          step="0.01"
          min={0}
          max={100}
          placeholder="global"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-sm"
        />
      </td>
      <td className="py-2 pr-2 text-right">
        <button
          onClick={() => onSave(p, val)}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
        >
          <Save className="h-3 w-3" /> Salvar
        </button>
      </td>
    </tr>
  );
}
