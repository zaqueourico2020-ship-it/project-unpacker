export type StoreBadge = { key: string; label: string; emoji: string; tone: string };

export function computeBadges(opts: {
  status?: string;
  verified?: boolean;
  reliable_shipping?: boolean;
  sales?: number;
  cancelRate?: number;
}): StoreBadge[] {
  const out: StoreBadge[] = [];
  if (opts.status === "approved") {
    out.push({ key: "oficial", label: "Loja Oficial", emoji: "✓", tone: "bg-emerald-500/15 text-emerald-600" });
  }
  if (opts.verified) {
    out.push({ key: "verificado", label: "Vendedor Verificado", emoji: "✓", tone: "bg-blue-500/15 text-blue-600" });
  }
  if (opts.reliable_shipping || ((opts.sales ?? 0) >= 50 && (opts.cancelRate ?? 1) <= 0.1)) {
    out.push({ key: "entrega", label: "Entrega Confiável", emoji: "✓", tone: "bg-amber-500/15 text-amber-600" });
  }
  return out;
}

export type StoreTier = { key: "bronze" | "prata" | "ouro" | "diamante"; label: string; emoji: string };
export function computeTier(sales: number): StoreTier {
  if (sales >= 1000) return { key: "diamante", label: "Diamante", emoji: "💎" };
  if (sales >= 300) return { key: "ouro", label: "Ouro", emoji: "🥇" };
  if (sales >= 50) return { key: "prata", label: "Prata", emoji: "🥈" };
  return { key: "bronze", label: "Bronze", emoji: "🥉" };
}
