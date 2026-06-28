import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { deleteProduct, listProducts, upsertProduct } from "@/lib/admin-products.functions";
import { brl } from "@/lib/admin-export";
import { Pencil, Plus, Trash2, X, Upload, Image as ImageIcon } from "lucide-react";
import { CATEGORIES_TREE, ALL_CATEGORIES } from "@/lib/categories";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const Route = createFileRoute("/_authenticated/admin/produtos")({
  component: ProdutosPage,
});

export type ProductVariation = {
  color: string;
  size: string;
  name?: string;
  sku?: string;
  price: string;
  discount_price?: string;
  stock: string;
  image_url?: string;
};

const VARIATIONS_LS_KEY = "gf_product_variations";

function loadVariationsMap(): Record<string, ProductVariation[]> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(VARIATIONS_LS_KEY) || "{}"); }
  catch { return {}; }
}
function saveVariationsMap(map: Record<string, ProductVariation[]>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(VARIATIONS_LS_KEY, JSON.stringify(map));
}
export function getProductVariations(productId: string): ProductVariation[] {
  return loadVariationsMap()[productId] || [];
}

type ProdForm = {
  id?: string;
  name: string;
  description: string;
  sku: string;
  price: string;
  cost_price: string;
  stock_quantity: string;
  image_url: string;
  active: boolean;
  category: string;
  subcategory: string;
  variations: ProductVariation[];
};

const emptyVariant = (): ProductVariation => ({ color: "", size: "", name: "", sku: "", price: "", discount_price: "", stock: "0", image_url: "" });
const empty: ProdForm = { name: "", description: "", sku: "", price: "", cost_price: "", stock_quantity: "0", image_url: "", active: true, category: "", subcategory: "", variations: [] };


function ProdutosPage() {
  const list = useServerFn(listProducts);
  const upsert = useServerFn(upsertProduct);
  const del = useServerFn(deleteProduct);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-products"], queryFn: () => list({}) });
  const [form, setForm] = useState<ProdForm | null>(null);
  const [variationsMap, setVariationsMap] = useState<Record<string, ProductVariation[]>>({});
  useEffect(() => { setVariationsMap(loadVariationsMap()); }, []);

  const mUp = useMutation({
    mutationFn: async (f: ProdForm) => {
      const res = await upsert({
        data: {
          id: f.id,
          name: f.name,
          description: f.description || undefined,
          sku: f.sku || undefined,
          price: Number(f.price) || 0,
          cost_price: Number(f.cost_price) || 0,
          stock_quantity: Number(f.stock_quantity) || 0,
          image_url: f.image_url || undefined,
          active: f.active,
          category: f.category || undefined,
          subcategory: f.subcategory || undefined,
        },

      });
      const pid = (res as any)?.id || f.id;
      if (pid) {
        const map = loadVariationsMap();
        const cleaned: ProductVariation[] = f.variations
          .map((v) => ({
            color: (v.color || "").trim(),
            size: (v.size || "").trim(),
            name: (v.name || "").trim(),
            sku: (v.sku || "").trim(),
            price: String(v.price || ""),
            discount_price: v.discount_price ? String(v.discount_price) : "",
            stock: String(v.stock || "0"),
            image_url: v.image_url || "",
          }))
          .filter((v) => v.color || v.size || v.name);
        if (cleaned.length > 0) map[pid] = cleaned; else delete map[pid];
        saveVariationsMap(map);
        setVariationsMap(map);
      }
      return res;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-products"] }); setForm(null); },
  });
  const mDel = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: (_d, id) => {
      const map = loadVariationsMap();
      if (map[id]) { delete map[id]; saveVariationsMap(map); setVariationsMap(map); }
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
  });

  const prods = (data?.products ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-muted-foreground">Cadastro com custo para cálculo de lucro</p>
        </div>
        <button onClick={() => setForm({ ...empty })} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo produto
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2 text-right">Preço</th>
              <th className="px-3 py-2 text-right">Custo</th>
              <th className="px-3 py-2 text-right">Margem</th>
              <th className="px-3 py-2 text-right">Estoque</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Carregando…</td></tr>}
            {!isLoading && prods.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nenhum produto cadastrado.</td></tr>}
            {prods.map((p) => {
              const margin = Number(p.price) > 0 ? ((Number(p.price) - Number(p.cost_price)) / Number(p.price)) * 100 : 0;
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.sku || "—"}</td>
                  <td className="px-3 py-2 text-right">{brl(p.price)}</td>
                  <td className="px-3 py-2 text-right">{brl(p.cost_price)}</td>
                  <td className="px-3 py-2 text-right">{margin.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">{p.stock_quantity}</td>
                  <td className="px-3 py-2">{p.active ? "Ativo" : "Inativo"}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setForm({
                      id: p.id, name: p.name, description: p.description || "", sku: p.sku || "", price: String(p.price), cost_price: String(p.cost_price),
                      stock_quantity: String(p.stock_quantity), image_url: p.image_url || "", active: !!p.active,
                      category: p.category || "", subcategory: p.subcategory || "",
                      variations: variationsMap[p.id] ? JSON.parse(JSON.stringify(variationsMap[p.id])) : [],
                    })} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent">

                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                    <button onClick={() => confirm(`Excluir "${p.name}"?`) && mDel.mutate(p.id)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-500/10">
                      <Trash2 className="h-3 w-3" /> Excluir
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{form.id ? "Editar produto" : "Novo produto"}</h2>
              <button onClick={() => setForm(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="col-span-2 text-sm">Nome
                <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="col-span-2 text-sm">Descrição
                <textarea
                  rows={4}
                  placeholder="Descreva o produto: características, materiais, medidas, etc."
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>

              <label className="text-sm">SKU
                <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </label>
              <label className="text-sm">Estoque
                <input type="number" className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
              </label>
              <label className="text-sm">Preço (R$)
                <input type="number" step="0.01" className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </label>
              <label className="text-sm">Custo (R$)
                <input type="number" step="0.01" className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
              </label>
              <label className="text-sm">Categoria
                <select
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: "" })}
                >
                  <option value="">— Selecione —</option>
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">Subcategoria
                <select
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 disabled:opacity-50"
                  value={form.subcategory}
                  onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                  disabled={!form.category}
                >
                  <option value="">— Selecione —</option>
                  {(CATEGORIES_TREE[form.category] || []).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="col-span-2 text-sm">
                <span>Foto do produto</span>
                <div className="mt-1 flex items-center gap-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-background flex items-center justify-center">
                    {form.image_url ? (
                      <img src={form.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                      <Upload className="h-3 w-3" /> Enviar foto
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 3 * 1024 * 1024) { alert("Foto deve ter no máximo 3MB."); return; }
                          const url = await fileToDataUrl(file);
                          setForm({ ...form, image_url: url });
                        }}
                      />
                    </label>
                    {form.image_url && (
                      <button type="button" onClick={() => setForm({ ...form, image_url: "" })} className="text-xs text-red-500 hover:underline">
                        Remover foto
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-span-2 rounded-md border border-border p-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Variações (cor, tamanho, preço e foto)</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, variations: [...form.variations, emptyVariant()] })}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    <Plus className="h-3 w-3" /> Adicionar variação
                  </button>
                </div>
                {form.variations.length === 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">Ex.: Cor "Azul" + Tamanho "M" com foto e preço próprios.</p>
                )}
                <div className="mt-2 space-y-2">
                  {form.variations.map((v, vi) => {
                    const update = (patch: Partial<ProductVariation>) => {
                      const next = [...form.variations];
                      next[vi] = { ...next[vi], ...patch };
                      setForm({ ...form, variations: next });
                    };
                    return (
                      <div key={vi} className="rounded border border-border p-2">
                        <div className="flex items-start gap-2">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-muted flex items-center justify-center">
                            {v.image_url ? <img src={v.image_url} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2">
                            <input placeholder="Cor" className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={v.color} onChange={(e) => update({ color: e.target.value })} />
                            <input placeholder="Tamanho" className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={v.size} onChange={(e) => update({ size: e.target.value })} />
                            <input placeholder="Nome / rótulo" className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={v.name || ""} onChange={(e) => update({ name: e.target.value })} />
                            <input placeholder="SKU" className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={v.sku || ""} onChange={(e) => update({ sku: e.target.value })} />
                            <input type="number" step="0.01" placeholder="Preço (R$)" className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={v.price} onChange={(e) => update({ price: e.target.value })} />
                            <input type="number" step="0.01" placeholder="Promo (R$)" className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={v.discount_price || ""} onChange={(e) => update({ discount_price: e.target.value })} />
                            <input type="number" placeholder="Estoque" className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={v.stock} onChange={(e) => update({ stock: e.target.value })} />
                            <label className="inline-flex items-center justify-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent cursor-pointer">
                              <Upload className="h-3 w-3" /> Foto
                              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 3 * 1024 * 1024) { alert("Foto deve ter no máximo 3MB."); return; }
                                const url = await fileToDataUrl(file);
                                update({ image_url: url });
                              }} />
                            </label>
                          </div>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, variations: form.variations.filter((_, i) => i !== vi) })}
                            className="rounded p-1 text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="rounded-md border border-border px-3 py-1.5 text-sm">Cancelar</button>
              <button disabled={mUp.isPending || !form.name} onClick={() => mUp.mutate(form)} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
                {mUp.isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
