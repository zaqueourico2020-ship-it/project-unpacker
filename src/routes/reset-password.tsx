import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — Grupo GF" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    // Supabase auto-creates a recovery session from the URL hash.
    const { data: sub } = supabase.auth.onAuthStateChange((event: any) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }: any) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setMsg({ kind: "err", text: "Senha deve ter ao menos 6 caracteres." });
      return;
    }
    if (password !== confirm) {
      setMsg({ kind: "err", text: "As senhas não coincidem." });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg({ kind: "ok", text: "Senha atualizada! Redirecionando..." });
      setTimeout(() => navigate({ to: "/", replace: true }), 1500);
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.message ?? "Erro ao atualizar a senha." });
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "#0a1628" }}>
      <div className="w-full max-w-md">
        <Link to="/auth" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-4">
          <ArrowLeft size={14} /> Voltar
        </Link>
        <form onSubmit={submit} className="bg-[#162340] border border-cyan-500/20 rounded-2xl p-6 space-y-3 shadow-xl">
          <h1 className="text-xl font-bold text-white text-center">Definir nova senha</h1>
          {!ready ? (
            <p className="text-xs text-amber-300 text-center">
              Abra o link recebido por email para validar a redefinição.
            </p>
          ) : (
            <>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                <input
                  required
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nova senha"
                  className={inputCls}
                />
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                <input
                  required
                  type="password"
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirmar nova senha"
                  className={inputCls}
                />
              </div>
              {msg && (
                <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>
              )}
              <button
                disabled={loading}
                type="submit"
                className="w-full py-2.5 rounded-lg font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}
              >
                {loading ? "Salvando..." : "Atualizar senha"}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
