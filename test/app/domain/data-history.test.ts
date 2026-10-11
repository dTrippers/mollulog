import { describe, expect, it } from "@jest/globals";
import { getChangedValues } from "~/domain/data-history";

describe("data history changes", () => {
  it("shows only changed gifts, including added and removed counts", () => {
    expect(
      getChangedValues(
        { target: { giftPlan: { unchanged: 20, updated: 11, removed: 3 } } },
        { target: { giftPlan: { added: 5, updated: 10, unchanged: 20 } } },
      ),
    ).toEqual([
      { key: "gift:updated", label: "updated", group: "선물 계획", before: 11, after: 10 },
      { key: "gift:removed", label: "removed", group: "선물 계획", before: 3, after: 0 },
      { key: "gift:added", label: "added", group: "선물 계획", before: 0, after: 5 },
    ]);
  });

  it("keeps current and goal relationship changes distinct in canonical snapshots", () => {
    expect(
      getChangedValues(
        { state: { relationshipCurrentLevel: null }, target: { relationshipTargetLevel: 30 } },
        { state: { relationshipCurrentLevel: 10 }, target: { relationshipTargetLevel: 40 } },
      ),
    ).toEqual([
      { key: "bond", group: "현재 인연", label: "인연 랭크", before: null, after: 10 },
      { key: "relationshipTargetLevel", group: "육성 목표", label: "인연 랭크", before: 30, after: 40 },
    ]);
  });

  it("produces the same changes for canonical and legacy snapshots", () => {
    const legacy = getChangedValues(
      {
        recruited: { tier: 5, level: 89 },
        growth: { targetTier: 6 },
        relationship: { items: { gift: 2 }, currentLevel: 10, targetLevel: 30 },
      },
      {
        recruited: { tier: 6, level: 90 },
        growth: { targetTier: 7 },
        relationship: { items: { gift: 3 }, currentLevel: 11, targetLevel: 40 },
      },
    );
    const canonical = getChangedValues(
      {
        state: { recruitedAt: "2026-01-01", tier: 5, level: 89, relationshipCurrentLevel: 10 },
        target: { targetTier: 6, relationshipTargetLevel: 30, giftPlan: { gift: 2 } },
      },
      {
        state: { recruitedAt: "2026-01-01", tier: 6, level: 90, relationshipCurrentLevel: 11 },
        target: { targetTier: 7, relationshipTargetLevel: 40, giftPlan: { gift: 3 } },
      },
    );
    expect(canonical).toEqual(legacy);
    expect(canonical.find(({ key }) => key === "tier")).toBeUndefined();
    expect(canonical.find(({ key }) => key === "weaponTier")).toMatchObject({ before: 0, after: 1 });
  });

  it("detects recruitment membership rather than changes to recruitment timestamps", () => {
    expect(getChangedValues({ state: { recruitedAt: null } }, { state: { recruitedAt: "2026-10-11" } })).toEqual([
      { key: "recruited", group: "모집 여부", label: "모집 상태", before: false, after: true },
    ]);
    expect(getChangedValues({ recruited: {} }, { recruited: null })).toEqual([
      { key: "recruited", group: "모집 여부", label: "모집 상태", before: true, after: false },
    ]);
    expect(
      getChangedValues({ state: { recruitedAt: "2026-01-01" } }, { state: { recruitedAt: "2026-01-02" } }),
    ).toEqual([]);
  });

  it("does not invent recruitment changes when the snapshot does not describe membership", () => {
    expect(
      getChangedValues({ target: { targetLevel: 89 } }, { target: { targetLevel: 90 } }).map(({ key }) => key),
    ).toEqual(["targetLevel"]);
  });

  it("treats absent, null, and empty gift plans as no planned gifts", () => {
    expect(getChangedValues({ target: { giftPlan: null } }, { target: { giftPlan: {} } })).toEqual([]);
    expect(getChangedValues({ relationship: {} }, { relationship: { items: { gift: 0 } } })).toEqual([]);
  });

  it("preserves malformed gift plans for an explicit unavailable-value state", () => {
    expect(getChangedValues({ target: { giftPlan: {} } }, { target: { giftPlan: [] } })).toEqual([
      { key: "giftPlan", group: "선물 계획", label: "선물", before: {}, after: [] },
    ]);
  });
});
