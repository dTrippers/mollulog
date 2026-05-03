import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_PYROXENE_TIMELINE_DISPLAY,
  createOptimisticAttendanceTimelineItems,
  createOptimisticBuyTimelineItems,
  createOptimisticOtherTimelineItems,
  createOptimisticPackageTimelineItems,
} from "../../../../../app/models/pyroxene-sources";

describe("pyroxene-sources", () => {
  it("builds the existing default timeline display set from source metadata", () => {
    expect(DEFAULT_PYROXENE_TIMELINE_DISPLAY).toEqual(["event", "event_reward", "raid", "buy", "package_onetime"]);
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
