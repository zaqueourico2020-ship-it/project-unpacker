import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  partnerListMyProducts,
  partnerUpsertProduct,
  partnerDeleteProduct,
} from "@/lib/partner-products.functions";
import { Plus, Pencil, Trash2, RefreshCw, Package, X, Upload, Image as ImageIcon } from "lucide-react";
import { CATEGORIES_TREE, ALL_CATEGORIES } from "@/lib/categories";

export const Route = createFileRoute("/_authenticated/parceiro/produtos")({
  head: () => ({ meta: [{ title: "Meus produtos — Painel do Parceiro" }, { name: "robots", content: "noindex" }] }),
  component: PartnerProducts,
});

type Variant = {
  id?: string;
  name: string;
  color: string;
  size: string;
  sku: string;
  price: string;
  discount_price: string;
  stock: string;
  image_url: string;
};

type FormState = {
  id?: string;
  name: string;
  description: string;
  sku: string;
  price: string;
  discount_price: string;
  cost_price: string;
  stock_quantity: string;
  brand: string;
  category: string;
  subcategory: string;
  image_url: string;
  images: string[];
  notes: string;
  active: boolean;
  variants: Variant[];
};

const blankForm = (): FormState => ({
  name: "",
  description: "",
  sku: "",
  price: "",
  discount_price: "",
  cost_price: "",
  stock_quantity: "0",
  brand: "",
  category: "",
  subcategory: "",
  image_url: "",
  images: [],
  notes: "",
  active: true,
  variants: [],
});

const blankVariant = (): Variant => ({
  name: "",
  color: "",
  size: "",
  sku: "",
  price: "",
  discount_price: "",
  stock: "0",
  image_url: "",
});

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function PartnerProducts() {
  const list = useServerFn(partnerListMyProducts);
  const upsert = useServerFn(partnerUpsertProduct);
  const remove = useServerFn(partnerDeleteProduct);

  const [rows, setRows] = useState<any[]>([]);
  const [partner, setPartner] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm());

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await list();
      setRows(r.products);
      setPartner(r.partner);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(blankForm()); setOpen(true); };
  const openEdit = (p: any) => {
    setForm({
      id: p.id,
      name: p.name || "",
      description: p.description || "",
      sku: p.sku || "",
      price: String(p.price ?? ""),
      discount_price: p.discount_price != null ? String(p.discount_price) : "",
      cost_price: String(p.cost_price ?? ""),
      stock_quantity: String(p.stock_quantity ?? 0),
      brand: p.brand || "",
      category: p.category || "",
      subcategory: p.subcategory || "",
      image_url: p.image_url || "",
      images: Array.isArray(p.images) ? p.images : [],
      notes: p.notes || "",
      active: !!p.active,
      variants: (p.product_variants || []).map((v: any) => ({
        id: v.id,
        name: v.name || "",
        color: v.attributes?.color || "",
        size: v.attributes?.size || "",
        sku: v.sku || "",
        price: String(v.price ?? ""),
        discount_price: v.discount_price != null ? String(v.discount_price) : "",
        stock: String(v.stock ?? 0),
        image_url: v.image_url || "",
      })),
    });
    setOpen(true);
  };

  const onMainImage = async (file: File | null) => {
    if (!file) return;
    const url = await readAsDataUrl(file);
    setForm((f) => ({ ...f, image_url: url }));
  };

  const onAddImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const arr: string[] = [];
    for (const f of Array.from(files).slice(0, 10)) arr.push(await readAsDataUrl(f));
    setForm((f) => ({ ...f, images: [...f.images, ...arr].slice(0, 10) }));
  };

  const updateVariant = (i: number, patch: Partial<Variant>) => {
    setForm((f) => {
      const variants = f.variants.slice();
      variants[i] = { ...variants[i], ...patch };
      return { ...f, variants };
    });
  };

  const onVariantImage = async (i: number, file: File | null) => {
    if (!file) return;
    const url = await readAsDataUrl(file);
    updateVariant(i, { image_url: url });
  };

  const save = async () => {
    setSaving(true);
    try {
      await upsert({
        data: {
          id: form.id,
          name: form.name.trim(),
          description: form.description || null,
          sku: form.sku || null,
          price: Number(form.price) || 0,
          discount_price: form.discount_price ? Number(form.discount_price) : null,
          cost_price: Number(form.cost_price) || 0,
          stock_quantity: Math.max(0, parseInt(form.stock_quantity || "0", 10)),
          brand: form.brand || null,
          category: form.category || null,
          subcategory: form.subcategory || null,
          image_url: form.image_url || null,
          images: form.images,
          notes: form.notes || null,
          active: form.active,
          variants: form.variants.map((v) => ({
            id: v.id,
            name: (v.name || [v.color, v.size].filter(Boolean).join(" ") || "Variação").trim(),
            sku: v.sku || null,
            price: Number(v.price) || 0,
            discount_price: v.discount_price ? Number(v.discount_price) : null,
            stock: Math.max(0, parseInt(v.stock || "0", 10)),
            image_url: v.image_url || null,
            attributes: { color: v.color || undefined, size: v.size || undefined },
          })).filter((v) => v.name),
        },
      });
      setOpen(false);
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const del = async (p: any) => {
    if (!confirm(`Excluir "${p.name}"?`)) return;
    try { await remove({ data: { id: p.id } }); await load(); }
    catch (e: any) { alert(e?.message || "Erro ao excluir."); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Package size={20} /> Meus produtos</h1>
          {partner && <p className="text-xs text-muted-foreground mt-1">Loja: <strong>{partner.nome_loja || partner.id}</strong></p>}
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"><RefreshCw size={14} /> Atualizar</button>
          <button onClick={openCreate} className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90"><Plus size={14} /> Novo produto</button>
        </div>
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}

      {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Você ainda não cadastrou produtos.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-card p-3 flex flex-col">
              <div className="aspect-video rounded-md bg-muted overflow-hidden mb-2">
                {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> :
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground"><ImageIcon size={28} /></div>}
              </div>
              <div className="flex items-start justify-between gap-2">
                <strong className="text-sm line-clamp-2">{p.name}</strong>
                <ApprovalBadge status={p.approval_status} />
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                <span>R$ {Number(p.price || 0).toFixed(2)}</span>
                {p.discount_price && <span className="text-emerald-600">Promo: R$ {Number(p.discount_price).toFixed(2)}</span>}
                <span>Estoque: {p.stock_quantity}</span>
                {p.brand && <span>Marca: {p.brand}</span>}
                {!p.active && <span className="text-amber-600">Inativo</span>}
              </div>
              {p.product_variants?.length > 0 && <p className="text-xs text-muted-foreground mt-1">{p.product_variants.length} variação(ões)</p>}
              <div className="mt-3 flex gap-2">
                <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-border hover:bg-accent"><Pencil size={12} /> Editar</button>
                <button onClick={() => del(p)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700"><Trash2 size={12} /> Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 block h-[100dvh] touch-pan-y overflow-y-scroll overscroll-contain bg-black/50 px-0 py-0 [-webkit-overflow-scrolling:touch] sm:px-4 sm:py-6">
          <div className="mx-auto flex min-h-[100dvh] w-full flex-col bg-card text-card-foreground sm:min-h-[calc(100dvh-3rem)] sm:max-w-3xl sm:rounded-xl sm:border sm:border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sticky top-0 bg-card z-10">
              <h2 className="font-semibold">{form.id ? "Editar produto" : "Novo produto"}</h2>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-accent"><X size={18} /></button>
            </div>
            <div className="flex-1 p-4 pb-28 space-y-4">
              <Field label="Nome*"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Descrição"><textarea className="input min-h-[100px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Preço de venda (R$)*"><input type="number" step="0.01" min="0" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
                <Field label="Preço com desconto (R$)"><input type="number" step="0.01" min="0" className="input" value={form.discount_price} onChange={(e) => setForm({ ...form, discount_price: e.target.value })} /></Field>
                <Field label="Preço de custo (R$)"><input type="number" step="0.01" min="0" className="input" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></Field>
                <Field label="Estoque*"><input type="number" min="0" className="input" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} /></Field>
                <Field label="SKU"><input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
                <Field label="Marca"><input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
                <Field label="Categoria">
                  <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: "" })}>
                    <option value="">— Selecione —</option>
                    {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Subcategoria">
                  <select className="input disabled:opacity-50" value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} disabled={!form.category}>
                    <option value="">— Selecione —</option>
                    {(CATEGORIES_TREE[form.category] || []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Imagem principal">
                <div className="flex items-center gap-3">
                  <div className="h-20 w-20 rounded-md bg-muted overflow-hidden flex items-center justify-center">
                    {form.image_url ? <img src={form.image_url} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={20} className="text-muted-foreground" />}
                  </div>
                  <label className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-border hover:bg-accent cursor-pointer">
                    <Upload size={12} /> Enviar foto
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onMainImage(e.target.files?.[0] || null)} />
                  </label>
                  {form.image_url && <button type="button" onClick={() => setForm({ ...form, image_url: "" })} className="text-xs text-red-500 hover:underline">Remover</button>}
                </div>
              </Field>

              <Field label={`Galeria de fotos (${form.images.length}/10)`}>
                <div className="flex flex-wrap gap-2">
                  {form.images.map((src, i) => (
                    <div key={i} className="relative h-16 w-16 rounded overflow-hidden border border-border">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => setForm({ ...form, images: form.images.filter((_, j) => j !== i) })} className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5"><X size={10} /></button>
                    </div>
                  ))}
                  {form.images.length < 10 && (
                    <label className="h-16 w-16 rounded border border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-accent">
                      <Upload size={14} />
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onAddImages(e.target.files)} />
                    </label>
                  )}
                </div>
              </Field>

              <section className="rounded border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Variações (tamanho/cor)</h3>
                  <button type="button" onClick={() => setForm({ ...form, variants: [...form.variants, blankVariant()] })} className="text-xs px-2 py-1 rounded border border-border hover:bg-accent inline-flex items-center gap-1"><Plus size={12} /> Adicionar</button>
                </div>
                {form.variants.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma variação. (Opcional)</p>}
                {form.variants.map((v, i) => (
                  <div key={i} className="rounded border border-border p-2 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="h-14 w-14 shrink-0 rounded bg-muted overflow-hidden flex items-center justify-center">
                        {v.image_url ? <img src={v.image_url} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={14} className="text-muted-foreground" />}
                      </div>
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2">
                        <input placeholder="Cor" className="input" value={v.color} onChange={(e) => updateVariant(i, { color: e.target.value })} />
                        <input placeholder="Tamanho" className="input" value={v.size} onChange={(e) => updateVariant(i, { size: e.target.value })} />
                        <input placeholder="Nome / rótulo" className="input" value={v.name} onChange={(e) => updateVariant(i, { name: e.target.value })} />
                        <input placeholder="SKU" className="input" value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} />
                        <input type="number" step="0.01" placeholder="Preço (R$)" className="input" value={v.price} onChange={(e) => updateVariant(i, { price: e.target.value })} />
                        <input type="number" step="0.01" placeholder="Promo (R$)" className="input" value={v.discount_price} onChange={(e) => updateVariant(i, { discount_price: e.target.value })} />
                        <input type="number" placeholder="Estoque" className="input" value={v.stock} onChange={(e) => updateVariant(i, { stock: e.target.value })} />
                        <label className="inline-flex items-center justify-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent cursor-pointer">
                          <Upload size={12} /> Foto da variação
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => onVariantImage(i, e.target.files?.[0] || null)} />
                        </label>
                      </div>
                      <button type="button" onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })} className="p-1 rounded hover:bg-accent text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </section>

              <Field label="Observações"><textarea className="input min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anotações internas livres" /></Field>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Produto ativo
              </label>
            </div>
            <div className="sticky bottom-0 z-20 flex justify-end gap-2 border-t border-border bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_18px_rgba(0,0,0,0.18)]">
              <button onClick={() => setOpen(false)} className="text-sm px-4 py-2 rounded border border-border hover:bg-accent">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim() || !form.price} className="text-sm px-4 py-2 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">{saving ? "Salvando…" : "Salvar produto"}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`.input{width:100%;border:1px solid var(--border);background:var(--background);color:var(--foreground);border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.input:focus{border-color:var(--primary)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="text-xs text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}

function ApprovalBadge({ status }: { status?: string }) {
  const map: Record<string, string> = { pending: "bg-amber-500/15 text-amber-600", approved: "bg-emerald-500/15 text-emerald-600", rejected: "bg-red-500/15 text-red-600" };
  const label: Record<string, string> = { pending: "Pendente", approved: "Aprovado", rejected: "Rejeitado" };
  const s = status || "pending";
  return <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${map[s] || ""}`}>{label[s] || s}</span>;
}
