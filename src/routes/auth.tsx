import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { confirmEmailByAddress, signUpAndConfirm } from "@/lib/auth.functions";
import { Store, User as UserIcon, Mail, Phone, Lock, IdCard, ArrowLeft, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Grupo GF" },
      { name: "description", content: "Crie sua conta no Grupo GF como lojista ou pessoa física." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Audience = "lojista" | "pessoa_fisica";
type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const initialAudience: Audience =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tipo") === "lojista"
      ? "lojista"
      : "pessoa_fisica";
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const [mode, setMode] = useState<Mode>("signin");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    cnpj: "",
    password: "",
  });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }: any) => {
      if (data.user) {
        const dest = await resolvePostLoginDestination(data.user.id);
        navigate({ to: dest as any, replace: true });
      }
    });
  }, [navigate]);

  const reset = () => {
    setForm({ fullName: "", email: "", phone: "", cnpj: "", password: "" });
    setMsg(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMsg({ kind: "ok", text: "Enviamos um link para redefinir sua senha. Confira sua caixa de entrada." });
      } else if (mode === "signup") {
        const email = form.email.trim().toLowerCase();
        const fullName = form.fullName.trim();
        const phone = form.phone.trim();
        if (fullName.length < 2) {
          throw new Error("Informe seu nome completo.");
        }
        if (phone.replace(/\D/g, "").length < 10) {
          throw new Error("Informe um telefone válido com DDD.");
        }
        if (audience === "lojista" && form.cnpj.replace(/\D/g, "").length < 11) {
          throw new Error("Informe um CNPJ válido.");
        }
        await signUpAndConfirm({
          data: {
            email,
            password: form.password,
            userType: audience,
            fullName,
            phone,
            cnpj: audience === "lojista" ? form.cnpj.trim() : null,
          },
        });
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: form.password,
        });
        if (signInError) {
          setMsg({ kind: "ok", text: "Conta criada! Faça login para continuar." });
          setMode("signin");
          setLoading(false);
          return;
        }
        {
          const { data: u } = await supabase.auth.getUser();
          const dest = await resolvePostLoginDestination(u.user?.id);
          navigate({ to: dest as any, replace: true });
        }
      } else {
        let { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error && /(confirm|invalid login credentials)/i.test(error.message || "")) {
          // Pode ser e-mail não confirmado — confirma no servidor e tenta de novo
          try {
            await confirmEmailByAddress({ data: { email: form.email } });
            const retry = await supabase.auth.signInWithPassword({
              email: form.email,
              password: form.password,
            });
            error = retry.error;
          } catch {
            // mantém o erro original
          }
        }
        if (error) throw error;
        {
          const { data: u } = await supabase.auth.getUser();
          const dest = await resolvePostLoginDestination(u.user?.id);
          navigate({ to: dest as any, replace: true });
        }

      }
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.message ?? "Erro inesperado." });
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400";

  const title =
    mode === "forgot"
      ? "Redefinir senha"
      : mode === "signup"
      ? audience === "lojista"
        ? "Cadastro Lojista"
        : "Cadastro Pessoa Física"
      : audience === "lojista"
      ? "Entrar como Lojista"
      : "Entrar como Pessoa Física";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "#0a1628" }}>
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-4">
          <ArrowLeft size={14} /> Voltar para a loja
        </Link>

        {/* Audience tab removed — only Pessoa Física */}


        <form onSubmit={submit} className="bg-[#162340] border border-cyan-500/20 rounded-2xl p-6 space-y-3 shadow-xl">
          <h1 className="text-xl font-bold text-white text-center">{title}</h1>
          <p className="text-xs text-slate-400 text-center -mt-1">
            {mode === "forgot"
              ? "Informe seu email para receber o link."
              : audience === "lojista"
              ? "Acesso para parceiros e revendedores."
              : "Sua conta de cliente Grupo GF."}
          </p>

          {mode === "signup" && (
            <>
              <Field icon={<UserIcon size={16} />}>
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Nome completo"
                  className={inputCls}
                />
              </Field>
              {audience === "lojista" && (
                <Field icon={<IdCard size={16} />}>
                  <input
                    required
                    value={form.cnpj}
                    onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                    placeholder="CNPJ"
                    className={inputCls}
                  />
                </Field>
              )}
              <Field icon={<Phone size={16} />}>
                <input
                  required
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Telefone com DDD"
                  className={inputCls}
                />
              </Field>
            </>
          )}

          <Field icon={<Mail size={16} />}>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email"
              className={inputCls}
            />
          </Field>

          {mode !== "forgot" && (
            <Field
              icon={<Lock size={16} />}
              rightIcon={
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((s) => !s)}
                  className="text-cyan-400 hover:text-cyan-300 focus:outline-none"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            >
              <input
                required
                type={showPassword ? "text" : "password"}
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={mode === "signup" ? "Crie uma senha (mín. 6)" : "Senha"}
                className={inputCls + " pr-10"}
              />
            </Field>
          )}

          {msg && (
            <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>
          )}

          <button
            disabled={loading}
            type="submit"
            className="w-full py-2.5 rounded-lg font-semibold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}
          >
            {loading
              ? "Aguarde..."
              : mode === "forgot"
              ? "Enviar link de redefinição"
              : mode === "signup"
              ? "Criar conta"
              : "Entrar"}
          </button>

          {mode !== "forgot" && (
            <>
              <div className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-cyan-500/20" />
                <span className="text-[10px] uppercase tracking-wider text-slate-500">ou</span>
                <div className="h-px flex-1 bg-cyan-500/20" />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setMsg(null);
                  setLoading(true);
                  const result = await lovable.auth.signInWithOAuth("google", {
                    redirect_uri: window.location.origin,
                  });
                  if (result.error) {
                    setMsg({ kind: "err", text: result.error.message ?? "Erro no login com Google." });
                    setLoading(false);
                    return;
                  }
                  if (result.redirected) return;
                  navigate({ to: "/", replace: true });
                }}
                className="w-full py-2.5 rounded-lg font-semibold text-slate-900 bg-white hover:bg-slate-100 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <GoogleIcon />
                Continuar com Google
              </button>
            </>
          )}

          <div className="flex items-center justify-between text-xs pt-1">
            {mode !== "signup" && (
              <button type="button" onClick={() => { setMode("signup"); setMsg(null); }} className="text-cyan-300 hover:underline">
                Criar conta
              </button>
            )}
            {mode === "signup" && (
              <button type="button" onClick={() => { setMode("signin"); setMsg(null); }} className="text-cyan-300 hover:underline">
                Já tenho conta
              </button>
            )}
            {mode !== "forgot" ? (
              <button type="button" onClick={() => { setMode("forgot"); setMsg(null); }} className="text-slate-400 hover:text-slate-200">
                Esqueci minha senha
              </button>
            ) : (
              <button type="button" onClick={() => { setMode("signin"); setMsg(null); }} className="text-slate-400 hover:text-slate-200">
                Voltar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c3 0 5.7 1.1 7.7 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.8 0 19.3-7.8 19.3-19.5 0-1.2-.1-2.3-.3-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c3 0 5.7 1.1 7.7 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 43.5c5.1 0 9.8-2 13.3-5.2l-6.2-5.2C29.2 34.5 26.7 35.5 24 35.5c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.4 4.2-4.4 5.6l6.2 5.2C40.9 36 43.5 30.5 43.5 24c0-1.2-.1-2.3-.3-3.5z"/>
    </svg>
  );
}

function Field({
  icon,
  rightIcon,
  children,
}: {
  icon: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400">{icon}</span>
      {children}
      {rightIcon && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightIcon}</span>
      )}
    </div>
  );
}

async function resolvePostLoginDestination(userId?: string | null): Promise<string> {
  if (!userId) return "/";
  try {
    const { data: currentUser } = await supabase.auth.getUser();
    const email = currentUser.user?.email?.toLowerCase().trim();
    if (email === "grupogfredevarejistaoficial@gmail.com") {
      try { await (supabase as any).rpc("ensure_designated_owner_role"); } catch {}
      return "/admin";
    }

    const { data: roles } = await (supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const set = new Set<string>((roles || []).map((r: any) => r.role));
    if (set.has("admin") || set.has("owner")) return "/admin";
    if (set.has("partner")) return "/parceiro/produtos";

    // Has a partner application that isn't approved yet?
    const { data: partner } = await (supabase as any)
      .from("partners")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    if (partner) return "/parceiro/aguardando";
  } catch {
    // fall through
  }
  return "/";
}
