import { describe, expect, it } from "@jest/globals";
import type { ApPackagePurchaseRecord, ApPlannerEvent } from "../../../app/domain/ap-planner";
import {
  AP_PER_REFILL,
  addApChargeException,
  apPackagePanelSummary,
  cafeProduction,
  calculateApPlannerEvent,
  comfortMaximum,
  createEmptyApPlannerState,
  formatCafeApPerHour,
  hasApShopTarget,
  maxApForAccountLevel,
  normalizeApPlannerState,
} from "../../../app/domain/ap-planner";
import {
  apChargeExceptionRangesOverlap,
  defaultPyroxenePlannerOptions,
  getPyroxeneApChargeCountForDate,
  normalizePyroxeneApChargeExceptions,
} from "../../../app/domain/pyroxene-planner";

const conditions = { accountLevel: 85, cafeRank: 8, comfort: 4_500 };
const eventA: ApPlannerEvent = {
  timelineUid: "event-a",
  name: "이벤트 A",
  startAt: "2026-09-30T02:00:00.000Z",
  endAt: "2026-10-13T01:59:00.000Z",
  exchangeUntil: "2026-10-20T01:59:00.000Z",
  requiredAp: 16_500,
  requiredBreakdown: { firstClearAp: 1_000, questSweepAp: 15_000, extraSweepAp: 500 },
};

function calculate(event = eventA, options = defaultPyroxenePlannerOptions) {
  return calculateApPlannerEvent({
    event,
    conditions,
    plan: { accessAt: "2026-09-30T03:00:00.000Z" },
    currentAt: "2026-09-27T00:00:00.000Z",
    options,
  });
}

describe("AP planner domain", () => {
  it("treats a zero-AP saved shop state as having no AP target", () => {
    expect(hasApShopTarget(0)).toBe(false);
    expect(hasApShopTarget(1)).toBe(true);
  });

  it("uses the documented maximum AP levels", () => {
    expect([1, 20, 85, 90].map(maxApForAccountLevel)).toEqual([24, 100, 230, 240]);
  });

  it("calculates cafe production and storage by rank", () => {
    expect([1, 8, 10].map((rank) => cafeProduction(rank).storageMax)).toEqual([90, 600, 740]);
    expect(comfortMaximum(8)).toBe(4_500);
    expect(cafeProduction(8, 4_500).apPerHour).toBeCloseTo(25.15, 2);
    expect(formatCafeApPerHour(8, 4_500)).toBe("25.2");
  });

  it("shows a shortage, a surplus and the overlapping prior event for planned events", () => {
    const shortage = calculate();
    expect(shortage.status).toBe("ready");
    expect(shortage.availableAp).not.toBeNull();
    expect(shortage.resultAp).toBeLessThan(0);

    const eventB: ApPlannerEvent = {
      ...eventA,
      timelineUid: "event-b",
      name: "이벤트 B",
      startAt: "2026-10-13T07:00:00.000Z",
      endAt: "2026-10-27T01:59:00.000Z",
      requiredAp: 9_000,
    };
    const overlap = calculateApPlannerEvent({
      event: eventB,
      conditions,
      plan: { accessAt: eventB.startAt },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
      previousPlannedEvents: [
        { timelineUid: eventA.timelineUid, name: "이벤트 A", startAt: eventA.startAt, endAt: eventA.endAt as string },
      ],
    });
    expect(overlap.overlapEventName).toBe("이벤트 A");
    expect(overlap.resultAp).toBeGreaterThan(0);
  });

  it("ends the supply window at the event end, not the shop exchange deadline", () => {
    const changedExchangeDeadline = calculate({ ...eventA, exchangeUntil: "2026-12-31T00:00:00.000Z" });
    expect(changedExchangeDeadline.availableAp).toBe(calculate().availableAp);
  });

  it("uses the access-time stockpile as the last row and includes no current AP for ongoing events", () => {
    const ready = calculate({ ...eventA, requiredAp: 0 });
    expect(ready.stockpileSteps.at(-1)?.kind).toBe("access");
    expect(ready.stockpileSteps.at(-1)?.ap).toBe(ready.supplyBreakdown?.stockpile);

    const ongoing = calculateApPlannerEvent({
      event: eventA,
      conditions,
      plan: null,
      currentAt: "2026-10-01T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });
    expect(ongoing.status).toBe("ongoing");
    expect(ongoing.supplyBreakdown?.stockpile).toBe(0);
    expect(ongoing.stockpileSteps).toEqual([]);
  });

  it("pins a full preparation sequence with cafe storage, natural AP, daily tasks, and refills after access", () => {
    const event: ApPlannerEvent = {
      ...eventA,
      timelineUid: "event-sequence",
      name: "시퀀스 이벤트",
      startAt: "2026-11-17T02:00:00.000Z",
      endAt: "2026-11-19T02:00:00.000Z",
      requiredAp: 3_000,
    };
    const options = {
      ...defaultPyroxenePlannerOptions,
      consumption: { ...defaultPyroxenePlannerOptions.consumption, apChargeCount: 3 },
    };
    const calculation = calculateApPlannerEvent({
      event,
      conditions,
      plan: { accessAt: "2026-11-17T03:00:00.000Z" },
      currentAt: "2026-11-16T00:00:00.000Z",
      options,
    });

    expect(calculation.stockpileStartsAt).toBe("2026-11-16T03:00:00.000Z");
    // No login before access: natural regen reaches the 230 AP max 23 hours later instead of stopping at a refill.
    expect(calculation.stockpileSteps).toEqual([
      {
        at: "2026-11-16T03:00:00.000Z",
        label: "카페 AP를 받고 AP를 모두 사용하기 · 이후 접속할 시각까지 게임에 접속하지 않기",
        ap: 0,
        kind: "drain",
      },
      {
        at: "2026-11-17T02:00:00.000Z",
        label: "자연 회복이 최대 AP 230에 도달하면 멈춰요",
        ap: 230,
        kind: "natural",
      },
      {
        at: "2026-11-17T03:00:00.000Z",
        label: "접속해서 카페 AP 600 받기",
        ap: 830,
        mailboxAp: 0,
        unclaimedCafeAp: 0,
        kind: "access",
        receivedAp: 600,
      },
      {
        at: "2026-11-17T03:00:00.000Z",
        label: "AP를 쓰면서 AP 충전 3회 (11/18(수) 04:00 전까지)",
        ap: 830,
        kind: "after-access",
        receivedAp: 360,
      },
    ]);
    expect(calculation.supplyBreakdown).toMatchObject({
      stockpile: 830,
      natural: 470,
      cafe: 1_178,
      dailyTasks: 450,
      dailyTaskDays: 3,
      apCharges: 1_080,
      apChargeDays: 2,
    });
    expect(calculation.availableAp).toBe(4_008);
    expect(calculation.stockpileSteps.find((step) => step.kind === "access")?.ap).toBe(
      calculation.supplyBreakdown?.stockpile,
    );
  });

  it("keeps the access stockpile at 830 AP when there are no prep-period charges", () => {
    const noCharges = calculateApPlannerEvent({
      event: {
        ...eventA,
        startAt: "2026-11-17T02:00:00.000Z",
        endAt: "2026-11-19T02:00:00.000Z",
      },
      conditions,
      plan: { accessAt: "2026-11-17T03:00:00.000Z" },
      currentAt: "2026-11-16T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });

    expect(noCharges.supplyBreakdown?.stockpile).toBe(830);
    expect(noCharges.stockpileSteps.at(-1)?.ap).toBe(830);
  });

  it("does not count a reset refill twice when it falls before the entered access time", () => {
    const event: ApPlannerEvent = {
      ...eventA,
      startAt: "2026-11-17T02:00:00.000Z",
      endAt: "2026-11-20T02:00:00.000Z",
      requiredAp: 100_000,
    };
    const options = {
      ...defaultPyroxenePlannerOptions,
      consumption: { ...defaultPyroxenePlannerOptions.consumption, apChargeCount: 3 },
    };
    const calculation = calculateApPlannerEvent({
      event,
      conditions,
      plan: { accessAt: "2026-11-18T03:00:00.000Z" },
      currentAt: "2026-11-16T00:00:00.000Z",
      options,
    });

    expect(calculation.supplyBreakdown).toMatchObject({ stockpile: 830, apCharges: 1_080, apChargeDays: 2 });
    expect(calculation.availableAp).toBe(4_008);
    expect(calculation.refillSuggestions[0]).toMatchObject({
      kind: "event-period",
      startDate: "2026-11-19",
      endDate: "2026-11-20",
    });
  });

  it.each([
    { accountLevel: null, cafeRank: 8, comfort: 4_500 },
    { accountLevel: 85, cafeRank: null, comfort: null },
  ])("does not estimate supply until level and cafe rank are present", (missingCondition) => {
    const calculation = calculateApPlannerEvent({
      event: eventA,
      conditions: missingCondition,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });

    expect(calculation.status).toBe("input-needed");
    expect(calculation.availableAp).toBeNull();
    expect(calculation.supplyBreakdown).toBeNull();
    expect(calculation.stockpileSteps).toEqual([]);
  });

  it("suggests tiered refill counts including two daily charges for 13 days", () => {
    const baseline = calculate({ ...eventA, requiredAp: 0 });
    const event = { ...eventA, requiredAp: (baseline.availableAp ?? 0) + 13 * 2 * AP_PER_REFILL };
    const calculation = calculate(event);
    expect(calculation.refillSuggestions[0]).toMatchObject({
      kind: "event-period",
      startDate: "2026-10-01",
      endDate: "2026-10-13",
      fromCount: 0,
      toCount: 2,
      additionalAp: 3_120,
      pyroxeneCost: 780,
    });
  });

  it("targets preparation-window reset dates separately from the first event-period charge date", () => {
    const event: ApPlannerEvent = {
      ...eventA,
      startAt: "2026-11-17T02:00:00.000Z", // Nov 17, 11:00 KST
      endAt: "2026-11-20T02:00:00.000Z",
      requiredAp: 100_000,
    };
    const calculation = calculateApPlannerEvent({
      event,
      conditions,
      plan: { accessAt: "2026-11-17T03:00:00.000Z" }, // Nov 17, 12:00 KST; stockpile starts Nov 16, 12:00
      currentAt: "2026-11-16T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });

    expect(calculation.stockpileStartsAt).toBe("2026-11-16T03:00:00.000Z");
    expect(calculation.refillSuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "stockpile-day", startDate: "2026-11-17", endDate: "2026-11-17" }),
        expect.objectContaining({ kind: "event-period", startDate: "2026-11-18" }),
      ]),
    );
    expect(calculation.refillSuggestions.find(({ kind }) => kind === "stockpile-day")?.startDate).not.toBe(
      calculation.refillSuggestions.find(({ kind }) => kind === "event-period")?.startDate,
    );
  });

  it("keeps the applied refill row in the calculation after it covers the deficit", () => {
    const baseline = calculate({ ...eventA, requiredAp: 0 });
    const shortEvent = { ...eventA, requiredAp: (baseline.availableAp ?? 0) + 1 };
    const before = calculate(shortEvent);
    const suggestion = before.refillSuggestions[0];
    expect(suggestion).toBeDefined();
    if (!suggestion) return;

    const exception = {
      uid: "applied-period",
      startDate: suggestion.startDate,
      endDate: suggestion.endDate,
      count: suggestion.toCount,
    };
    const options = {
      ...defaultPyroxenePlannerOptions,
      consumption: { ...defaultPyroxenePlannerOptions.consumption, apChargeExceptions: [exception] },
    };
    const after = calculateApPlannerEvent({
      event: { ...eventA, requiredAp: suggestion.resultAp },
      conditions,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options,
    });

    expect(after.resultAp).toBeGreaterThanOrEqual(0);
    expect(after.refillSuggestions).toEqual([
      expect.objectContaining({
        kind: suggestion.kind,
        startDate: suggestion.startDate,
        endDate: suggestion.endDate,
        toCount: suggestion.toCount,
      }),
    ]);
  });

  it("reports refill suggestions blocked by an overlapping saved AP charge exception", () => {
    const options = {
      ...defaultPyroxenePlannerOptions,
      consumption: {
        ...defaultPyroxenePlannerOptions.consumption,
        apChargeExceptions: [{ uid: "existing", startDate: "2026-10-02", endDate: "2026-10-03", count: 1 }],
      },
    };
    const calculation = calculate({ ...eventA, requiredAp: 100_000 }, options);

    expect(calculation.refillOverlapConflict).toBe(true);
    expect(calculation.refillSuggestions.some(({ kind }) => kind === "event-period")).toBe(false);
  });

  it("counts a one-day event refill and excludes resets before the event opens", () => {
    const baseline = calculate({ ...eventA, requiredAp: 0 });
    const stockpileException = {
      uid: "stockpile-day",
      startDate: "2026-10-01",
      endDate: "2026-10-01",
      count: 6,
    };
    const withStockpileException = calculateApPlannerEvent({
      event: { ...eventA, requiredAp: 0 },
      conditions,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: {
        ...defaultPyroxenePlannerOptions,
        consumption: { ...defaultPyroxenePlannerOptions.consumption, apChargeExceptions: [stockpileException] },
      },
    });
    expect(withStockpileException.availableAp).toBe((baseline.availableAp ?? 0) + 6 * AP_PER_REFILL);

    const eventException = {
      uid: "event-period",
      startDate: "2026-10-01",
      endDate: "2026-10-13",
      count: 2,
    };
    const withEventException = calculateApPlannerEvent({
      event: { ...eventA, requiredAp: 0 },
      conditions,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: {
        ...defaultPyroxenePlannerOptions,
        consumption: { ...defaultPyroxenePlannerOptions.consumption, apChargeExceptions: [eventException] },
      },
    });
    expect(withEventException.supplyBreakdown?.apCharges).toBe(13 * 2 * AP_PER_REFILL);
  });

  it("suggests six charges at the 270 pyroxene tier and reports shortage after 20", () => {
    const baseline = calculate({ ...eventA, requiredAp: 0 });
    const oneDay = calculate({ ...eventA, requiredAp: (baseline.availableAp ?? 0) + 650 });
    expect(oneDay.refillSuggestions.find(({ kind }) => kind === "stockpile-day")).toMatchObject({
      toCount: 6,
      additionalAp: 720,
      pyroxeneCost: 270,
    });

    const capped = calculate({ ...eventA, requiredAp: (baseline.availableAp ?? 0) + 40_000 });
    expect(capped.refillSuggestions[0]?.toCount).toBe(20);
    expect(capped.refillSuggestions[0]?.deficitAfter).toBeGreaterThan(0);
  });

  it("keeps AP state bounded and retains unknown fields for forward compatibility", () => {
    const empty = createEmptyApPlannerState();
    expect(normalizeApPlannerState(empty)).toEqual(empty);
    expect(normalizeApPlannerState({ futureField: { value: "kept" } })).toEqual({
      accountLevel: null,
      cafeRank: null,
      comfort: null,
      eventPlans: {},
      futureField: { value: "kept" },
    });
    expect(normalizeApPlannerState({ tacticalApShopCount: null })?.tacticalApShopCount).toBeUndefined();
    expect(normalizeApPlannerState({ tacticalApShopCount: 0 })?.tacticalApShopCount).toBe(0);
    expect(normalizeApPlannerState({ tacticalApShopCount: 5 })).toBeNull();
    expect(normalizeApPlannerState({ futureField: "x".repeat(120_000) })).toBeNull();
    expect(normalizeApPlannerState({ cafeRank: 8 })?.comfort).toBe(4_500);
  });

  it("rejects overlapping AP refill exception ranges and preserves valid ranges", () => {
    const first = { uid: "one", startDate: "2026-09-30", endDate: "2026-10-02", count: 2 };
    const overlap = { uid: "two", startDate: "2026-10-02", endDate: "2026-10-03", count: 3 };
    expect(apChargeExceptionRangesOverlap(first, overlap)).toBe(true);
    expect(addApChargeException([first], overlap)).toEqual({ exceptions: [first], overlap: true });
    expect(() => normalizePyroxeneApChargeExceptions([first, overlap])).toThrow("겹쳐요");
    expect(normalizePyroxeneApChargeExceptions([first])).toEqual([first]);
  });

  describe("external review boundaries", () => {
    const nextEvent: ApPlannerEvent = {
      ...eventA,
      timelineUid: "next",
      name: "다음 이벤트",
      startAt: "2026-09-30T11:00:00+09:00",
      endAt: "2026-10-01T11:00:00+09:00",
      requiredAp: 1_500,
    };
    const base = {
      event: nextEvent,
      conditions,
      plan: { accessAt: "2026-09-30T12:00:00+09:00" },
      currentAt: "2026-09-28T12:00:00+09:00",
      options: defaultPyroxenePlannerOptions,
    };

    it("gives the whole overlap to an earlier event that ends after the next access time", () => {
      const previous = {
        timelineUid: "previous",
        name: "앞 이벤트",
        startAt: "2026-09-25T11:00:00+09:00",
        endAt: "2026-10-01T10:00:00+09:00",
      };
      const calculation = calculateApPlannerEvent({ ...base, previousPlannedEvents: [previous] });
      expect(calculation.overlapEventName).toBe("앞 이벤트");
      expect(calculation.stockpileStartsAt).toBeNull();
      expect(calculation.stockpileSteps).toEqual([]);
      // Only 10:00~11:00 on 10/1 remains; that game day's tasks and refills belong to the earlier event.
      expect(calculation.supplyBreakdown).toMatchObject({
        stockpile: 0,
        natural: 10,
        dailyTasks: 0,
        apCharges: 0,
      });
      expect(calculation.refillSuggestions.every((suggestion) => suggestion.kind === "event-period")).toBe(true);
    });

    it("orders events with the same start so only one of them owns the overlap", () => {
      const sibling = {
        timelineUid: "a-sibling",
        name: "동시 시작",
        startAt: nextEvent.startAt,
        endAt: nextEvent.endAt as string,
      };
      const withSibling = calculateApPlannerEvent({ ...base, previousPlannedEvents: [sibling] });
      expect(withSibling.overlapEventName).toBe("동시 시작");
      const siblingCalculation = calculateApPlannerEvent({
        ...base,
        event: { ...nextEvent, timelineUid: "a-sibling" },
        previousPlannedEvents: [{ ...sibling, timelineUid: "next" }],
      });
      expect(siblingCalculation.overlapEventName).toBeNull();
    });

    it("keeps the planned stockpile but flags a start time that has already passed", () => {
      const late = calculateApPlannerEvent({ ...base, currentAt: "2026-09-30T10:30:00+09:00" });
      expect(late.stockpileStartsAt).toBe("2026-09-29T03:00:00.000Z");
      expect(late.supplyBreakdown?.stockpile).toBe(830);
      expect(late.stockpileStartPassed).toBe(true);
      expect(calculateApPlannerEvent(base).stockpileStartPassed).toBe(false);
    });

    it("counts the daily tasks of the access game day for a future event", () => {
      expect(calculateApPlannerEvent(base).supplyBreakdown).toMatchObject({ dailyTaskDays: 2, dailyTasks: 300 });
    });

    it("counts all 14 AP package game days across the stockpile and event period", () => {
      const packageEvent: ApPlannerEvent = {
        ...nextEvent,
        startAt: "2026-10-01T11:00:00+09:00",
        endAt: "2026-10-20T11:00:00+09:00",
      };
      const packageRecords: ApPackagePurchaseRecord[] = [
        { eventAt: "2026-10-01T04:00:00+09:00", autoRepurchase: false },
      ];
      const calculation = calculateApPlannerEvent({
        ...base,
        event: packageEvent,
        plan: { accessAt: packageEvent.startAt },
        packageRecords,
      });

      // 13 of the 14 days fall in the event period; the first day is received on login at access.
      expect(calculation.supplyBreakdown?.apPackage).toBe(1_950);
      expect(calculation.stockpileSteps).toContainEqual(
        expect.objectContaining({ kind: "ap-package", receivedAp: 150, at: "2026-10-01T02:00:00.000Z" }),
      );
      expect(calculation.stockpileSteps.find((step) => step.kind === "access")?.ap).toBe(
        calculation.supplyBreakdown?.stockpile,
      );
      const supply = calculation.supplyBreakdown;
      expect(
        (supply?.stockpile ?? 0) +
          (supply?.natural ?? 0) +
          (supply?.cafe ?? 0) +
          (supply?.dailyTasks ?? 0) +
          (supply?.apPackage ?? 0) +
          (supply?.apCharges ?? 0) +
          (supply?.tacticalApShop ?? 0),
      ).toBe(calculation.availableAp);
    });

    it("repeats auto-renewed packages every 14 game days and adds overlapping records", () => {
      const packageEvent: ApPlannerEvent = {
        ...nextEvent,
        startAt: "2026-10-15T11:00:00+09:00",
        endAt: "2026-10-30T11:00:00+09:00",
      };
      const packageRecords: ApPackagePurchaseRecord[] = [
        { eventAt: "2026-10-01T04:00:00+09:00", autoRepurchase: true },
        { eventAt: "2026-10-15T04:00:00+09:00", autoRepurchase: false },
      ];
      const calculation = calculateApPlannerEvent({
        ...base,
        event: packageEvent,
        plan: { accessAt: packageEvent.startAt },
        packageRecords,
      });

      expect(calculation.supplyBreakdown?.apPackage).toBe(4_200);
      expect(calculation.stockpileSteps).toContainEqual(
        expect.objectContaining({ kind: "ap-package", receivedAp: 300, at: "2026-10-15T02:00:00.000Z" }),
      );
    });

    it("summarizes future coverage from AP package records", () => {
      expect(
        apPackagePanelSummary(
          [{ eventAt: "2026-09-20T04:00:00+09:00", autoRepurchase: false }],
          "2026-09-30T12:00:00+09:00",
        ),
      ).toBe("10/3까지");
      expect(
        apPackagePanelSummary(
          [{ eventAt: "2026-09-20T04:00:00+09:00", autoRepurchase: true }],
          "2026-09-30T12:00:00+09:00",
        ),
      ).toBe("자동 재구매 중");
      expect(apPackagePanelSummary([], "2026-09-30T12:00:00+09:00")).toBe("구매 기록 없음");
      expect(
        apPackagePanelSummary(
          [{ eventAt: "2026-09-01T04:00:00+09:00", autoRepurchase: false }],
          "2026-09-30T12:00:00+09:00",
        ),
      ).toBe("진행 중인 패키지 없음");
      const lastDay = [{ eventAt: "2026-11-01T04:00:00+09:00", autoRepurchase: false }];
      expect(apPackagePanelSummary(lastDay, "2026-11-14T04:01:00+09:00")).toBe("11/14까지");
      expect(apPackagePanelSummary(lastDay, "2026-11-15T04:01:00+09:00")).toBe("진행 중인 패키지 없음");
    });

    it("buys the access day's tactical items after access and each later day's items in the event period", () => {
      const calculation = calculateApPlannerEvent({
        ...base,
        conditions: { ...conditions, accountLevel: 90, tacticalApShopCount: 4 },
        options: {
          ...defaultPyroxenePlannerOptions,
          consumption: { ...defaultPyroxenePlannerOptions.consumption, apChargeCount: 20 },
        },
      });

      expect(calculation.supplyBreakdown).toMatchObject({
        tacticalApShopCount: 4,
        tacticalApShop: 720,
        tacticalApShopDays: 2,
      });
      expect(calculation.stockpileSteps.find((step) => step.kind === "after-access")).toMatchObject({
        label: "AP를 쓰면서 AP 충전 20회 · 전술 대회 AP 360 구매 (10/1(목) 04:00 전까지)",
        receivedAp: 20 * AP_PER_REFILL + 360,
      });
      expect(calculation.stockpileSteps.filter((step) => step.kind !== "access").every((step) => step.ap <= 999)).toBe(
        true,
      );
    });

    it("assumes today's daily tasks were already received for an ongoing event", () => {
      const ongoing = calculateApPlannerEvent({ ...base, plan: null, currentAt: "2026-09-30T12:00:00+09:00" });
      expect(ongoing.status).toBe("ongoing");
      expect(ongoing.supplyBreakdown).toMatchObject({ dailyTaskDays: 1, dailyTasks: 150 });
    });

    it("counts tactical purchases for the same game days as daily missions while ongoing", () => {
      const ongoing = calculateApPlannerEvent({
        ...base,
        conditions: { ...conditions, tacticalApShopCount: 1 },
        plan: null,
        currentAt: "2026-09-30T12:00:00+09:00",
      });

      // Today's purchases are counted as not bought yet, unlike today's daily tasks.
      expect(ongoing.supplyBreakdown).toMatchObject({
        dailyTaskDays: 1,
        tacticalApShopDays: 2,
        tacticalApShop: 180,
      });
    });

    it("counts and suggests today's refills for an ongoing event on its last game day", () => {
      const lastDay = {
        ...base,
        event: { ...nextEvent, startAt: "2026-11-17T11:00:00+09:00", endAt: "2026-11-19T10:59:00+09:00" },
        plan: null,
        currentAt: "2026-11-19T04:01:00+09:00",
      };
      const withoutTodayCharges = calculateApPlannerEvent(lastDay);
      const withTodayCharges = calculateApPlannerEvent({
        ...lastDay,
        options: {
          ...defaultPyroxenePlannerOptions,
          consumption: {
            ...defaultPyroxenePlannerOptions.consumption,
            apChargeExceptions: [{ uid: "today", startDate: "2026-11-19", endDate: "2026-11-19", count: 3 }],
          },
        },
      });
      expect(withoutTodayCharges.status).toBe("ongoing");
      expect(withTodayCharges.availableAp).toBe((withoutTodayCharges.availableAp as number) + 360);
      expect(withTodayCharges.supplyBreakdown).toMatchObject({ apCharges: 360, apChargeDays: 1, dailyTaskDays: 0 });

      const short = calculateApPlannerEvent({
        ...lastDay,
        event: { ...lastDay.event, requiredAp: (withoutTodayCharges.availableAp as number) + 360 },
      });
      expect(short.refillSuggestions).toEqual([
        expect.objectContaining({
          kind: "event-period",
          startDate: "2026-11-19",
          endDate: "2026-11-19",
          toCount: 3,
          additionalAp: 360,
          deficitAfter: 0,
        }),
      ]);
    });

    it("follows the registered access plan for a started event until the access time passes", () => {
      const event: ApPlannerEvent = {
        ...eventA,
        timelineUid: "started",
        startAt: "2026-11-17T11:00:00+09:00",
        endAt: "2026-11-19T10:59:00+09:00",
        requiredAp: 3_000,
      };
      const at = (currentAt: string) =>
        calculateApPlannerEvent({
          ...base,
          event,
          plan: { accessAt: "2026-11-17T12:00:00+09:00" },
          currentAt,
        });
      const beforeStart = at("2026-11-17T10:59:00+09:00");
      const started = at("2026-11-17T11:00:00+09:00");
      const justBeforeAccess = at("2026-11-17T11:59:00+09:00");

      for (const calculation of [started, justBeforeAccess]) {
        expect(calculation.status).toBe("ready");
        expect(calculation.availableAp).toBe(beforeStart.availableAp);
        expect(calculation.supplyBreakdown).toEqual(beforeStart.supplyBreakdown);
        expect(calculation.stockpileSteps).toEqual(beforeStart.stockpileSteps);
      }
      expect(started.supplyBreakdown?.stockpile).toBe(830);

      const afterAccess = at("2026-11-17T12:00:00+09:00");
      expect(afterAccess.status).toBe("ongoing");
      expect(afterAccess.accessTimePassed).toBe(true);
      expect(afterAccess.supplyBreakdown?.stockpile).toBe(0);
    });

    it("suggests refills for the access game day when access is days after the event start", () => {
      const event: ApPlannerEvent = {
        ...eventA,
        timelineUid: "late-access",
        startAt: "2026-11-17T11:00:00+09:00",
        endAt: "2026-11-19T10:59:00+09:00",
        requiredAp: 0,
      };
      const lateBase = { ...base, event, plan: { accessAt: "2026-11-19T08:00:00+09:00" } };
      const availableAp = calculateApPlannerEvent(lateBase).availableAp as number;
      const short = calculateApPlannerEvent({ ...lateBase, event: { ...event, requiredAp: availableAp + 120 } });

      expect(short.refillSuggestions).toEqual([
        expect.objectContaining({
          kind: "stockpile-day",
          startDate: "2026-11-19",
          endDate: "2026-11-19",
          toCount: 1,
          additionalAp: 120,
          deficitAfter: 0,
        }),
      ]);
      const applied = calculateApPlannerEvent({
        ...lateBase,
        options: {
          ...defaultPyroxenePlannerOptions,
          consumption: {
            ...defaultPyroxenePlannerOptions.consumption,
            apChargeExceptions: [{ uid: "late", startDate: "2026-11-19", endDate: "2026-11-19", count: 1 }],
          },
        },
      });
      expect(applied.availableAp).toBe(availableAp + 120);
    });

    it("suggests access-day refills worth 120 AP each without touching the stockpile", () => {
      const calculation = calculateApPlannerEvent({ ...base, event: { ...nextEvent, requiredAp: 3_200 } });
      const suggestion = calculation.refillSuggestions.find((item) => item.kind === "stockpile-day");
      expect(suggestion).toBeDefined();
      expect(suggestion?.additionalAp).toBe(((suggestion?.toCount ?? 0) - 0) * AP_PER_REFILL);
      const applied = calculateApPlannerEvent({
        ...base,
        event: { ...nextEvent, requiredAp: 3_200 },
        options: {
          ...defaultPyroxenePlannerOptions,
          consumption: {
            ...defaultPyroxenePlannerOptions.consumption,
            apChargeExceptions: [
              {
                uid: "applied",
                startDate: suggestion?.startDate as string,
                endDate: suggestion?.endDate as string,
                count: suggestion?.toCount as number,
              },
            ],
          },
        },
      });
      expect(applied.supplyBreakdown?.stockpile).toBe(calculation.supplyBreakdown?.stockpile);
      expect(applied.availableAp).toBe((calculation.availableAp ?? 0) + (suggestion?.additionalAp ?? 0));
      expect(applied.stockpileSteps.find((step) => step.kind === "after-access")?.label).toContain(
        `AP 충전 ${suggestion?.toCount}회`,
      );
    });

    it("keeps natural regen running until access however many refills are planned", () => {
      const withoutRefills = calculateApPlannerEvent(base);
      const withRefills = calculateApPlannerEvent({
        ...base,
        options: {
          ...defaultPyroxenePlannerOptions,
          consumption: {
            ...defaultPyroxenePlannerOptions.consumption,
            apChargeExceptions: [{ uid: "manual", startDate: "2026-09-30", endDate: "2026-09-30", count: 13 }],
          },
        },
      });

      expect(withRefills.supplyBreakdown?.stockpile).toBe(withoutRefills.supplyBreakdown?.stockpile);
      expect(withRefills.availableAp).toBe((withoutRefills.availableAp ?? 0) + 13 * AP_PER_REFILL);
      expect(withRefills.stockpileSteps.find((step) => step.kind === "after-access")).toMatchObject({
        label: "AP를 쓰면서 AP 충전 13회 (10/1(목) 04:00 전까지)",
        receivedAp: 13 * AP_PER_REFILL,
      });
    });

    it("applies AP charge exceptions by the 04:00 game day", () => {
      const consumption = {
        apChargeCount: 3,
        apChargeExceptions: [{ uid: "e", startDate: "2026-09-30", endDate: "2026-09-30", count: 6 }],
      };
      expect(getPyroxeneApChargeCountForDate("2026-09-30T02:00:00+09:00", consumption)).toBe(3);
      expect(getPyroxeneApChargeCountForDate("2026-09-30T04:00:00+09:00", consumption)).toBe(6);
      expect(getPyroxeneApChargeCountForDate("2026-10-01T02:00:00+09:00", consumption)).toBe(6);
      expect(getPyroxeneApChargeCountForDate("2026-10-01T04:00:00+09:00", consumption)).toBe(3);
    });
  });

  describe("hold limit, mailbox, and deferred purchases", () => {
    const reviewEvent: ApPlannerEvent = { ...eventA, requiredAp: 2_000 };
    function calculateWith(input: {
      tacticalApShopCount?: number;
      apChargeCount?: number;
      packageRecords?: ApPackagePurchaseRecord[];
    }) {
      return calculateApPlannerEvent({
        event: reviewEvent,
        conditions: { ...conditions, tacticalApShopCount: input.tacticalApShopCount ?? 0 },
        plan: { accessAt: "2026-09-30T03:00:00.000Z" },
        currentAt: "2026-09-27T00:00:00.000Z",
        options: {
          ...defaultPyroxenePlannerOptions,
          consumption: { ...defaultPyroxenePlannerOptions.consumption, apChargeCount: input.apChargeCount ?? 0 },
        },
        packageRecords: input.packageRecords,
      });
    }
    function breakdownSum(calculation: ReturnType<typeof calculateWith>) {
      const supply = calculation.supplyBreakdown;
      if (!supply) throw new Error("missing breakdown");
      return (
        supply.stockpile +
        supply.natural +
        supply.cafe +
        supply.dailyTasks +
        supply.apPackage +
        supply.apCharges +
        supply.tacticalApShop
      );
    }

    it("adds the access day's tactical AP only once", () => {
      const without = calculateWith({});
      const withTactical = calculateWith({ tacticalApShopCount: 2 });
      const days = withTactical.supplyBreakdown?.tacticalApShopDays ?? 0;

      expect(withTactical.supplyBreakdown?.stockpile).toBe(without.supplyBreakdown?.stockpile);
      expect(withTactical.supplyBreakdown?.tacticalApShop).toBe(days * 180);
      expect((withTactical.availableAp ?? 0) - (without.availableAp ?? 0)).toBe(days * 180);
      expect(breakdownSum(withTactical)).toBe(withTactical.availableAp);
    });

    it("keeps every refill of the access day", () => {
      const calculation = calculateWith({ apChargeCount: 20 });

      expect(calculation.stockpileSteps.find((step) => step.kind === "after-access")?.label).toContain("AP 충전 20회");
      expect(calculation.supplyBreakdown?.apCharges).toBe(
        ((calculation.supplyBreakdown?.apChargeDays ?? 0) + 1) * 20 * AP_PER_REFILL,
      );
      expect(calculation.supplyBreakdown?.stockpile).toBe(calculateWith({}).supplyBreakdown?.stockpile);
      expect(breakdownSum(calculation)).toBe(calculation.availableAp);
    });

    it("receives the package on login at access before collecting cafe AP", () => {
      const packageRecords: ApPackagePurchaseRecord[] = [
        { eventAt: "2026-09-25T04:00:00+09:00", autoRepurchase: false },
      ];
      const calculation = calculateWith({ apChargeCount: 6, packageRecords });

      expect(calculation.stockpileSteps.slice(-3)).toEqual([
        expect.objectContaining({ kind: "ap-package", ap: 380, mailboxAp: 0, receivedAp: 150 }),
        expect.objectContaining({ kind: "access", label: "카페 AP 600 받기", ap: 980, mailboxAp: 0 }),
        expect.objectContaining({ kind: "after-access", label: "AP를 쓰면서 AP 충전 6회 (10/1(목) 04:00 전까지)" }),
      ]);
      expect(breakdownSum(calculation)).toBe(calculation.availableAp);
    });

    it("sends package and cafe AP over 999 to the mailbox", () => {
      const calculation = calculateApPlannerEvent({
        event: reviewEvent,
        conditions: { accountLevel: 90, cafeRank: 10, comfort: 5_500 },
        plan: { accessAt: "2026-09-30T03:00:00.000Z" },
        currentAt: "2026-09-27T00:00:00.000Z",
        options: defaultPyroxenePlannerOptions,
        packageRecords: [{ eventAt: "2026-09-25T04:00:00+09:00", autoRepurchase: false }],
      });
      const accessStep = calculation.stockpileSteps.find((step) => step.kind === "access");
      const mailboxAp = (accessStep?.ap ?? 0) - 999;

      expect(mailboxAp).toBeGreaterThan(0);
      expect(accessStep).toMatchObject({ mailboxAp, unclaimedCafeAp: 0 });
      expect(accessStep?.label).toContain(`999 AP를 넘는 ${mailboxAp} AP는 우편함으로 · 10/1(목) 12:00까지 받기`);
      expect(calculation.stockpileSteps.at(-1)).toMatchObject({
        kind: "mailbox",
        ap: 999,
        mailboxAp,
        label: `AP를 쓴 뒤 우편함 AP ${mailboxAp} 받기 (받은 뒤 999 AP를 넘지 않을 때만 · 10/1(목) 12:00까지)`,
      });
    });
  });
});
