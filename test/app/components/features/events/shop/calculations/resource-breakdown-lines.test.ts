import { describe, expect, it } from "@jest/globals";
import { buildResourceBreakdownLines } from "~/components/features/events/shop/calculations/resource-breakdown-lines";
import type { ItemBreakdownResult } from "~/components/features/events/shop/calculations/types";

const emptyItemBreakdown: ItemBreakdownResult["itemBreakdown"] = {
  existing: {},
  fromFirstRun: {},
  fromRepeatedRuns: {},
  fromShop: {},
  toPlayMinigame: {},
  toBuyShopItems: {},
  fromMinigame: {},
  remaining: {},
};

describe("buildResourceBreakdownLines", () => {
  it("groups required and acquired quantities while omitting zero lines", () => {
    const result = buildResourceBreakdownLines(
      {
        ...emptyItemBreakdown,
        existing: { photo: 10 },
        fromFirstRun: { photo: 3 },
        fromRepeatedRuns: { photo: 4 },
        fromShop: { photo: 5 },
        toPlayMinigame: { photo: 200 },
        toBuyShopItems: { photo: 40 },
        fromMinigame: { photo: 2 },
        remaining: { photo: 250 },
      },
      "photo",
      {},
      { minigameRequired: "카드 뒤집기", minigameAcquired: "카드 뒤집기 (평균)" },
    );

    expect(result).toEqual({
      requiredLines: [
        { label: "상점 구매", value: 40 },
        { label: "카드 뒤집기", value: 200 },
      ],
      acquiredLines: [
        { label: "기존 보유", value: 10 },
        { label: "스토리 / 초회 보상", value: 3 },
        { label: "카드 뒤집기 (평균)", value: 2 },
        { label: "퀘스트", value: 4 },
        { label: "상점 구매", value: 5 },
      ],
      requiredSubtotal: 240,
      acquiredSubtotal: 24,
      hasOverride: false,
      actualRequired: 240,
      remaining: 250,
    });
  });

  it("defaults both minigame labels to the existing label", () => {
    const result = buildResourceBreakdownLines(
      {
        ...emptyItemBreakdown,
        toPlayMinigame: { photo: 1 },
        fromMinigame: { photo: 2 },
      },
      "photo",
      {},
    );

    expect(result.requiredLines).toEqual([{ label: "미니게임", value: 1 }]);
    expect(result.acquiredLines).toEqual([{ label: "미니게임", value: 2 }]);
  });

  it("uses an explicit target as actual required quantity and hides the normal requirement lines", () => {
    const result = buildResourceBreakdownLines(
      {
        ...emptyItemBreakdown,
        toPlayMinigame: { photo: 200 },
        toBuyShopItems: { photo: 40 },
        remaining: { photo: -10 },
      },
      "photo",
      { photo: 250 },
    );

    expect(result.requiredLines).toEqual([]);
    expect(result.hasOverride).toBe(true);
    expect(result.requiredSubtotal).toBe(240);
    expect(result.actualRequired).toBe(250);
    expect(result.remaining).toBe(-10);
  });

  it("returns empty breakdowns for resources with no matching ledger entries", () => {
    expect(buildResourceBreakdownLines(emptyItemBreakdown, "missing", {})).toEqual({
      requiredLines: [],
      acquiredLines: [],
      requiredSubtotal: 0,
      acquiredSubtotal: 0,
      hasOverride: false,
      actualRequired: 0,
      remaining: 0,
    });
  });
});
