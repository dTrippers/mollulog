import { describe, expect, it } from "@jest/globals";
import { buildBalanceChartPoints } from "~/components/v2/features/pyroxene/BalanceChart";
import {
  buildPlannerTimelineRows,
  getPyroxeneEventStatus,
  numberTargetEvents,
  type PlannerTimelineRowOptions,
} from "~/domain/pyroxene-planner-view";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { createOptimisticAttendanceTimelineItems, getAttendanceStartDate } from "~/domain/pyroxene-sources";
import type { TimelineEntry, TimelinePickupPlan } from "~/domain/pyroxene-timeline";
import dayjs from "~/lib/dayjs";

const resources = (pyroxene: number) => ({ pyroxene, oneTimeTicket: 0, tenTimeTicket: 0 });

const plan: TimelinePickupPlan = { basis: "average", basisOverridden: false, pulls: 100, freePulls: 0, stacks: [] };

function event(
  uid: string,
  favorited: boolean,
  ruleSet?: "call_charge_v1",
): NonNullable<PyroxeneScheduleItem["event"]> {
  return {
    uid,
    name: `이벤트 ${uid}`,
    since: "2026-12-01T02:00:00Z",
    until: "2026-12-15T02:00:00Z",
    earnablePyroxene: null,
    tags: [],
    recruitmentRuleSet: ruleSet,
    recruitments: [
      {
        recruitmentType: "limited" as never,
        pickup: true,
        rerun: false,
        until: null,
        student: { uid: `s-${uid}`, name: "학생", initialTier: 3 },
        favorited,
      },
    ],
  };
}

function eventEntry(
  uid: string,
  date: string,
  balance: number,
  options: { low?: number; planned?: boolean; favorited?: boolean; ruleSet?: "call_charge_v1" } = {},
): TimelineEntry {
  const planned = options.planned ?? true;
  return {
    date: dayjs(date),
    source: { type: "event", event: event(uid, options.favorited ?? planned, options.ruleSet) },
    accumulatedResources: resources(balance),
    accumulatedResourcesBand:
      options.low === undefined
        ? undefined
        : { pessimistic: resources(options.low), optimistic: resources(balance + 1000) },
    resourceDelta: resources(planned ? -12000 : 0),
    pickupPlan: planned ? plan : undefined,
  };
}

function incomeEntry(
  date: string,
  type: TimelineEntry["source"]["type"],
  delta: number,
  balance: number,
  extra: Partial<TimelineEntry["source"]> = {},
): TimelineEntry {
  return {
    date: dayjs(date),
    source: { type, ...extra },
    accumulatedResources: resources(balance),
    resourceDelta: resources(delta),
  };
}

function rowOptions(overrides: Partial<PlannerTimelineRowOptions> = {}): PlannerTimelineRowOptions {
  return {
    display: ["buy", "raid"],
    hideUntargeted: false,
    selectedEventUid: null,
    completedEventUids: new Set(),
    collectedSourceKeys: new Set(),
    collectableSourceKeys: new Set(),
    collectedSourceResources: new Map(),
    markers: new Map(),
    ...overrides,
  };
}

describe("pyroxene planner view", () => {
  it("rates a negative balance short and a negative low end of the range as caution", () => {
    expect(getPyroxeneEventStatus(eventEntry("a", "2026-12-01", -1))).toBe("short");
    expect(getPyroxeneEventStatus(eventEntry("a", "2026-12-01", 100, { low: -1 }))).toBe("caution");
    expect(getPyroxeneEventStatus(eventEntry("a", "2026-12-01", 100, { low: 0 }))).toBe("enough");
  });

  it("numbers only planned events", () => {
    const timeline = [
      eventEntry("a", "2026-12-01", 500),
      eventEntry("b", "2026-12-05", 0, { planned: false }),
      eventEntry("c", "2026-12-10", -300),
    ];
    const markers = numberTargetEvents(timeline);
    expect([...markers]).toEqual([
      ["a", 1],
      ["c", 2],
    ]);
  });

  it("lists income between events row by row and folds hidden or unnamed sources into one row with a breakdown", () => {
    const timeline = [
      incomeEntry("2026-11-10", "buy", 6600, 6600, { description: "청휘석 구매", uid: "buy-1" }),
      incomeEntry("2026-11-11", "daily_mission", 20, 6620),
      incomeEntry("2026-11-11", "ap_charge", -30, 6590),
      incomeEntry("2026-11-12", "daily_mission", 20, 6610),
      incomeEntry("2026-11-12", "raid", 1200, 7810, { description: "총력전" }),
      eventEntry("a", "2026-12-01", 500, { ruleSet: "call_charge_v1" }),
      incomeEntry("2027-01-02", "weekly_mission", 120, 620),
    ];
    const rows = buildPlannerTimelineRows(timeline, rowOptions({ markers: numberTargetEvents(timeline) }));
    expect(rows.map((row) => row.kind)).toEqual(["year", "income", "income", "income", "event", "year", "income"]);
    const incomes = rows.flatMap((row) => (row.kind === "income" ? [row.row] : []));
    // The aggregate row sits at its last entry, so the balances read in time order.
    expect(incomes.map((row) => [row.label, row.delta.pyroxene, row.itemUid, row.balance])).toEqual([
      ["청휘석 구매", 6600, "buy-1", 6600],
      ["숨긴 항목 합계", 10, undefined, 6610],
      ["총력전", 1200, undefined, 7810],
      ["숨긴 항목 합계", 120, undefined, 620],
    ]);
    expect(incomes[1].breakdown?.map((item) => [item.label, item.delta.pyroxene])).toEqual([
      ["일일 임무", 40],
      ["AP 충전", -30],
    ]);
  });

  it("hides events without favorites unless selected or completed", () => {
    const timeline = [
      eventEntry("a", "2026-12-01", 0, { planned: false }),
      eventEntry("b", "2026-12-02", 0, { planned: false }),
      eventEntry("c", "2026-12-03", 0, { planned: false }),
    ];
    const rows = buildPlannerTimelineRows(
      timeline,
      rowOptions({ hideUntargeted: true, selectedEventUid: "b", completedEventUids: new Set(["c"]) }),
    );
    expect(rows.flatMap((row) => (row.kind === "event" ? [row.entry.source.event?.uid] : []))).toEqual(["b", "c"]);
  });

  it("shows a received reward with its original amount and marks it received", () => {
    const timeline = [
      incomeEntry("2026-11-10", "raid", 0, 0, { description: "총력전", collectedSourceKey: "raid-key" }),
    ];
    const rows = buildPlannerTimelineRows(
      timeline,
      rowOptions({
        collectedSourceKeys: new Set(["raid-key"]),
        collectedSourceResources: new Map([["raid-key", resources(1000)]]),
      }),
    );
    const row = rows.find((item) => item.kind === "income");
    if (row?.kind !== "income") throw new Error("expected an income row");
    expect([row.row.collected, row.row.delta.pyroxene, row.row.balance]).toEqual([true, 1000, 0]);
  });

  it("recovers the attendance start date from its reward dates", () => {
    const start = new Date("2026-11-01T04:00:00+09:00");
    const items = createOptimisticAttendanceTimelineItems(start, "att");
    expect(getAttendanceStartDate(items.map((item) => new Date(item.eventAt)))?.toISOString()).toBe(
      start.toISOString(),
    );
    expect(getAttendanceStartDate([])).toBeNull();
  });

  it("keeps every target event of the same day on the chart", () => {
    const timeline = [eventEntry("a", "2026-12-01T02:00:00Z", 500), eventEntry("b", "2026-12-01T03:00:00Z", 100)];
    const points = buildBalanceChartPoints(timeline, numberTargetEvents(timeline));
    expect(points).toHaveLength(1);
    expect(points[0].balance).toBe(100);
    expect(points[0].events.map((event) => [event.marker, event.students.map((student) => student.uid)])).toEqual([
      [1, ["s-a"]],
      [2, ["s-b"]],
    ]);
  });
});
