import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_PYROXENE_TIMELINE_DISPLAY,
  PYROXENE_SOURCE_DEFINITIONS,
  PYROXENE_SOURCE_ROW_DEFINITIONS,
  createOptimisticAttendanceTimelineItems,
  createOptimisticBuyTimelineItems,
  createOptimisticOtherTimelineItems,
  createOptimisticPackageTimelineItems,
  calculateDailyApChargePyroxene,
  togglePyroxeneTimelineSourceVisibility,
} from "../../../../../app/models/pyroxene-sources";

describe("pyroxene-sources", () => {
  it("builds the existing default timeline display set from source metadata", () => {
    expect(DEFAULT_PYROXENE_TIMELINE_DISPLAY).toEqual([
      "event",
      "event_reward",
      "raid",
      "buy",
      "package_onetime",
      "ap_charge",
    ]);
  });

  it("defines source rows that cover configurable timeline sources exactly once", () => {
    const sourceTypes = PYROXENE_SOURCE_DEFINITIONS.map((source) => source.type)
      .filter((type) => type !== "event")
      .sort();
    const rowSourceTypes = PYROXENE_SOURCE_ROW_DEFINITIONS.flatMap((row) =>
      row.visibilityTargets.map((target) => target.type),
    ).sort();

    expect(rowSourceTypes).toEqual(sourceTypes);
    expect(new Set(rowSourceTypes).size).toBe(rowSourceTypes.length);
  });

  it("keeps monthly package as one row with one-time and daily detail toggles", () => {
    const packageRow = PYROXENE_SOURCE_ROW_DEFINITIONS.find((row) => row.id === "package");

    expect(packageRow).toEqual(
      expect.objectContaining({
        label: "월간 패키지",
        group: "paid",
        action: "add",
      }),
    );
    expect(packageRow?.visibilityTargets).toEqual([
      { type: "package_onetime", label: "초회" },
      { type: "package_daily", label: "일간" },
    ]);
  });

  it("keeps daily and weekly missions as one row with detail toggles", () => {
    const missionRow = PYROXENE_SOURCE_ROW_DEFINITIONS.find((row) => row.id === "mission");

    expect(missionRow).toEqual(
      expect.objectContaining({
        label: "임무 보상",
        group: "regular",
        action: "none",
      }),
    );
    expect(missionRow?.visibilityTargets).toEqual([
      { type: "daily_mission", label: "일일" },
      { type: "weekly_mission", label: "주간" },
    ]);
  });

  it("places direct registration under paid sources and AP charge under consumption sources", () => {
    expect(PYROXENE_SOURCE_ROW_DEFINITIONS.find((row) => row.id === "other")).toEqual(
      expect.objectContaining({
        label: "직접 등록",
        group: "paid",
        action: "add",
      }),
    );
    expect(PYROXENE_SOURCE_ROW_DEFINITIONS.find((row) => row.id === "ap_charge")).toEqual(
      expect.objectContaining({
        label: "AP 충전",
        group: "consumption",
        action: "configure",
        visibilityTargets: [{ type: "ap_charge" }],
      }),
    );
  });

  it("calculates daily AP charge costs by tier", () => {
    expect(calculateDailyApChargePyroxene(0)).toBe(0);
    expect(calculateDailyApChargePyroxene(3)).toBe(90);
    expect(calculateDailyApChargePyroxene(7)).toBe(370);
    expect(calculateDailyApChargePyroxene(20)).toBe(3120);
    expect(calculateDailyApChargePyroxene(21)).toBe(3120);
  });

  it("toggles one timeline display source without changing others", () => {
    expect(togglePyroxeneTimelineSourceVisibility(["event", "raid"], "buy")).toEqual(["event", "raid", "buy"]);
    expect(togglePyroxeneTimelineSourceVisibility(["event", "raid", "buy"], "raid")).toEqual(["event", "buy"]);
    expect(togglePyroxeneTimelineSourceVisibility(["event", "raid"], "raid", true)).toEqual(["event", "raid"]);
    expect(togglePyroxeneTimelineSourceVisibility(["event", "raid"], "buy", false)).toEqual(["event", "raid"]);
  });

  it("creates full monthly package optimistic items as one-time and daily entries", () => {
    const items = createOptimisticPackageTimelineItems(new Date("2026-05-03T00:00:00.000Z"), "full");

    expect(items).toEqual([
      expect.objectContaining({
        source: "package_onetime",
        description: "월간 패키지 (초회)",
        pyroxeneDelta: 392,
        repeatIntervalDays: null,
        repeatCount: null,
      }),
      expect.objectContaining({
        source: "package_daily",
        description: "월간 패키지 (일간)",
        pyroxeneDelta: 40,
        repeatIntervalDays: 1,
        repeatCount: 30,
      }),
    ]);
    expect(items[0].uid.split("::")[0]).toBe(items[1].uid.split("::")[0]);
  });

  it("creates half package optimistic items with half package amounts", () => {
    const items = createOptimisticPackageTimelineItems(new Date("2026-05-03T00:00:00.000Z"), "half");

    expect(items).toEqual([
      expect.objectContaining({
        source: "package_onetime",
        description: "하프 패키지 (초회)",
        pyroxeneDelta: 176,
      }),
      expect.objectContaining({
        source: "package_daily",
        description: "하프 패키지 (일간)",
        pyroxeneDelta: 20,
      }),
    ]);
  });

  it("creates attendance optimistic items that can replace existing attendance source rows", () => {
    const items = createOptimisticAttendanceTimelineItems(new Date("2026-05-01T00:00:00.000Z"));

    expect(items).toEqual([
      expect.objectContaining({
        source: "attendance",
        description: "출석 5일차",
        pyroxeneDelta: 50,
        repeatIntervalDays: 10,
        repeatCount: null,
      }),
      expect.objectContaining({
        source: "attendance",
        description: "출석 10일차",
        pyroxeneDelta: 100,
        repeatIntervalDays: 10,
        repeatCount: null,
      }),
    ]);
    expect(items.map((item) => item.source)).toEqual(["attendance", "attendance"]);
    expect(items[0].uid.split("::")[0]).toBe(items[1].uid.split("::")[0]);
  });

  it("creates buy optimistic items with selected date preserved", () => {
    const items = createOptimisticBuyTimelineItems(6600, new Date("2026-05-03T12:34:56.000Z"));

    expect(items).toEqual([
      expect.objectContaining({
        eventAt: "2026-05-03T12:34:56.000Z",
        source: "buy",
        description: "청휘석 구매",
        pyroxeneDelta: 6600,
      }),
    ]);
  });

  it("creates other optimistic items with all resource deltas", () => {
    const items = createOptimisticOtherTimelineItems(
      { pyroxene: 120, oneTimeTicket: 1, tenTimeTicket: 2 },
      "점검 보상",
      new Date("2026-05-03T00:00:00.000Z"),
    );

    expect(items).toEqual([
      expect.objectContaining({
        source: "other",
        description: "점검 보상",
        pyroxeneDelta: 120,
        oneTimeTicketDelta: 1,
        tenTimeTicketDelta: 2,
      }),
    ]);
  });
});
