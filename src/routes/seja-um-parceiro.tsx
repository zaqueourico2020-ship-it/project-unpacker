import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { registerPartner } from "@/lib/partners.functions";
import { Store, Upload, ArrowLeft, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/seja-um-parceiro")({
  head: () => ({
    meta: [
      { title: "Seja um Parceiro — Grupo GF" },
      { name: "description", content: "Cadastre-se como parceiro do Grupo GF e venda seus produtos em nossa plataforma." },
      { property: "og:title", content: "Seja um Parceiro — Grupo GF" },
      { property: "og:description", content: "Cadastre sua loja, configure seus produtos e fretes, e venda no Grupo GF." },
    ],
  }),
  component: SejaParceiro,
});

type Form = {
  tipo: "PF" | "PJ";
  nome: string;
  documento: string;
  email: string;
  telefone: string;
  password: string;
  nome_loja: string;
  descricao: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  logo_url: string;
  banner_url: string;
};

const empty: Form = {
  tipo: "PJ", nome: "", documento: "", email: "", telefone: "", password: "",
  nome_loja: "", descricao: "",
  cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  logo_url: "", banner_url: "",
};

function prepareImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Formato de imagem inválido."));
      image.onload = () => {
        const maxWidth = 1280;
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Não foi possível preparar a imagem."));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", 0.78));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function SejaParceiro() {
  const navigate = useNavigate();
  const register = useServerFn(registerPartner);
  const [form, setForm] = useState<Form>(empty);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [done, setDone] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onFile = async (key: "logo_url" | "banner_url", file?: File | null) => {
    if (!file) return;
    if (file.size > 8_000_000) { setMsg({ kind: "err", text: "Imagem muito grande (máx. 8 MB)." }); return; }
    try {
      const url = await prepareImage(file);
      set(key, url);
      setMsg(null);
    } catch (error) {
      setMsg({ kind: "err", text: error instanceof Error ? error.message : "Não foi possível preparar a imagem." });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const registration = register({
        data: {
          tipo: form.tipo,
          nome: form.nome.trim(),
          documento: form.documento,
          email: form.email.trim(),
          telefone: form.telefone,
          password: form.password,
          nome_loja: form.nome_loja.trim(),
          descricao: form.descricao.trim() || null,
          logo_url: form.logo_url || null,
          banner_url: form.banner_url || null,
          endereco: {
            cep: form.cep, rua: form.rua, numero: form.numero,
            complemento: form.complemento || null,
            bairro: form.bairro, cidade: form.cidade,
            estado: form.estado.toUpperCase().slice(0, 2),
          },
        },
      });
      await Promise.race([
        registration,
        new Promise<never>((_, reject) => window.setTimeout(
          () => reject(new Error("O envio demorou demais. Verifique sua internet e tente novamente; seus dados continuam preenchidos.")),
          30_000,
        )),
      ]);
      setDone(true);
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.message || "Falha no cadastro." });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0a1628" }}>
        <div className="max-w-md w-full bg-[#0f1d32] border border-cyan-500/20 rounded-xl p-8 text-center text-slate-100">
          <CheckCircle2 className="mx-auto text-emerald-400 mb-3" size={56} />
          <h1 className="text-xl font-bold mb-2">Cadastro recebido!</h1>
          <p className="text-sm text-slate-300 mb-6">
            Seu cadastro está em análise. Você será notificado por e-mail assim que for aprovado pela equipe Grupo GF.
          </p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="w-full py-3 rounded-lg font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}
          >
            Voltar à loja
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-100" style={{ background: "#0a1628" }}>
      <header className="border-b border-cyan-500/20 bg-[#0f1d32]">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="p-2 hover:bg-white/5 rounded"><ArrowLeft size={20} /></Link>
          <Store className="text-cyan-400" size={22} />
          <h1 className="text-lg font-bold">Seja um Parceiro</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-6 p-4 rounded-lg bg-gradient-to-br from-[#0a4fe3]/20 to-[#ff6a00]/20 border border-cyan-500/20">
          <h2 className="font-semibold mb-1">Venda seus produtos no Grupo GF</h2>
          <p className="text-sm text-slate-300">
            Cadastre sua loja, configure seus produtos, fretes e regiões de entrega. Após aprovação você terá acesso ao painel do parceiro.
          </p>
        </div>

        {msg && (
          <div className={`mb-4 p-3 rounded text-sm ${msg.kind === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={submit} className="space-y-5">
          <Section title="Tipo de cadastro">
            <div className="flex gap-2">
              {(["PJ","PF"] as const).map((t) => (
                <button type="button" key={t} onClick={() => set("tipo", t)}
                  className={`flex-1 py-2 rounded border text-sm font-semibold ${form.tipo === t ? "bg-cyan-500/20 border-cyan-400 text-cyan-200" : "bg-[#162340] border-white/10 text-slate-300"}`}>
                  {t === "PJ" ? "Pessoa Jurídica (CNPJ)" : "Pessoa Física (CPF)"}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Dados pessoais / empresa">
            <Field label={form.tipo === "PJ" ? "Razão social / Nome" : "Nome completo"}>
              <input required value={form.nome} onChange={(e) => set("nome", e.target.value)} className={inp} />
            </Field>
            <Field label={form.tipo === "PJ" ? "CNPJ" : "CPF"}>
              <input required value={form.documento} onChange={(e) => set("documento", e.target.value)} className={inp}
                placeholder={form.tipo === "PJ" ? "00.000.000/0000-00" : "000.000.000-00"} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="E-mail"><input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inp} /></Field>
              <Field label="Telefone"><input required value={form.telefone} onChange={(e) => set("telefone", e.target.value)} className={inp} placeholder="(00) 00000-0000" /></Field>
            </div>
            <Field label="Senha de acesso">
              <input required type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className={inp} minLength={6} placeholder="Mínimo 6 caracteres" />
            </Field>
          </Section>

          <Section title="Endereço">
            <div className="grid grid-cols-3 gap-3">
              <Field label="CEP"><input required value={form.cep} onChange={(e) => set("cep", e.target.value)} className={inp} /></Field>
              <Field label="Estado (UF)"><input required value={form.estado} onChange={(e) => set("estado", e.target.value)} className={inp} maxLength={2} /></Field>
              <Field label="Cidade"><input required value={form.cidade} onChange={(e) => set("cidade", e.target.value)} className={inp} /></Field>
            </div>
            <Field label="Bairro"><input required value={form.bairro} onChange={(e) => set("bairro", e.target.value)} className={inp} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Field label="Rua"><input required value={form.rua} onChange={(e) => set("rua", e.target.value)} className={inp} /></Field></div>
              <Field label="Número"><input required value={form.numero} onChange={(e) => set("numero", e.target.value)} className={inp} /></Field>
            </div>
            <Field label="Complemento (opcional)"><input value={form.complemento} onChange={(e) => set("complemento", e.target.value)} className={inp} /></Field>
          </Section>

          <Section title="Dados da loja">
            <Field label="Nome da loja"><input required value={form.nome_loja} onChange={(e) => set("nome_loja", e.target.value)} className={inp} /></Field>
            <Field label="Descrição (opcional)">
              <textarea value={form.descricao} onChange={(e) => set("descricao", e.target.value)} className={inp + " min-h-[80px]"} maxLength={2000} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <ImageField label="Logo" url={form.logo_url} onPick={(f) => onFile("logo_url", f)} onClear={() => set("logo_url", "")} />
              <ImageField label="Banner" url={form.banner_url} onPick={(f) => onFile("banner_url", f)} onClear={() => set("banner_url", "")} />
            </div>
          </Section>

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-lg font-semibold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
            {loading ? "Enviando..." : "Enviar cadastro para análise"}
          </button>

          <p className="text-[11px] text-slate-400 text-center">
            Ao enviar, você concorda em fornecer informações verdadeiras. A análise é feita pela equipe Grupo GF.
          </p>
        </form>
      </main>
    </div>
  );
}

const inp = "w-full bg-[#162340] border border-white/10 rounded px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 outline-none";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#0f1d32] border border-white/10 rounded-lg p-4 space-y-3">
      <h3 className="font-semibold text-cyan-300 text-sm">{title}</h3>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
function ImageField({ label, url, onPick, onClear }: { label: string; url: string; onPick: (f: File | null) => void; onClear: () => void }) {
  return (
    <div>
      <span className="block text-xs text-slate-400 mb-1">{label}</span>
      <label className="block border border-dashed border-white/20 rounded p-3 text-center cursor-pointer hover:border-cyan-400">
        {url ? (
          <img src={url} alt={label} className="h-20 mx-auto object-contain" />
        ) : (
          <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Upload size={14} /> Selecionar imagem</span>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      </label>
      {url && <button type="button" onClick={onClear} className="text-[11px] text-red-400 mt-1">Remover</button>}
    </div>
  );
}