import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getProductsForCompare } from "@/lib/compare.functions";
import { useCompareList } from "@/hooks/useCompareList";
import { StoreBadges } from "@/components/StoreBadges";
import { ArrowLeft, X } from "lucide-react";

const Search = z.object({ ids: z.string().optional() });

export const Route = createFileRoute("/comparar")({
  validateSearch: (s) => Search.parse(s),
  head: () => ({ meta: [{ title: "Comparar Produtos — Grupo GF" }, { name: "description", content: "Compare até 4 produtos lado a lado." }] }),
  component: ComparePage,
});

const BRL = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ComparePage() {
  const { ids: searchIds } = Route.useSearch();
  const { ids: localIds, remove } = useCompareList();
  const ids = (searchIds ? searchIds.split(",") : localIds).filter(Boolean).slice(0, 4);

  const fn = useServerFn(getProductsForCompare);
  const { data, isLoading, error } = useQuery({
    queryKey: ["compare", ids.join(",")],
    queryFn: () => fn({ data: { ids } }),
    enabled: ids.length > 0,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-1 text-sm hover:underline">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h1 className="text-lg font-bold">Comparar Produtos</h1>
          <span className="text-xs text-muted-foreground">{ids.length}/4</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {ids.length === 0 && (
          <p className="text-center text-muted-foreground">
            Nenhum produto selecionado. Acesse uma loja e adicione até 4 produtos ao comparador.
          </p>
        )}

        {isLoading && <p className="text-center text-muted-foreground">Carregando…</p>}
        {error && <p className="text-center text-destructive">{(error as Error).message}</p>}

        {data?.products && data.products.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-3 text-xs uppercase text-muted-foreground">Critério</th>
                  {data.products.map((p: any) => (
                    <th key={p.id} className="p-3 align-top">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col items-center gap-2 text-center">
                          <div className="h-24 w-24 overflow-hidden rounded bg-muted">
                            {p.image_url && <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />}
                          </div>
                          <p className="text-sm font-semibold line-clamp-2">{p.name}</p>
                        </div>
                        <button
                          onClick={() => remove(p.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent"
                          aria-label="Remover do comparador"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Preço" cells={data.products.map((p: any) => <strong className="text-base">{BRL(p.price)}</strong>)} />
                <Row label="Loja" cells={data.products.map((p: any) =>
                  p.partner
                    ? <Link to="/loja/$slug" params={{ slug: p.partner.slug }} className="text-primary hover:underline">{p.partner.nome_loja}</Link>
                    : <span className="text-muted-foreground">—</span>
                )} />
                <Row label="Selos do vendedor" cells={data.products.map((p: any) =>
                  p.partner
                    ? <StoreBadges status={p.partner.status} verified={p.partner.verified} reliable_shipping={p.partner.reliable_shipping} sales={p.partner_sales} compact />
                    : <span className="text-muted-foreground">—</span>
                )} />
                <Row label="Categoria" cells={data.products.map((p: any) => p.category || <span className="text-muted-foreground">—</span>)} />
                <Row label="Subcategoria" cells={data.products.map((p: any) => p.subcategory || <span className="text-muted-foreground">—</span>)} />
                <Row label="Estoque" cells={data.products.map((p: any) => p.stock_quantity > 0 ? `${p.stock_quantity} un.` : <span className="text-destructive">Indisponível</span>)} />
                <Row label="Frete" cells={data.products.map(() => <span className="text-muted-foreground">Calculado no checkout</span>)} />
                <Row label="Garantia" cells={data.products.map(() => "Garantia legal de 90 dias (CDC)")} />
                <Row label="Peso" cells={data.products.map((p: any) => p.weight_kg ? `${p.weight_kg} kg` : "—")} />
                <Row label="Dimensões" cells={data.products.map((p: any) =>
                  p.length_cm || p.width_cm || p.height_cm
                    ? `${p.length_cm ?? "—"} × ${p.width_cm ?? "—"} × ${p.height_cm ?? "—"} cm`
                    : <span className="text-muted-foreground">—</span>
                )} />
                <Row label="Descrição" cells={data.products.map((p: any) =>
                  <span className="line-clamp-4 text-xs text-muted-foreground">{p.description || "—"}</span>
                )} />
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, cells }: { label: string; cells: any[] }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3 text-xs uppercase tracking-wide text-muted-foreground">{label}</td>
      {cells.map((c, i) => <td key={i} className="p-3 align-top">{c}</td>)}
    </tr>
  );
}
