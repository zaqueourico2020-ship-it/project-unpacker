import { createFileRoute, Outlet, Link, useNavigate, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, ShoppingCart, Package, FileText, ClipboardList, LogOut, Image as ImageIcon, Store, Percent, MessageCircle, Wallet, ShieldAlert, ScrollText, Banknote, FileBarChart, Shield } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";

const OWNER_EMAIL = "grupogfredevarejistaoficial@gmail.com";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Grupo GF" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw redirect({ to: "/auth" });
    const email = userData.user?.email?.toLowerCase().trim();
    if (email === OWNER_EMAIL) {
      try { await (supabase as any).rpc("ensure_designated_owner_role"); } catch {}
      return;
    }
    const { data } = await (supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .in("role", ["admin", "owner"])
      .limit(1)
      .maybeSingle();
    if (!data) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/vendas", label: "Vendas", icon: ShoppingCart },
  { to: "/admin/produtos", label: "Produtos", icon: Package },
  { to: "/admin/banners", label: "Banners", icon: ImageIcon },
  { to: "/admin/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/admin/relatorios", label: "Relatórios", icon: FileText },
  { to: "/admin/parceiros", label: "Parceiros", icon: Store },
  { to: "/admin/comissoes", label: "Comissões", icon: Percent },
  { to: "/admin/chat", label: "Chat", icon: MessageCircle },
  { to: "/admin/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/admin/saques", label: "Saques", icon: Banknote },
  { to: "/admin/bloqueios", label: "Bloqueios", icon: ShieldAlert },
  { to: "/admin/disputas", label: "Disputas", icon: Shield },
  { to: "/admin/auditoria", label: "Auditoria", icon: ScrollText },
  { to: "/admin/relatorios-financeiros", label: "Rel. Financeiros", icon: FileBarChart },
] as const;

function AdminLayout() {
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
            <span className="text-lg font-bold tracking-tight">Grupo GF</span>
            <span className="text-xs text-muted-foreground">Painel administrativo</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button onClick={signOut} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
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
