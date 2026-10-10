import type { ItemBreakdownResult } from "./types";

export type BreakdownLine = {
  label: string;
  value: number;
};

export type ResourceBreakdownLines = {
  requiredLines: BreakdownLine[];
  acquiredLines: BreakdownLine[];
  requiredSubtotal: number;
  acquiredSubtotal: number;
  hasOverride: boolean;
  actualRequired: number;
  remaining: number;
};

type ItemBreakdown = ItemBreakdownResult["itemBreakdown"];

type ResourceBreakdownLabels = {
  minigameRequired?: string;
  minigameAcquired?: string;
};

export function buildResourceBreakdownLines(
  itemBreakdown: ItemBreakdown,
  uid: string,
  overriddenRequiredQuantities: Record<string, number>,
  labels: ResourceBreakdownLabels = {},
): ResourceBreakdownLines {
  const {
    existing,
    fromFirstRun,
    fromRepeatedRuns,
    fromShop,
    toPlayMinigame,
    toBuyShopItems,
    fromMinigame,
    remaining,
  } = itemBreakdown;
  const existingCount = existing[uid] ?? 0;
  const firstRunCount = fromFirstRun[uid] ?? 0;
  const fromMinigameCount = fromMinigame[uid] ?? 0;
  const fromShopCount = fromShop[uid] ?? 0;
  const repeatedRunsCount = fromRepeatedRuns[uid] ?? 0;
  const toPlayMinigameCount = toPlayMinigame[uid] ?? 0;
  const toBuyCount = toBuyShopItems[uid] ?? 0;
  const requiredSubtotal = toBuyCount + toPlayMinigameCount;
  const acquiredSubtotal = existingCount + firstRunCount + fromMinigameCount + repeatedRunsCount + fromShopCount;
  const overrideValue = overriddenRequiredQuantities[uid];
  const hasOverride = overrideValue !== undefined;
  const actualRequired = overrideValue ?? requiredSubtotal;
  const minigameRequiredLabel = labels.minigameRequired ?? "미니게임";
  const minigameAcquiredLabel = labels.minigameAcquired ?? "미니게임";

  const requiredLines: BreakdownLine[] = !hasOverride
    ? [
        toBuyCount > 0 && { label: "상점 구매", value: toBuyCount },
        toPlayMinigameCount > 0 && { label: minigameRequiredLabel, value: toPlayMinigameCount },
      ].filter((line): line is BreakdownLine => line !== false)
    : [];

  const acquiredLines: BreakdownLine[] = [
    existingCount > 0 && { label: "기존 보유", value: existingCount },
    firstRunCount > 0 && { label: "스토리 / 초회 보상", value: firstRunCount },
    fromMinigameCount > 0 && { label: minigameAcquiredLabel, value: fromMinigameCount },
    repeatedRunsCount > 0 && { label: "퀘스트", value: repeatedRunsCount },
    fromShopCount > 0 && { label: "상점 구매", value: fromShopCount },
  ].filter((line): line is BreakdownLine => line !== false);

  return {
    requiredLines,
    acquiredLines,
    requiredSubtotal,
    acquiredSubtotal,
    hasOverride,
    actualRequired,
    remaining: remaining[uid] ?? 0,
  };
}
