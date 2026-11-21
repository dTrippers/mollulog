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
  getPyroxeneGameDayStartAt,
  normalizePyroxeneOneOffGainAt,
  normalizePyroxeneOneOffGainEditAt,
  normalizePyroxeneTimelineEventAt,
  normalizePyroxeneTimelineRecordAt,
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

  describe("one-off gains dated on the current game day", () => {
    // 21:15 KST on 11/17, after inventory entered at 13:38 the same day.
    const now = "2026-11-17T12:15:00.000Z";
    const pickedToday = new Date("2026-11-17T00:00:00+09:00");

    it("keeps the time the gain is recorded", () => {
      expect(normalizePyroxeneOneOffGainAt(pickedToday, now)).toBe(now);
      expect(normalizePyroxeneOneOffGainAt(new Date("2026-11-17T09:00:00+09:00"), now)).toBe(now);
    });

    it("counts other days from 04:00 KST", () => {
      expect(normalizePyroxeneOneOffGainAt(new Date("2026-11-16T00:00:00+09:00"), now)).toBe(
        "2026-11-15T19:00:00.000Z",
      );
      expect(normalizePyroxeneOneOffGainAt(new Date("2026-11-18T00:00:00+09:00"), now)).toBe(
        "2026-11-17T19:00:00.000Z",
      );
    });

    it("treats the hours before the 04:00 reset as the previous game day", () => {
      const beforeReset = "2026-11-17T17:00:00.000Z"; // 02:00 KST on 11/18

      expect(normalizePyroxeneOneOffGainAt(pickedToday, beforeReset)).toBe(beforeReset);
      expect(normalizePyroxeneOneOffGainAt(new Date("2026-11-18T00:00:00+09:00"), beforeReset)).toBe(
        "2026-11-17T19:00:00.000Z",
      );
    });

    it("applies only to purchases and direct gains", () => {
      expect(normalizePyroxeneTimelineRecordAt(pickedToday, "buy", now)).toBe(now);
      expect(normalizePyroxeneTimelineRecordAt(pickedToday, "other", now)).toBe(now);
      expect(normalizePyroxeneTimelineRecordAt(pickedToday, "package_onetime", now)).toBe("2026-11-16T19:00:00.000Z");
      expect(normalizePyroxeneTimelineRecordAt(pickedToday, "attendance", now)).toBe("2026-11-16T19:00:00.000Z");
    });

    it("creates buy and other optimistic items at the recorded time", () => {
      const resources = { pyroxene: 1118, oneTimeTicket: 0, tenTimeTicket: 0 };

      expect(createOptimisticBuyTimelineItems(6600, pickedToday, { now })[0].eventAt).toBe(now);
      expect(createOptimisticOtherTimelineItems(resources, "", pickedToday, undefined, now)[0].eventAt).toBe(now);
    });

    it("finds the 04:00 KST that starts the game day of an instant", () => {
      expect(getPyroxeneGameDayStartAt(now)).toBe("2026-11-16T19:00:00.000Z");
      expect(getPyroxeneGameDayStartAt("2026-11-17T17:00:00.000Z")).toBe("2026-11-16T19:00:00.000Z"); // 02:00 KST on 11/18
      expect(getPyroxeneGameDayStartAt("2026-11-16T19:00:00.000Z")).toBe("2026-11-16T19:00:00.000Z");
    });

    it("keeps the recorded time when an edit leaves the date on the same game day", () => {
      const noonOnPickedDate = "2026-11-17T03:00:00.000Z"; // 12:00 KST on 11/17, as the quick edit sends it
      const nextDay = "2026-11-18T01:00:00.000Z"; // 10:00 KST on 11/18
      const recordedBeforeReset = "2026-11-17T17:00:00.000Z"; // 02:00 KST on 11/18, game day 11/17

      expect(normalizePyroxeneOneOffGainEditAt(noonOnPickedDate, now, "2026-11-17T13:00:00.000Z")).toBe(now);
      expect(normalizePyroxeneOneOffGainEditAt(noonOnPickedDate, now, nextDay)).toBe(now);
      expect(normalizePyroxeneOneOffGainEditAt(noonOnPickedDate, recordedBeforeReset, nextDay)).toBe(
        recordedBeforeReset,
      );
    });

    it("re-derives the time when an edit moves the date", () => {
      const editAt = "2026-11-18T01:00:00.000Z"; // 10:00 KST on 11/18

      expect(normalizePyroxeneOneOffGainEditAt("2026-11-18T03:00:00.000Z", now, editAt)).toBe(editAt);
      expect(normalizePyroxeneOneOffGainEditAt("2026-11-20T03:00:00.000Z", now, editAt)).toBe(
        "2026-11-19T19:00:00.000Z",
      );
    });
  });
});
