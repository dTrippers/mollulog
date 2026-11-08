import { describe, expect, it } from "@jest/globals";
import {
  calculateDailyApChargePyroxene,
  calculatePackageStartDateFromRemainingDays,
  createOptimisticApPackageTimelineItems,
  createOptimisticAttendanceTimelineItems,
  createOptimisticBuyTimelineItems,
  createOptimisticMonthlyPackageTimelineItems,
  createOptimisticOtherTimelineItems,
  DEFAULT_PYROXENE_TIMELINE_DISPLAY,
  normalizePyroxeneTimelineEventAt,
  PYROXENE_SOURCE_DEFINITIONS,
  togglePyroxeneTimelineSourceVisibility,
} from "~/domain/pyroxene-sources";
import dayjs from "../../../../../app/lib/dayjs";

describe("pyroxene-sources", () => {
  it("builds the existing default timeline display set from source metadata", () => {
    expect(DEFAULT_PYROXENE_TIMELINE_DISPLAY).toEqual([
      "event",
      "event_reward",
      "raid",
      "buy",
      "package_onetime",
      "package_ap",
      "ap_charge",
    ]);
  });

  it("calculates daily AP charge costs by tier", () => {
    expect(calculateDailyApChargePyroxene(0)).toBe(0);
    expect(calculateDailyApChargePyroxene(3)).toBe(90);
    expect(calculateDailyApChargePyroxene(7)).toBe(370);
    expect(calculateDailyApChargePyroxene(20)).toBe(3120);
    expect(calculateDailyApChargePyroxene(21)).toBe(3120);
  });

  it("calculates package start date from remaining days using Blue Archive 04:00 reset", () => {
    expect(
      dayjs(calculatePackageStartDateFromRemainingDays(22, 30, "2026-05-05T04:00:00+09:00"))
        .tz("Asia/Seoul")
        .format("YYYY-MM-DD"),
    ).toBe("2026-04-28");
    expect(
      dayjs(calculatePackageStartDateFromRemainingDays(22, 30, "2026-05-06T03:59:00+09:00"))
        .tz("Asia/Seoul")
        .format("YYYY-MM-DD"),
    ).toBe("2026-04-28");
    expect(
      dayjs(calculatePackageStartDateFromRemainingDays(22, 30, "2026-05-06T04:00:00+09:00"))
        .tz("Asia/Seoul")
        .format("YYYY-MM-DD"),
    ).toBe("2026-04-29");
  });

  it("toggles one timeline display source without changing others", () => {
    expect(togglePyroxeneTimelineSourceVisibility(["event", "raid"], "buy")).toEqual(["event", "raid", "buy"]);
    expect(togglePyroxeneTimelineSourceVisibility(["event", "raid", "buy"], "raid")).toEqual(["event", "buy"]);
    expect(togglePyroxeneTimelineSourceVisibility(["event", "raid"], "raid", true)).toEqual(["event", "raid"]);
    expect(togglePyroxeneTimelineSourceVisibility(["event", "raid"], "buy", false)).toEqual(["event", "raid"]);
  });

  it("creates full monthly package optimistic items as one-time and daily entries", () => {
    const items = createOptimisticMonthlyPackageTimelineItems(new Date("2026-05-03T00:00:00.000Z"), "full");

    expect(items).toEqual([
      expect.objectContaining({
        source: "package_onetime",
        description: "청휘석 패키지 (초회)",
        pyroxeneDelta: 392,
        repeatIntervalDays: null,
        repeatCount: null,
        autoRepurchase: false,
      }),
      expect.objectContaining({
        source: "package_daily",
        description: "청휘석 패키지 (일간)",
        pyroxeneDelta: 40,
        repeatIntervalDays: 1,
        repeatCount: 30,
        autoRepurchase: false,
      }),
    ]);
    expect(items[0].uid.split("::")[0]).toBe(items[1].uid.split("::")[0]);
    expect(items.map((item) => item.eventAt)).toEqual([
      normalizePyroxeneTimelineEventAt("2026-05-03T00:00:00.000Z"),
      normalizePyroxeneTimelineEventAt("2026-05-03T00:00:00.000Z"),
    ]);
  });

  it("creates half package optimistic items with half package amounts", () => {
    const items = createOptimisticMonthlyPackageTimelineItems(new Date("2026-05-03T00:00:00.000Z"), "half");

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

  it("creates AP package optimistic item with one-time pyroxene only", () => {
    const items = createOptimisticApPackageTimelineItems(new Date("2026-05-03T00:00:00.000Z"));

    expect(items).toEqual([
      expect.objectContaining({
        source: "package_ap",
        description: "AP 패키지 (초회)",
        pyroxeneDelta: 176,
        repeatIntervalDays: null,
        repeatCount: null,
        autoRepurchase: false,
      }),
    ]);
  });

  it("marks auto repurchase package optimistic items explicitly", () => {
    const monthlyItems = createOptimisticMonthlyPackageTimelineItems(
      new Date("2026-05-03T00:00:00.000Z"),
      "full",
      true,
    );
    const apItems = createOptimisticApPackageTimelineItems(new Date("2026-05-03T00:00:00.000Z"), true);

    expect(monthlyItems).toEqual([
      expect.objectContaining({
        source: "package_onetime",
        repeatIntervalDays: 30,
        repeatCount: null,
        autoRepurchase: true,
      }),
      expect.objectContaining({
        source: "package_daily",
        repeatIntervalDays: 1,
        repeatCount: null,
        autoRepurchase: true,
      }),
    ]);
    expect(apItems).toEqual([
      expect.objectContaining({
        source: "package_ap",
        repeatIntervalDays: 14,
        repeatCount: null,
        autoRepurchase: true,
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
    expect(items.map((item) => item.eventAt)).toEqual([
      normalizePyroxeneTimelineEventAt("2026-05-05T00:00:00.000Z"),
      normalizePyroxeneTimelineEventAt("2026-05-10T00:00:00.000Z"),
    ]);
  });

  it("creates buy optimistic items with server-normalized event date", () => {
    const items = createOptimisticBuyTimelineItems(6600, new Date("2026-05-03T12:34:56.000Z"));

    expect(items).toEqual([
      expect.objectContaining({
        eventAt: normalizePyroxeneTimelineEventAt("2026-05-03T12:34:56.000Z"),
        source: "buy",
        description: "청휘석 구매",
        pyroxeneDelta: 6600,
      }),
    ]);
  });

  it("creates monthly-first buy optimistic items with multiplied quantity", () => {
    const items = createOptimisticBuyTimelineItems(6600, new Date("2026-06-15T12:34:56.000Z"), {
      monthlyCount: 2,
      repeatType: "monthly_first",
    });

    expect(items).toEqual([
      expect.objectContaining({
        eventAt: normalizePyroxeneTimelineEventAt("2026-06-15T12:34:56.000Z"),
        source: "buy",
        description: "청휘석 구매",
        pyroxeneDelta: 13200,
        repeatType: "monthly_first",
        repeatIntervalDays: null,
        repeatCount: null,
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
        eventAt: normalizePyroxeneTimelineEventAt("2026-05-03T00:00:00.000Z"),
        source: "other",
        description: "점검 보상",
        pyroxeneDelta: 120,
        oneTimeTicketDelta: 1,
        tenTimeTicketDelta: 2,
      }),
    ]);
  });
});
