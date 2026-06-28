import { Link } from "@tanstack/react-router";
import { useCompareList } from "@/hooks/useCompareList";
import { GitCompareArrows, X } from "lucide-react";

export function CompareBar() {
  const { ids, remove, clear } = useCompareList();
  if (ids.length === 0) return null;
  return (
    <div className="fixed bottom-3 left-1/2 z-50 w-[95%] max-w-xl -translate-x-1/2 rounded-xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <GitCompareArrows className="h-4 w-4" /> Comparar ({ids.length}/4)
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clear} className="text-xs text-muted-foreground hover:underline">Limpar</button>
          <Link
            to="/comparar"
            search={{ ids: ids.join(",") } as any}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Comparar agora
          </Link>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {ids.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px]">
            {id.slice(0, 6)}
            <button onClick={() => remove(id)} aria-label="Remover"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
    </div>
  );
}
