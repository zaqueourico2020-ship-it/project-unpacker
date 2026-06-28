import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Clock, LogOut, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parceiro/aguardando")({
  head: () => ({ meta: [{ title: "Aguardando aprovação — Grupo GF" }, { name: "robots", content: "noindex" }] }),
  component: AwaitingApproval,
});

function AwaitingApproval() {
  const navigate = useNavigate();
  const [partner, setPartner] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    const { data: roleRow } = await (supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "partner")
      .maybeSingle();
    if (roleRow) {
      navigate({ to: "/parceiro/produtos", replace: true });
      return;
    }
    const { data: p } = await (supabase as any)
      .from("partners")
      .select("status, nome_loja, rejection_reason")
      .eq("user_id", uid)
      .maybeSingle();
    if (p?.status === "approved") {
      navigate({ to: "/parceiro/produtos", replace: true });
      return;
    }
    setPartner(p);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center mb-4">
          <Clock size={28} />
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Verificando seu cadastro…</p>
        ) : !partner ? (
          <>
            <h1 className="text-lg font-semibold">Você ainda não é parceiro</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Faça seu cadastro como parceiro para vender no Grupo GF.
            </p>
            <button
              onClick={() => navigate({ to: "/seja-um-parceiro" as any })}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
            >
              Cadastrar minha loja
            </button>
          </>
        ) : partner.status === "rejected" ? (
          <>
            <h1 className="text-lg font-semibold">Cadastro rejeitado</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {partner.rejection_reason
                ? `Motivo: ${partner.rejection_reason}`
                : "Entre em contato com o suporte para mais informações."}
            </p>
          </>
        ) : partner.status === "suspended" ? (
          <>
            <h1 className="text-lg font-semibold">Cadastro suspenso</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Entre em contato com o suporte para reativar sua loja.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Aguardando aprovação</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {partner.nome_loja ? <>Sua loja <strong>{partner.nome_loja}</strong> está em análise.</> : "Seu cadastro está em análise."}{" "}
              Você receberá acesso ao painel assim que for aprovado.
            </p>
          </>
        )}

        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <RefreshCw size={14} /> Verificar novamente
          </button>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>
    </div>
  );
}
