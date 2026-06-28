// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Upload, Image as ImageIcon, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/banners")({
  component: BannersPage,
});

type Banner = { id: string; title: string; subtitle: string; image: string };

const STORE_ID = "singleton";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Banner>({ id: uid(), title: "", subtitle: "", image: "" });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("store_state")
        .select("banners")
        .eq("id", STORE_ID)
        .maybeSingle();
      setBanners(((data?.banners as Banner[]) ?? []) as Banner[]);
      setLoading(false);
    })();
  }, []);

  async function persist(next: Banner[]) {
    setSaving(true);
    setBanners(next);
    const { error } = await supabase
      .from("store_state")
      .upsert({ id: STORE_ID, banners: next }, { onConflict: "id" });
    setSaving(false);
    if (error) {
      setMsg("Erro ao salvar: " + error.message);
    } else {
      setMsg("Salvo");
      setTimeout(() => setMsg(null), 1500);
    }
  }

  async function add() {
    if (!form.title.trim() || !form.image) {
      setMsg("Preencha título e imagem");
      return;
    }
    await persist([{ ...form, id: uid() }, ...banners]);
    setForm({ id: uid(), title: "", subtitle: "", image: "" });
  }

  async function remove(id: string) {
    if (!confirm("Remover este banner?")) return;
    await persist(banners.filter((b) => b.id !== id));
  }

  async function clearAll() {
    if (!confirm("Remover TODOS os banners ativos?")) return;
    await persist([]);
  }

  async function onPick(file: File) {
    const url = await fileToDataUrl(file);
    setForm((f) => ({ ...f, image: url }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Banners</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os banners exibidos no carrossel da página inicial.
          </p>
        </div>
        {banners.length > 0 && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" /> Limpar todos
          </button>
        )}
      </div>

      {msg && (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">{msg}</div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold">Adicionar banner</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Título"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.subtitle}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            placeholder="Subtítulo"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" /> Enviar imagem
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPick(f);
              }}
            />
          </label>
          <input
            value={form.image.startsWith("data:") ? "" : form.image}
            onChange={(e) => setForm({ ...form, image: e.target.value })}
            placeholder="ou cole uma URL https://..."
            className="flex-1 min-w-[200px] rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          {form.image && (
            <img
              src={form.image}
              alt="prévia"
              className="h-12 w-20 rounded object-cover border border-border"
            />
          )}
        </div>

        <button
          onClick={add}
          disabled={saving}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Adicionar banner
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          Banners ativos ({banners.length})
        </div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : banners.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-sm text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-50" />
            Nenhum banner cadastrado.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {banners.map((b) => (
              <li key={b.id} className="flex items-center gap-3 p-3">
                <img
                  src={b.image}
                  alt={b.title}
                  className="h-14 w-24 rounded object-cover border border-border"
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{b.title}</p>
                  {b.subtitle && (
                    <p className="truncate text-xs text-muted-foreground">{b.subtitle}</p>
                  )}
                </div>
                <button
                  onClick={() => remove(b.id)}
                  className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}