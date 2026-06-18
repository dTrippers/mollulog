export const TIER_COLORS: Record<string, string> = {
  tier9: "#ec4899",
  tier8: "#d946ef",
  tier7: "#8b5cf6",
  tier6: "#3b82f6",
  tier5: "#06b6d4",
  tier4: "#22c55e",
  tier3: "#eab308",
  tier2: "#f97316",
  tier1: "#ef4444",
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
