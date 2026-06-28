import { computeBadges, computeTier, type StoreBadge } from "@/lib/badges";

export function StoreBadges({
  status, verified, reliable_shipping, sales = 0, cancelRate = 0, compact = false,
}: {
  status?: string; verified?: boolean; reliable_shipping?: boolean;
  sales?: number; cancelRate?: number; compact?: boolean;
}) {
  const badges: StoreBadge[] = computeBadges({ status, verified, reliable_shipping, sales, cancelRate });
  const tier = computeTier(sales);
  return (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? "text-[10px]" : "text-xs"}`}>
      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-200/20 to-amber-500/20 px-2 py-0.5 font-semibold">
        {tier.emoji} {tier.label}
      </span>
      {badges.map((b) => (
        <span key={b.key} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${b.tone}`}>
          <span aria-hidden>{b.emoji}</span> {b.label}
        </span>
      ))}
    </div>
  );
}
