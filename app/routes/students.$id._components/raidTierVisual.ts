export const TIER_COLORS: Record<string, string> = {
  tier9: "var(--v2-viz-tier-9)",
  tier8: "var(--v2-viz-tier-8)",
  tier7: "var(--v2-viz-tier-7)",
  tier6: "var(--v2-viz-tier-6)",
  tier5: "var(--v2-viz-tier-5)",
  tier4: "var(--v2-viz-tier-4)",
  tier3: "var(--v2-viz-tier-3)",
  tier2: "var(--v2-viz-tier-2)",
  tier1: "var(--v2-viz-tier-1)",
};

export function formatTierKey(tier: number) {
  return `tier${tier}`;
}

export function formatTierLabel(tierOrKey: number | string) {
  const tier = typeof tierOrKey === "number" ? tierOrKey : Number(tierOrKey.replace("tier", ""));
  if (tier > 5) {
    return `고유 ${tier - 5}`;
  }
  return `★${tier}`;
}
