import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPartnerDashboard } from "@/lib/partner-panel.functions";
import { getPartnerFollowerStats } from "@/lib/followers.functions";
import { TrendingUp, ShoppingBag, DollarSign, Wallet, Clock, Award, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parceiro/dashboard")({
  component: DashboardPage,
});

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function DashboardPage() {
  const fn = useServerFn(getPartnerDashboard);
  const followersFn = useServerFn(getPartnerFollowerStats);
  const { data, isLoading, error } = useQuery({ queryKey: ["partner-dashboard"], queryFn: () => fn({}) });
  const { data: followers } = useQuery({
    queryKey: ["partner-followers"],
    queryFn: () => followersFn({}),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  const cards = [
    { label: "Total de vendas", value: String(data.stats.sales), icon: TrendingUp },
    { label: "Pedidos recebidos", value: String(data.stats.totalOrders), icon: ShoppingBag },
    { label: "Faturamento", value: BRL(data.stats.faturamento), icon: DollarSign },
    { label: "Saldo disponível", value: BRL(data.stats.saldoDisponivel), icon: Wallet },
    { label: "Saldo pendente", value: BRL(data.stats.saldoPendente), icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data.partner.nome_loja}</h1>
          <p className="text-sm text-muted-foreground">slug: <code>/loja/{data.partner.slug}</code></p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold">
          <Award className="h-4 w-4" /> {data.level.emoji} {data.level.label}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs uppercase tracking-wide">{c.label}</span>
              <c.icon className="h-4 w-4" />
            </div>
            <p className="mt-2 text-xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-pink-400/30 bg-gradient-to-br from-pink-500/10 via-card to-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-pink-500">
            <Users className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Seguidores</span>
          </div>
          {followers?.tier && (
            <span className="rounded-full bg-pink-500/20 px-2.5 py-0.5 text-xs font-bold text-pink-600">
              {followers.tier.emoji} {followers.tier.label}
            </span>
          )}
        </div>
        <p className="mt-2 text-3xl font-bold">{(followers?.total ?? 0).toLocaleString("pt-BR")}</p>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span>+{followers?.week ?? 0} esta semana</span>
          <span>+{followers?.month ?? 0} este mês</span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Próximos níveis: 100 🥉 Bronze · 500 🥈 Prata · 1.000 🥇 Ouro · 5.000 💎 Diamante
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Comissão da plataforma: <strong className="text-foreground">12%</strong> · Você recebe <strong className="text-foreground">88%</strong> por venda.
        Os repasses ocorrem após a entrega confirmada do pedido.
      </div>
    </div>
  );
}
