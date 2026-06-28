import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listOrders, updateOrderStatus } from "@/lib/admin-orders.functions";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, RefreshCw, Package, MapPin, Phone, User as UserIcon, TrendingUp, DollarSign, ShoppingBag, Clock, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos — Admin Grupo GF" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const STATUSES = ["pending", "approved", "preparing", "shipped", "out_for_delivery", "delivered", "cancelled"] as const;
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  approved: "Pago",
  preparing: "Preparando Envio",
  shipped: "Em Transporte",
  out_for_delivery: "Saiu para Entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  preparing: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  shipped: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  out_for_delivery: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  delivered: "bg-green-500/20 text-green-300 border-green-500/40",
  cancelled: "bg-red-500/20 text-red-300 border-red-500/40",
};

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchOrders = useServerFn(listOrders);
  const updateStatus = useServerFn(updateOrderStatus);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => fetchOrders({}),
  });

  const mutation = useMutation({
    mutationFn: (v: { id: string; status: typeof STATUSES[number] }) => updateStatus({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orders"] }),
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const orders = (data?.orders ?? []) as any[];
  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ordersToday = orders.filter(o => new Date(o.created_at) >= today);
    const revenueTotal = orders.reduce((s, o) => s + Number(o.total || 0), 0);
    const revenueToday = ordersToday.reduce((s, o) => s + Number(o.total || 0), 0);
    const pending = orders.filter(o => o.status === "pending").length;
    const avgTicket = orders.length ? revenueTotal / orders.length : 0;
    return { ordersToday: ordersToday.length, revenueToday, revenueTotal, pending, avgTicket, totalOrders: orders.length };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (![o.customer_name, o.customer_phone, o.id].some(v => String(v || "").toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [orders, statusFilter, query]);

  return (
    <div className="min-h-screen text-slate-100" style={{ background: "#0a1628" }}>
      <header className="sticky top-0 z-10 backdrop-blur-md border-b border-cyan-500/10 px-4 py-3 flex items-center gap-3" style={{ background: "rgba(10,22,40,0.95)" }}>
        <Package className="text-cyan-400" />
        <h1 className="font-bold text-lg flex-1">Painel Admin</h1>
        <button onClick={() => refetch()} className="p-2 hover:bg-white/10 rounded" title="Atualizar">
          <RefreshCw size={18} className={isFetching ? "animate-spin" : ""} />
        </button>
        <button onClick={signOut} className="p-2 hover:bg-white/10 rounded text-red-400" title="Sair">
          <LogOut size={18} />
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* KPI Dashboard */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={<ShoppingBag size={18} />} label="Pedidos hoje" value={String(stats.ordersToday)} accent="from-cyan-500/30 to-cyan-500/0" />
          <KpiCard icon={<DollarSign size={18} />} label="Faturamento hoje" value={brl(stats.revenueToday)} accent="from-emerald-500/30 to-emerald-500/0" />
          <KpiCard icon={<TrendingUp size={18} />} label="Ticket médio" value={brl(stats.avgTicket)} accent="from-blue-500/30 to-blue-500/0" />
          <KpiCard icon={<Clock size={18} />} label="Pendentes" value={String(stats.pending)} accent="from-amber-500/30 to-amber-500/0" />
        </section>

        <section className="bg-[#162340] border border-cyan-500/10 rounded-xl p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por cliente, telefone, #ID..."
              className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-400" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="all">Todos os status</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <span className="text-xs text-slate-400 ml-auto">{filteredOrders.length} de {orders.length}</span>
        </section>

        {isLoading && <p className="text-center text-slate-400 py-8">Carregando...</p>}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-300">
            {(error as Error).message}
            <p className="mt-2 text-xs text-slate-400">
              Se for "Forbidden", peça ao desenvolvedor para conceder o papel <code>admin</code> ao seu usuário.
            </p>
          </div>
        )}
        {!isLoading && filteredOrders.length === 0 && (
          <p className="text-center text-slate-400 py-8">Nenhum pedido encontrado.</p>
        )}
        {filteredOrders.map((o: any) => (
          <div key={o.id} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4">
            <div className="flex flex-wrap items-start gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold">{brl(Number(o.total))}</p>
                <p className="text-xs text-slate-400">
                  {new Date(o.created_at).toLocaleString("pt-BR")} · #{o.id.slice(0, 8)}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_COLOR[o.status] ?? ""}`}>
                {STATUS_LABEL[o.status] ?? o.status}
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-sm mb-3">
              <div className="space-y-1">
                <p className="text-xs text-slate-400 font-semibold uppercase">Cliente</p>
                <p className="flex items-center gap-1.5"><UserIcon size={14} className="text-cyan-400" />{o.customer_name}</p>
                <p className="flex items-center gap-1.5"><Phone size={14} className="text-cyan-400" />{o.customer_phone}</p>
                {o.customer_email && <p className="text-xs text-slate-400">{o.customer_email}</p>}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-400 font-semibold uppercase">Entrega</p>
                <p className="flex items-center gap-1.5"><UserIcon size={14} className="text-orange-400" />{o.recipient_name}</p>
                <p className="flex items-center gap-1.5"><Phone size={14} className="text-orange-400" />{o.recipient_phone}</p>
                <p className="flex items-start gap-1.5">
                  <MapPin size={14} className="text-orange-400 mt-0.5 shrink-0" />
                  <span className="text-xs">
                    {o.street}, {o.number}{o.complement ? ` - ${o.complement}` : ""}<br />
                    {o.neighborhood} · {o.city}/{o.state} · CEP {o.zip}
                    {o.reference && <><br /><span className="text-slate-400">Ref: {o.reference}</span></>}
                  </span>
                </p>
                {o.notes && <p className="text-xs text-amber-300">Obs: {o.notes}</p>}
              </div>
            </div>

            <details className="mb-3">
              <summary className="text-xs text-cyan-300 cursor-pointer">
                Itens ({Array.isArray(o.items) ? o.items.length : 0})
              </summary>
              <ul className="mt-2 text-xs space-y-1 pl-3">
                {(o.items as any[]).map((it, idx) => (
                  <li key={idx}>{it.qty}× {it.name} — {brl(it.price * it.qty)}</li>
                ))}
              </ul>
              {o.coupon_code && <p className="text-xs text-emerald-400 mt-1">Cupom: {o.coupon_code} (-{brl(Number(o.discount))})</p>}
            </details>

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Status:</label>
              <select
                value={o.status}
                onChange={(e) => mutation.mutate({ id: o.id, status: e.target.value as any })}
                className="bg-[#0f1d32] border border-cyan-500/20 rounded px-2 py-1 text-xs">
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <a
                href={`https://wa.me/${o.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá ${o.customer_name}, sobre seu pedido #${o.id.slice(0,8)} no Grupo GF...`)}`}
                target="_blank" rel="noreferrer"
                className="ml-auto text-xs px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
                WhatsApp
              </a>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#162340] border border-cyan-500/15 rounded-xl p-3`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} pointer-events-none`} />
      <div className="relative">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="text-cyan-300">{icon}</span>
          <span className="text-[11px] uppercase tracking-wide">{label}</span>
        </div>
        <p className="mt-1 text-lg font-bold text-white truncate">{value}</p>
      </div>
    </div>
  );
}
