import { describe, expect, it } from "@jest/globals";
import {
  buildPlannerTimelineRows,
  getPyroxeneEventStatus,
  numberTargetEvents,
  type PlannerTimelineRowOptions,
  summarizePyroxeneTimeline,
} from "~/domain/pyroxene-planner-view";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
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
  it("rates a balance short when negative and uncertain when only its low end is", () => {
    expect(getPyroxeneEventStatus(eventEntry("a", "2026-12-01", -1))).toBe("short");
    expect(getPyroxeneEventStatus(eventEntry("a", "2026-12-01", 100, { low: -1 }))).toBe("uncertain");
    expect(getPyroxeneEventStatus(eventEntry("a", "2026-12-01", 100, { low: 0 }))).toBe("enough");
  });

  it("numbers only planned events and summarizes the first shortfall", () => {
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
    const summary = summarizePyroxeneTimeline(timeline, markers);
    expect(summary.targetCount).toBe(2);
    expect(summary.statusCounts).toEqual({ enough: 1, uncertain: 0, short: 1 });
    expect(summary.firstShort?.marker).toBe(2);
  });

  it("groups income between events and folds hidden or unnamed sources into one row", () => {
    const timeline = [
      incomeEntry("2026-11-10", "buy", 6600, 6600, { description: "청휘석 구매", uid: "buy-1" }),
      incomeEntry("2026-11-11", "daily_mission", 20, 6620),
      incomeEntry("2026-11-12", "raid", 1200, 7820, { description: "총력전" }),
      eventEntry("a", "2026-12-01", 500, { ruleSet: "call_charge_v1" }),
      incomeEntry("2027-01-02", "weekly_mission", 120, 620),
    ];
    const rows = buildPlannerTimelineRows(timeline, rowOptions({ markers: numberTargetEvents(timeline) }));
    expect(rows.map((row) => row.kind)).toEqual(["year", "income-group", "rework", "event", "year", "income"]);
    const group = rows[1];
    if (group.kind !== "income-group") throw new Error("expected a group");
    expect(group.rows.map((row) => [row.label, row.delta.pyroxene, row.itemUid])).toEqual([
      ["청휘석 구매", 6600, "buy-1"],
      ["총력전", 1200, undefined],
      ["반복 수급", 20, undefined],
    ]);
    expect(group.delta).toBe(7820);
    expect(group.balance).toBe(7820);
    const single = rows[5];
    if (single.kind !== "income") throw new Error("expected a single row");
    expect(single.row.label).toBe("반복 수급");
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
});
