import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyPartner } from "@/lib/partners.functions";
import { updatePartnerStore } from "@/lib/partner-panel.functions";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/parceiro/minha-loja")({
  component: MinhaLojaPage,
});

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file); });
}

function MinhaLojaPage() {
  const get = useServerFn(getMyPartner);
  const save = useServerFn(updatePartnerStore);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["my-partner"], queryFn: () => get({}) });

  const [form, setForm] = useState({
    nome_loja: "", descricao: "", logo_url: "", banner_url: "", cover_url: "",
    store_banners: [] as string[], direct_checkout_enabled: true,
    telefone: "",
    whatsapp: "", instagram: "", facebook: "", site: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.partner) return;
    const p: any = data.partner;
    const s = (p.endereco?.social ?? {}) as any;
    setForm({
      nome_loja: p.nome_loja || "",
      descricao: p.descricao || "",
      logo_url: p.logo_url || "",
      banner_url: p.banner_url || "",
      cover_url: p.cover_url || "",
      store_banners: Array.isArray(p.store_banners) ? p.store_banners : [],
      direct_checkout_enabled: p.direct_checkout_enabled !== false,
      telefone: p.telefone || "",
      whatsapp: s.whatsapp || "",
      instagram: s.instagram || "",
      facebook: s.facebook || "",
      site: s.site || "",
    });
  }, [data]);

  const mut = useMutation({
    mutationFn: (vars: any) => save({ data: vars }),
    onSuccess: () => { setMsg("Loja atualizada com sucesso."); qc.invalidateQueries({ queryKey: ["my-partner"] }); },
    onError: (e: any) => setMsg(e?.message || "Erro ao salvar."),
  });

  const onFile = async (k: "logo_url" | "banner_url" | "cover_url", f?: File | null) => {
    if (!f) return;
    if (f.size > 1_500_000) { setMsg("Imagem muito grande (máx 1.5MB)."); return; }
    setForm((x) => ({ ...x, [k]: "" }));
    const url = await fileToDataUrl(f);
    setForm((x) => ({ ...x, [k]: url }));
  };

  const onAddBanners = async (files: FileList | null) => {
    if (!files?.length) return;
    const arr: string[] = [];
    for (const f of Array.from(files).slice(0, 8)) {
      if (f.size > 1_500_000) { setMsg("Algum banner excede 1.5MB."); continue; }
      arr.push(await fileToDataUrl(f));
    }
    setForm((x) => ({ ...x, store_banners: [...x.store_banners, ...arr].slice(0, 8) }));
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    mut.mutate({
      nome_loja: form.nome_loja, descricao: form.descricao,
      logo_url: form.logo_url || null, banner_url: form.banner_url || null,
      cover_url: form.cover_url || null,
      store_banners: form.store_banners,
      direct_checkout_enabled: form.direct_checkout_enabled,
      telefone: form.telefone,
      social: { whatsapp: form.whatsapp, instagram: form.instagram, facebook: form.facebook, site: form.site },
    });
  };

  const inp = "w-full rounded border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Minha Loja</h1>
      {msg && <p className="rounded border border-border bg-card px-3 py-2 text-sm">{msg}</p>}
      <form onSubmit={submit} className="space-y-5">
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="font-semibold">Identidade visual</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Img label="Logo" url={form.logo_url} onPick={(f) => onFile("logo_url", f)} onClear={() => setForm({ ...form, logo_url: "" })} />
            <Img label="Banner principal" url={form.banner_url} onPick={(f) => onFile("banner_url", f)} onClear={() => setForm({ ...form, banner_url: "" })} />
            <Img label="Capa de fundo" url={form.cover_url} onPick={(f) => onFile("cover_url", f)} onClear={() => setForm({ ...form, cover_url: "" })} />
          </div>

          <div>
            <span className="text-xs text-muted-foreground">Banners do carrossel ({form.store_banners.length}/8)</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {form.store_banners.map((src, i) => (
                <div key={i} className="relative h-16 w-28 rounded overflow-hidden border border-border">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setForm({ ...form, store_banners: form.store_banners.filter((_, j) => j !== i) })} className="absolute top-0 right-0 bg-red-600 text-white text-[10px] px-1">×</button>
                </div>
              ))}
              {form.store_banners.length < 8 && (
                <label className="h-16 w-28 rounded border border-dashed border-border flex items-center justify-center cursor-pointer text-xs text-muted-foreground hover:bg-accent">
                  + Adicionar
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onAddBanners(e.target.files)} />
                </label>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm pt-2 border-t border-border">
            <input type="checkbox" checked={form.direct_checkout_enabled} onChange={(e) => setForm({ ...form, direct_checkout_enabled: e.target.checked })} />
            Permitir compra direta na loja (além do WhatsApp)
          </label>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="font-semibold">Informações</h2>
          <label className="block"><span className="text-xs text-muted-foreground">Nome da loja</span>
            <input className={inp} value={form.nome_loja} onChange={(e) => setForm({ ...form, nome_loja: e.target.value })} />
          </label>
          <label className="block"><span className="text-xs text-muted-foreground">Descrição</span>
            <textarea className={inp + " min-h-[100px]"} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </label>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="font-semibold">Contato e redes</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block"><span className="text-xs text-muted-foreground">Telefone</span>
              <input className={inp} value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-muted-foreground">WhatsApp</span>
              <input className={inp} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="55 11 99999-9999" /></label>
            <label className="block"><span className="text-xs text-muted-foreground">Instagram</span>
              <input className={inp} value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@usuario" /></label>
            <label className="block"><span className="text-xs text-muted-foreground">Facebook</span>
              <input className={inp} value={form.facebook} onChange={(e) => setForm({ ...form, facebook: e.target.value })} /></label>
            <label className="block md:col-span-2"><span className="text-xs text-muted-foreground">Site</span>
              <input className={inp} value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} placeholder="https://" /></label>
          </div>
        </section>

        <button type="submit" disabled={mut.isPending} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {mut.isPending ? "Salvando…" : "Salvar alterações"}
        </button>
      </form>
    </div>
  );
}

function Img({ label, url, onPick, onClear }: { label: string; url: string; onPick: (f: File | null) => void; onClear: () => void }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <label className="mt-1 block cursor-pointer rounded border border-dashed border-border p-3 text-center">
        {url ? <img src={url} alt={label} className="mx-auto h-24 object-contain" /> : <span className="text-xs text-muted-foreground">Selecionar imagem (máx 1.5MB)</span>}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      </label>
      {url && <button type="button" onClick={onClear} className="mt-1 text-xs text-destructive">Remover</button>}
    </div>
  );
}
