import { createFileRoute, Outlet, Link, useNavigate, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Package, LogOut, Store, ExternalLink, LayoutDashboard, ShoppingBag,
  Truck, Wallet, Settings, Star, Banknote, MessageCircle, Shield,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";

export const Route = createFileRoute("/_authenticated/parceiro")({
  head: () => ({ meta: [{ title: "Painel do Parceiro — Grupo GF" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw redirect({ to: "/auth" });

    const { data: roleRow } = await (supabase as any)
      .from("user_roles").select("role")
      .eq("user_id", uid).eq("role", "partner").maybeSingle();

    if (!roleRow) {
      const { data: partner } = await (supabase as any)
        .from("partners").select("status").eq("user_id", uid).maybeSingle();
      if (partner?.status === "approved") return;
      if (partner) throw redirect({ to: "/parceiro/aguardando" as any });
      throw redirect({ to: "/" });
    }
  },
  component: PartnerLayout,
});

const NAV = [
  { to: "/parceiro/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/parceiro/produtos", label: "Produtos", icon: Package },
  { to: "/parceiro/pedidos", label: "Pedidos", icon: ShoppingBag },
  { to: "/parceiro/disputas", label: "Disputas", icon: Shield },
  { to: "/parceiro/mensagens", label: "Mensagens", icon: MessageCircle },
  { to: "/parceiro/frete", label: "Frete", icon: Truck },
  { to: "/parceiro/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/parceiro/minha-loja", label: "Minha Loja", icon: Settings },
  { to: "/parceiro/avaliacoes", label: "Avaliações", icon: Star },
  { to: "/parceiro/asaas", label: "Asaas", icon: Banknote },
] as const;

function PartnerLayout() {
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            <span className="text-lg font-bold tracking-tight">Painel do Parceiro GF</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <a href="/" className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
              <ExternalLink className="h-4 w-4" /> Ver loja
            </a>
            <button onClick={signOut} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to as any}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              activeProps={{ className: "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm bg-primary text-primary-foreground" }}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

