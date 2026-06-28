import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Heart, BadgeCheck, Store as StoreIcon } from "lucide-react";
import { listFollowedStores } from "@/lib/followers.functions";

export const Route = createFileRoute("/_authenticated/seguindo")({
  head: () => ({
    meta: [
      { title: "Lojas que sigo — Grupo GF" },
      { name: "description", content: "Acompanhe as lojas que você segue no Grupo GF." },
    ],
  }),
  component: SeguindoPage,
});

function SeguindoPage() {
  const fn = useServerFn(listFollowedStores);
  const { data, isLoading } = useQuery({
    queryKey: ["followed-stores"],
    queryFn: () => fn({}),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Heart className="h-5 w-5 text-pink-500" />
        <h1 className="text-2xl font-bold">Lojas que sigo</h1>
      </header>
      <p className="text-sm text-muted-foreground">
        Você recebe novidades, promoções e lançamentos das lojas que segue.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && (data?.stores?.length ?? 0) === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <StoreIcon className="mx-auto mb-2 h-6 w-6" />
          Você ainda não segue nenhuma loja.<br />
          Visite uma loja parceira e toque em <strong>Seguir Loja</strong>.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {data?.stores?.map((s: any) => (
          <Link
            key={s.id}
            to="/loja/$slug"
            params={{ slug: s.slug }}
            className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition hover:border-pink-400/40 hover:bg-pink-500/5"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
              {s.logo_url ? (
                <img src={s.logo_url} alt={s.nome_loja} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-lg font-bold text-pink-500">
                  {s.nome_loja?.[0]}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate font-semibold">
                {s.nome_loja}
                {s.verified && <BadgeCheck className="h-4 w-4 text-cyan-500" />}
              </p>
              {s.descricao && (
                <p className="line-clamp-1 text-xs text-muted-foreground">{s.descricao}</p>
              )}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Seguindo desde {new Date(s.followed_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
