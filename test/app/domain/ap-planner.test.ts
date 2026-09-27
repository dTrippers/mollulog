import { describe, expect, it } from "@jest/globals";
import type { ApPlannerEvent } from "../../../app/domain/ap-planner";
import {
  AP_PER_REFILL,
  addApChargeException,
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
      previousPlannedEvents: [{ name: "이벤트 A", startAt: eventA.startAt, endAt: eventA.endAt as string }],
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

  it("pins a full preparation sequence with cafe storage, natural AP, daily tasks, and reset-based refills", () => {
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
    expect(calculation.stockpileSteps).toEqual([
      {
        at: "2026-11-16T03:00:00.000Z",
        label: "카페 AP를 받고 AP를 모두 사용하기 · 이후 AP 쓰지 않기",
        ap: 0,
        kind: "drain",
      },
      {
        at: "2026-11-16T19:00:00.000Z",
        label: "자연 회복 160 AP · AP 충전 3회 · +360 AP",
        ap: 520,
        kind: "charge",
        receivedAp: 360,
      },
      {
        at: "2026-11-17T03:00:00.000Z",
        label: "접속해서 카페 AP 600 받기",
        ap: 1_120,
        kind: "access",
        receivedAp: 600,
      },
    ]);
    const chargeStep = calculation.stockpileSteps.find((step) => step.kind === "charge");
    const cafeStoredAtReset = Math.floor(cafeProduction(8, 4_500).apPerHour * 16);
    expect(chargeStep?.ap).toBe(520);
    expect((chargeStep?.ap ?? 0) + cafeStoredAtReset).toBe(922);
    expect((chargeStep?.ap ?? 0) + cafeStoredAtReset).toBeLessThan(999);
    expect(calculation.supplyBreakdown).toMatchObject({
      stockpile: 1_120,
      natural: 470,
      cafe: 1_178,
      dailyTasks: 300,
      dailyTaskDays: 2,
      apCharges: 720,
      apChargeDays: 2,
    });
    expect(calculation.availableAp).toBe(3_788);
    expect(calculation.stockpileSteps.at(-1)?.ap).toBe(calculation.supplyBreakdown?.stockpile);
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

    expect(calculation.supplyBreakdown).toMatchObject({ stockpile: 1_120, apCharges: 720, apChargeDays: 2 });
    expect(calculation.availableAp).toBe(3_788);
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
    const oneDay = calculate({ ...eventA, requiredAp: (baseline.availableAp ?? 0) + 600 });
    expect(oneDay.refillSuggestions[1]).toMatchObject({
      kind: "stockpile-day",
      toCount: 6,
      additionalAp: 650,
      pyroxeneCost: 270,
    });

    const capped = calculate({ ...eventA, requiredAp: (baseline.availableAp ?? 0) + 40_000 });
    expect(capped.refillSuggestions[0]?.toCount).toBe(20);
    expect(capped.refillSuggestions[0]?.deficitAfter).toBeGreaterThan(0);
  });

  it("keeps AP state bounded and retains unknown fields for forward compatibility", () => {
    const empty = createEmptyApPlannerState();
    expect(normalizeApPlannerState(empty)).toEqual(empty);
    expect(normalizeApPlannerState({ futureField: { value: "kept" } })).toMatchObject({
      accountLevel: null,
      cafeRank: null,
      comfort: null,
      eventPlans: {},
      futureField: { value: "kept" },
    });
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
});
