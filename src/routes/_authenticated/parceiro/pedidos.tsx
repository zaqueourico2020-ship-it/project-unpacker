import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPartnerOrders, updatePartnerOrderStatus } from "@/lib/partner-panel.functions";
import { useState } from "react";
import { Package, User, Phone, MapPin, FileText, Truck, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parceiro/pedidos")({
  component: PedidosPage,
});

const TABS = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Novos" },
  { key: "preparing", label: "Em preparação" },
  { key: "shipped", label: "Enviados" },
  { key: "delivered", label: "Entregues" },
  { key: "cancelled", label: "Cancelados" },
] as const;

const BRL = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: "🟡 Aguardando pagamento", color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300" },
  paid: { label: "🔵 Pedido aprovado", color: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  preparing: { label: "🟣 Em preparação", color: "bg-purple-500/10 text-purple-700 dark:text-purple-300" },
  shipped: { label: "🚚 Em transporte", color: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
  delivered: { label: "🟢 Entregue", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  cancelled: { label: "⚫ Cancelado", color: "bg-muted text-muted-foreground" },
  refunded: { label: "🔄 Reembolsado", color: "bg-muted text-muted-foreground" },
};

function OrderCard({ o, onUpdate }: { o: any; onUpdate: (vars: any) => void }) {
  const [open, setOpen] = useState(false);
  const [tracking, setTracking] = useState<string>(o.tracking_code ?? "");
  const addr = (o.shipping_address || {}) as Record<string, any>;
  const status = STATUS_LABEL[o.status] ?? { label: o.status, color: "bg-muted text-muted-foreground" };
  const orderCode = `GF-${new Date(o.created_at).getFullYear()}-${String(o.id).slice(0, 6).toUpperCase()}`;

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" /> Pedido #{orderCode}
          </p>
          <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</p>
        </div>
        <div className="text-right">
          <p className="font-bold">{BRL(o.total)}</p>
          <p className="text-xs text-muted-foreground">Você recebe {BRL(o.partner_net)}</p>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>{status.label}</span>
        <button onClick={() => setOpen((v) => !v)} className="ml-auto text-xs text-primary hover:underline">
          {open ? "Ocultar detalhes" : "Ver detalhes"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> Cliente
              </p>
              <p className="text-sm">{o.customer_name || "—"}</p>
              {o.customer_email && <p className="text-xs text-muted-foreground">{o.customer_email}</p>}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> Telefone
              </p>
              <p className="text-sm">{o.customer_phone || "—"}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> Endereço de entrega
            </p>
            <div className="mt-1 rounded-md border border-border/60 bg-background p-3 text-sm leading-relaxed">
              {addr.street ? (
                <>
                  <p>
                    {addr.street}, {addr.number || "s/n"}
                    {addr.complement ? ` — ${addr.complement}` : ""}
                  </p>
                  {addr.neighborhood && <p>{addr.neighborhood}</p>}
                  <p>
                    {[addr.city, addr.state].filter(Boolean).join("/")}
                    {addr.zip ? ` — CEP ${addr.zip}` : ""}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">Endereço não informado.</p>
              )}
            </div>
          </div>

          {addr.notes || addr.reference ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Observação
              </p>
              <p className="text-sm mt-1">{addr.notes || addr.reference}</p>
            </div>
          ) : null}

          {Array.isArray(o.items) && o.items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Itens</p>
              <ul className="mt-1 space-y-1 text-sm">
                {o.items.map((it: any, i: number) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      {it.qty || it.quantity || 1}× {it.name || it.title || "Item"}
                    </span>
                    <span className="text-muted-foreground">{BRL(Number(it.price || 0) * Number(it.qty || it.quantity || 1))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(o.status === "preparing" || o.status === "shipped") && (
            <div className="rounded-md border border-border/60 bg-background p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Truck className="h-3.5 w-3.5" /> Código de rastreio / Entregador
              </p>
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="Ex.: BR123456789BR ou nome do entregador"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                {o.status === "preparing" && (
                  <button
                    onClick={() => onUpdate({ id: o.id, status: "shipped", tracking_code: tracking || null })}
                    className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs"
                  >
                    Marcar como enviado
                  </button>
                )}
                {o.status === "shipped" && (
                  <button
                    onClick={() => onUpdate({ id: o.id, status: "shipped", tracking_code: tracking || null })}
                    className="rounded-md border border-border px-3 py-1.5 text-xs"
                  >
                    Atualizar rastreio
                  </button>
                )}
              </div>
            </div>
          )}

          {o.tracking_code && o.status !== "preparing" && (
            <p className="text-xs text-muted-foreground">
              <Truck className="inline h-3.5 w-3.5 mr-1" /> Rastreio enviado ao cliente:{" "}
              <span className="font-mono">{o.tracking_code}</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {o.status === "pending" && (
          <button onClick={() => onUpdate({ id: o.id, status: "preparing" })} className="rounded border border-border px-2 py-1 text-xs">
            Iniciar preparação
          </button>
        )}
        {o.status === "preparing" && (
          <button onClick={() => onUpdate({ id: o.id, status: "shipped", tracking_code: tracking || null })} className="rounded border border-border px-2 py-1 text-xs">
            Marcar como enviado
          </button>
        )}
        {o.status === "shipped" && (
          <button onClick={() => onUpdate({ id: o.id, status: "delivered" })} className="rounded border border-border px-2 py-1 text-xs">
            <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> Confirmar entrega
          </button>
        )}
        {["pending", "preparing"].includes(o.status) && (
          <button onClick={() => onUpdate({ id: o.id, status: "cancelled" })} className="rounded border border-destructive/40 text-destructive px-2 py-1 text-xs">
            Cancelar
          </button>
        )}
      </div>
    </article>
  );
}

function PedidosPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const list = useServerFn(getPartnerOrders);
  const update = useServerFn(updatePartnerOrderStatus);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["partner-orders", tab],
    queryFn: () => list({ data: { status: tab as any } }),
  });
  const mut = useMutation({
    mutationFn: (vars: any) => update({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partner-orders"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pedidos</h1>
      <p className="text-xs text-muted-foreground">
        Cada pedido aprovado libera os dados completos do cliente (nome, telefone e endereço de entrega) para que você prepare e envie.
      </p>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1 text-sm border ${tab === t.key ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data?.orders?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido nesta categoria.</p>}
      <div className="space-y-3">
        {data?.orders?.map((o: any) => (
          <OrderCard key={o.id} o={o} onUpdate={(v) => mut.mutate(v)} />
        ))}
      </div>
    </div>
  );
}
