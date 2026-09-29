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
        mailboxAp: 0,
        kind: "charge",
        receivedAp: 360,
      },
      {
        at: "2026-11-17T03:00:00.000Z",
        label: "접속해서 카페 AP 600 받기 (999 AP를 넘는 121 AP는 우편함으로 · 11/18(수) 12:00까지 받기)",
        ap: 1_120,
        mailboxAp: 121,
        unclaimedCafeAp: 0,
        kind: "access",
        receivedAp: 600,
      },
      {
        at: "2026-11-17T03:00:00.000Z",
        label: "AP를 쓴 뒤 우편함 AP 121 받기 (받은 뒤 999 AP를 넘지 않을 때만 · 11/18(수) 12:00까지)",
        ap: 999,
        mailboxAp: 121,
        kind: "mailbox",
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
      dailyTasks: 450,
      dailyTaskDays: 3,
      apCharges: 720,
      apChargeDays: 2,
    });
    expect(calculation.availableAp).toBe(3_938);
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

    expect(calculation.supplyBreakdown).toMatchObject({ stockpile: 1_120, apCharges: 720, apChargeDays: 2 });
    expect(calculation.availableAp).toBe(3_938);
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

      // 13 of the 14 days fall in the event period; the first day is part of the stockpile.
      expect(calculation.supplyBreakdown?.apPackage).toBe(1_950);
      expect(calculation.stockpileSteps).toContainEqual(
        expect.objectContaining({ kind: "ap-package", receivedAp: 150, at: "2026-09-30T19:00:00.000Z" }),
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
        expect.objectContaining({ kind: "ap-package", receivedAp: 300, at: "2026-10-14T19:00:00.000Z" }),
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
    });

    it("counts tactical AP once per 04:00 reset across stockpiling and the event period", () => {
      const calculation = calculateApPlannerEvent({
        ...base,
        conditions: { ...conditions, tacticalApShopCount: 2 },
      });

      expect(calculation.supplyBreakdown).toMatchObject({
        tacticalApShopCount: 2,
        // The stockpiled 180 AP is already in the stockpile, so only the event-period purchase is listed here.
        tacticalApShop: 180,
        tacticalApShopDays: 2,
      });
      expect(calculation.stockpileSteps.filter((step) => step.kind === "tactical-purchase")).toEqual([
        expect.objectContaining({ at: "2026-09-29T19:00:00.000Z", receivedAp: 180 }),
      ]);
    });

    it("applies the 999 AP stockpile purchase cap to each tactical shop item", () => {
      const calculation = calculateApPlannerEvent({
        ...base,
        conditions: { ...conditions, accountLevel: 90, tacticalApShopCount: 4 },
        options: {
          ...defaultPyroxenePlannerOptions,
          consumption: { ...defaultPyroxenePlannerOptions.consumption, apChargeCount: 20 },
        },
      });
      const tacticalStep = calculation.stockpileSteps.find((step) => step.kind === "tactical-purchase");

      expect(tacticalStep).toMatchObject({ ap: 970, receivedAp: 90 });
      expect(tacticalStep?.label).toContain("360 AP 중 90 AP만");
      expect(tacticalStep?.ap).toBeLessThanOrEqual(999);
    });

    it.each([
      {
        itemAp: 60,
        accessAt: "2026-09-30T09:00:00+09:00",
        eventStartAt: "2026-09-30T08:00:00+09:00",
        expectedAp: 970,
      },
      {
        itemAp: 30,
        accessAt: "2026-09-30T04:00:00+09:00",
        eventStartAt: "2026-09-30T03:00:00+09:00",
        expectedAp: 990,
      },
    ])("buys the $itemAp AP item when only that lineup item fits under 999", ({
      itemAp,
      accessAt,
      eventStartAt,
      expectedAp,
    }) => {
      const calculation = calculateApPlannerEvent({
        ...base,
        event: { ...nextEvent, startAt: eventStartAt },
        conditions: { ...conditions, accountLevel: 90, tacticalApShopCount: 1 },
        plan: { accessAt },
        options: {
          ...defaultPyroxenePlannerOptions,
          consumption: { ...defaultPyroxenePlannerOptions.consumption, apChargeCount: 20 },
        },
      });
      const tacticalStep = calculation.stockpileSteps.find((step) => step.kind === "tactical-purchase");

      expect(tacticalStep).toMatchObject({ ap: expectedAp, receivedAp: itemAp });
      expect(tacticalStep?.ap).toBeLessThanOrEqual(999);
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

      expect(ongoing.supplyBreakdown).toMatchObject({
        dailyTaskDays: 1,
        tacticalApShopDays: 1,
        tacticalApShop: 90,
      });
    });

    it("keeps the result for an ongoing event while exposing its future registered access plan", () => {
      const ongoing = calculateApPlannerEvent({
        ...base,
        plan: { accessAt: "2026-10-01T03:00:00+09:00" },
        currentAt: "2026-09-30T12:00:00+09:00",
      });

      expect(ongoing.status).toBe("ongoing");
      expect(ongoing.accessTimePassed).toBe(false);
      expect(ongoing.stockpileSteps.some((step) => step.kind === "access")).toBe(true);
    });

    it("never refills above 999 held AP while stockpiling and suggests only useful refills", () => {
      const calculation = calculateApPlannerEvent({ ...base, event: { ...nextEvent, requiredAp: 3_200 } });
      const suggestion = calculation.refillSuggestions.find((item) => item.kind === "stockpile-day");
      expect(suggestion).toBeDefined();
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
      const chargeSteps = applied.stockpileSteps.filter((step) => step.kind === "charge");
      expect(chargeSteps.length).toBeGreaterThan(0);
      expect(chargeSteps.every((step) => step.ap <= 999)).toBe(true);
      // 160 AP from natural regen leaves room for floor((999 - 160) / 120) = 6 refills before access; the rest of
      // the day's refills are bought after access. Holding more than the max AP stops the 70 AP of natural regen
      // until access, so 12 refills gain 1,440 - 70.
      expect(suggestion).toMatchObject({ toCount: 12, additionalAp: 1_370 });
    });

    it("keeps searching refill counts when one refill is offset by the natural regen it stops", () => {
      const calculation = calculateApPlannerEvent({
        ...base,
        event: { ...nextEvent, startAt: "2026-09-29T11:00:00+09:00", requiredAp: 10_000 },
        plan: { accessAt: "2026-09-30T03:00:00+09:00" },
      });
      // 04:00 on 9/29: one refill only replaces the natural regen it stops, so the search must go past it.
      expect(calculation.refillSuggestions.find((item) => item.kind === "stockpile-day")).toMatchObject({
        startDate: "2026-09-29",
        toCount: 20,
        additionalAp: 2_180,
      });
    });

    it("caps an over-limit saved exception and says how many refills were possible", () => {
      const calculation = calculateApPlannerEvent({
        ...base,
        options: {
          ...defaultPyroxenePlannerOptions,
          consumption: {
            ...defaultPyroxenePlannerOptions.consumption,
            apChargeExceptions: [{ uid: "manual", startDate: "2026-09-30", endDate: "2026-09-30", count: 13 }],
          },
        },
      });
      const chargeStep = calculation.stockpileSteps.find((step) => step.kind === "charge");
      expect(chargeStep).toMatchObject({ ap: 880, receivedAp: 720 });
      expect(chargeStep?.label).toContain("13회 중 6회만");
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

    it("adds stockpiled tactical AP only once", () => {
      const without = calculateWith({});
      const withTactical = calculateWith({ tacticalApShopCount: 2 });
      const stockpileGain = (withTactical.supplyBreakdown?.stockpile ?? 0) - (without.supplyBreakdown?.stockpile ?? 0);
      const eventPeriodDays = (withTactical.supplyBreakdown?.tacticalApShopDays ?? 0) - 1;

      expect(withTactical.supplyBreakdown?.tacticalApShop).toBe(eventPeriodDays * 180);
      expect((withTactical.availableAp ?? 0) - (without.availableAp ?? 0)).toBe(stockpileGain + eventPeriodDays * 180);
      expect(breakdownSum(withTactical)).toBe(withTactical.availableAp);
    });

    it("keeps the access day's refills that the hold limit deferred", () => {
      const calculation = calculateWith({ apChargeCount: 20 });
      const chargeStep = calculation.stockpileSteps.find((step) => step.kind === "charge");

      expect(chargeStep).toMatchObject({ receivedAp: 6 * AP_PER_REFILL });
      expect(chargeStep?.label).toContain("나머지 14회는 접속 후 AP를 쓰고 충전");
      expect(calculation.supplyBreakdown?.apCharges).toBe(
        ((calculation.supplyBreakdown?.apChargeDays ?? 0) * 20 + 14) * AP_PER_REFILL,
      );
      expect(breakdownSum(calculation)).toBe(calculation.availableAp);
    });

    it("keeps the access day's tactical items that the hold limit deferred", () => {
      const calculation = calculateWith({ apChargeCount: 6, tacticalApShopCount: 4 });
      const tacticalStep = calculation.stockpileSteps.find((step) => step.kind === "tactical-purchase");
      const deferredAp = 360 - (tacticalStep?.receivedAp ?? 0);
      const eventPeriodDays = (calculation.supplyBreakdown?.tacticalApShopDays ?? 0) - 1;

      expect(deferredAp).toBeGreaterThan(0);
      expect(tacticalStep?.label).toContain("나머지는 접속 후 AP를 쓰고 구매");
      expect(calculation.supplyBreakdown?.tacticalApShop).toBe(eventPeriodDays * 360 + deferredAp);
    });

    it("receives the package on login before refills and sends AP over 999 to the mailbox", () => {
      const packageRecords: ApPackagePurchaseRecord[] = [
        { eventAt: "2026-09-25T04:00:00+09:00", autoRepurchase: false },
      ];
      const calculation = calculateWith({ apChargeCount: 6, packageRecords });
      const kinds = calculation.stockpileSteps.map((step) => step.kind);
      const chargeStep = calculation.stockpileSteps.find((step) => step.kind === "charge");
      const accessStep = calculation.stockpileSteps.find((step) => step.kind === "access");

      expect(kinds.indexOf("ap-package")).toBeLessThan(kinds.indexOf("charge"));
      expect(chargeStep).toMatchObject({ ap: 910, receivedAp: 5 * AP_PER_REFILL });
      expect(chargeStep?.label).toContain("나머지 1회는 접속 후");
      expect(calculation.stockpileSteps.every((step) => step.kind === "access" || step.ap <= 999)).toBe(true);
      expect(accessStep).toMatchObject({ ap: 1_510, mailboxAp: 511, unclaimedCafeAp: 0 });
      expect(accessStep?.label).toContain("999 AP를 넘는 511 AP는 우편함으로");
      expect(calculation.stockpileSteps.at(-1)).toMatchObject({ kind: "mailbox", ap: 999, mailboxAp: 511 });
      expect(breakdownSum(calculation)).toBe(calculation.availableAp);
    });
  });
});
