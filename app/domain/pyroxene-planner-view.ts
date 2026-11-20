import type { Dayjs } from "dayjs";
import type { TimelineSourceType } from "~/domain/pyroxene-planner";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { PYROXENE_SOURCE_DEFINITIONS } from "~/domain/pyroxene-sources";
import type { PickupResources, Timeline, TimelineEntry } from "~/domain/pyroxene-timeline";
import dayjs from "~/lib/dayjs";

export type PyroxeneEventStatus = "enough" | "caution" | "short";

/**
 * Short when the expected balance is negative; caution when it is not but the low end of the range is,
 * so bad luck can run the balance short.
 */
export function getPyroxeneEventStatus(entry: TimelineEntry): PyroxeneEventStatus {
  if (entry.accumulatedResources.pyroxene < 0) return "short";
  const range = getBalanceRange(entry);
  return range && range.low < 0 ? "caution" : "enough";
}

/** The balance range shown next to a balance: the 10th and 90th percentile, low first. */
export function getBalanceRange(entry: TimelineEntry): { low: number; high: number } | null {
  const band = entry.accumulatedResourcesBand;
  if (!band) return null;
  const low = Math.min(band.pessimistic.pyroxene, band.optimistic.pyroxene);
  const high = Math.max(band.pessimistic.pyroxene, band.optimistic.pyroxene);
  return low === high ? null : { low, high };
}

/** An event the plan spends on: it has a pickup plan. */
export function isTargetEventEntry(entry: TimelineEntry): boolean {
  return entry.source.type === "event" && !!entry.source.event && !!entry.pickupPlan;
}

/** Numbers target events in date order, from 1. The chart and the timeline share the numbers. */
export function numberTargetEvents(timeline: Timeline): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const entry of timeline) {
    const uid = entry.source.event?.uid;
    if (uid && isTargetEventEntry(entry) && !numbers.has(uid)) numbers.set(uid, numbers.size + 1);
  }
  return numbers;
}

const SOURCE_LABELS = new Map<string, string>(PYROXENE_SOURCE_DEFINITIONS.map(({ type, label }) => [type, label]));

export function pyroxeneSourceLabel(type: TimelineSourceType): string {
  return SOURCE_LABELS.get(type) ?? type;
}

export type PlannerIncomeRow = {
  key: string;
  date: Dayjs;
  label: string;
  type: TimelineSourceType | "aggregate";
  delta: PickupResources;
  balance: number;
  itemUid?: string;
  collectedSourceKey?: string;
  collectable: boolean;
  collected: boolean;
  // The hidden sources an aggregate row adds up, one per source type in timeline order.
  breakdown?: { type: TimelineSourceType; label: string; delta: PickupResources }[];
};

export type PlannerTimelineRow =
  | { kind: "year"; key: string; year: number }
  | { kind: "event"; key: string; entry: TimelineEntry; marker: number | null }
  | { kind: "income"; key: string; row: PlannerIncomeRow };

export type PlannerTimelineRowOptions = {
  display: readonly TimelineSourceType[];
  hideUntargeted: boolean;
  selectedEventUid: string | null;
  completedEventUids: ReadonlySet<string>;
  collectedSourceKeys: ReadonlySet<string>;
  collectableSourceKeys: ReadonlySet<string>;
  // Rewards a collected source gave, shown instead of its zero delta.
  collectedSourceResources: ReadonlyMap<string, PickupResources>;
  markers: ReadonlyMap<string, number>;
};

const DELETABLE_SOURCE_TYPES = new Set<TimelineSourceType>([
  "buy",
  "package_onetime",
  "package_daily",
  "package_ap",
  "attendance",
  "other",
]);

function addResources(left: PickupResources, right: PickupResources): PickupResources {
  return {
    pyroxene: left.pyroxene + right.pyroxene,
    oneTimeTicket: left.oneTimeTicket + right.oneTimeTicket,
    tenTimeTicket: left.tenTimeTicket + right.tenTimeTicket,
  };
}

function hasChange(delta: PickupResources): boolean {
  return delta.pyroxene !== 0 || delta.oneTimeTicket !== 0 || delta.tenTimeTicket !== 0;
}

function isEventShown(entry: TimelineEntry, options: PlannerTimelineRowOptions): boolean {
  const event = entry.source.event;
  if (!event || !options.hideUntargeted) return true;
  if (event.uid === options.selectedEventUid || options.completedEventUids.has(event.uid)) return true;
  return event.recruitments.some(({ favorited, pickup, student }) => pickup && student && favorited);
}

/**
 * Builds the rows of the schedule. Between two events, sources the display filter shows and that carry a description
 * or a deletable record get their own row. The rest join one aggregate row with a per-source breakdown, so hidden
 * sources still count and their amounts can be looked up.
 */
export function buildPlannerTimelineRows(timeline: Timeline, options: PlannerTimelineRowOptions): PlannerTimelineRow[] {
  const rows: PlannerTimelineRow[] = [];
  const display = new Set(options.display);
  let year: number | null = null;
  let pending: TimelineEntry[] = [];

  const pushYear = (date: Dayjs) => {
    if (date.year() === year) return;
    year = date.year();
    rows.push({ kind: "year", key: `year-${year}`, year });
  };

  const flushIncome = () => {
    if (pending.length === 0) return;
    const entries = pending;
    pending = [];
    // Each row keeps the timeline position its balance belongs to, so balances read in time order.
    const positioned: { row: PlannerIncomeRow; position: number }[] = [];
    let aggregate: {
      first: TimelineEntry;
      last: TimelineEntry;
      lastIndex: number;
      delta: PickupResources;
      byType: Map<TimelineSourceType, PickupResources>;
    } | null = null;
    entries.forEach((entry, index) => {
      const { source } = entry;
      const itemUid = source.uid && DELETABLE_SOURCE_TYPES.has(source.type) ? source.uid : undefined;
      const ownRow = display.has(source.type) && (!!source.description || !!itemUid);
      if (!ownRow) {
        const byType = aggregate?.byType ?? new Map<TimelineSourceType, PickupResources>();
        const typeDelta = byType.get(source.type);
        byType.set(source.type, typeDelta ? addResources(typeDelta, entry.resourceDelta) : entry.resourceDelta);
        aggregate = aggregate
          ? { ...aggregate, last: entry, lastIndex: index, delta: addResources(aggregate.delta, entry.resourceDelta) }
          : { first: entry, last: entry, lastIndex: index, delta: entry.resourceDelta, byType };
        return;
      }
      const collectedSourceKey =
        source.collectedSourceKey && !source.uid?.endsWith("::ten-time-ticket-expiry")
          ? source.collectedSourceKey
          : undefined;
      const collected = collectedSourceKey ? options.collectedSourceKeys.has(collectedSourceKey) : false;
      positioned.push({
        position: index,
        row: {
          key: `${source.uid ?? source.description ?? source.type}-${entry.date.valueOf()}-${index}`,
          date: entry.date,
          label: source.description || pyroxeneSourceLabel(source.type),
          type: source.type,
          delta:
            collected && collectedSourceKey
              ? (options.collectedSourceResources.get(collectedSourceKey) ?? entry.resourceDelta)
              : entry.resourceDelta,
          balance: entry.accumulatedResources.pyroxene,
          itemUid,
          collectedSourceKey,
          collectable: collectedSourceKey ? options.collectableSourceKeys.has(collectedSourceKey) : false,
          collected,
        },
      });
    });
    const repeated = aggregate as {
      first: TimelineEntry;
      last: TimelineEntry;
      lastIndex: number;
      delta: PickupResources;
      byType: Map<TimelineSourceType, PickupResources>;
    } | null;
    if (repeated && hasChange(repeated.delta)) {
      positioned.push({
        // The aggregate sits where its last entry is: its balance is the balance at that moment.
        position: repeated.lastIndex,
        row: {
          key: `aggregate-${repeated.first.date.valueOf()}`,
          date: repeated.last.date,
          label: "숨긴 항목 합계",
          type: "aggregate",
          delta: repeated.delta,
          balance: repeated.last.accumulatedResources.pyroxene,
          collectable: false,
          collected: false,
          breakdown: [...repeated.byType]
            .filter(([, delta]) => hasChange(delta))
            .map(([type, delta]) => ({ type, label: pyroxeneSourceLabel(type), delta })),
        },
      });
    }
    for (const { row } of positioned.sort((a, b) => a.position - b.position)) {
      pushYear(row.date);
      rows.push({ kind: "income", key: `income-${row.key}`, row });
    }
  };

  for (const entry of timeline) {
    const event = entry.source.type === "event" ? entry.source.event : undefined;
    if (!event) {
      pending.push(entry);
      continue;
    }
    if (!isEventShown(entry, options)) continue;
    flushIncome();
    pushYear(entry.date);
    rows.push({ kind: "event", key: `event-${event.uid}`, entry, marker: options.markers.get(event.uid) ?? null });
  }
  flushIncome();
  return rows;
}

export type ActivePyroxenePackage = {
  uid: string;
  source: "package_onetime" | "package_ap";
  date: Date;
  // The package name without the first-purchase suffix the stored description carries.
  name: string;
  activeDays: number;
};

const FIRST_PURCHASE_SUFFIX = " (초회)";

const ACTIVE_PACKAGE_SOURCE_TYPES = new Set<TimelineSourceType>(["package_onetime", "package_ap"]);

/** Packages whose effect is running now: bought within 30 days (AP packages: 14), counting automatic repurchases. */
export function getActivePyroxenePackages(scheduleItems: PyroxeneScheduleItem[], now: Date): ActivePyroxenePackage[] {
  const current = dayjs(now);
  return scheduleItems
    .flatMap((item) => {
      const onetime =
        item.onetimeGain && ACTIVE_PACKAGE_SOURCE_TYPES.has(item.onetimeGain.source) ? item.onetimeGain : null;
      const repeated =
        item.repeatedGain && ACTIVE_PACKAGE_SOURCE_TYPES.has(item.repeatedGain.source) ? item.repeatedGain : null;
      const gain = onetime ?? repeated;
      if (!gain?.uid) return [];
      const interval = repeated?.uid === gain.uid ? repeated.repeatIntervalDays : undefined;
      let start = dayjs(gain.date);
      if (gain.autoRepurchase && interval && interval > 0 && !start.isAfter(current)) {
        start = start.add(Math.floor(Math.max(0, current.diff(start, "day")) / interval) * interval, "day");
      }
      const activeDays = gain.source === "package_ap" ? 14 : 30;
      if (!start.isAfter(current.subtract(activeDays, "day")) || !start.isBefore(current)) return [];
      return [
        {
          uid: gain.uid,
          date: start.toDate(),
          source: gain.source as ActivePyroxenePackage["source"],
          name: gain.description.endsWith(FIRST_PURCHASE_SUFFIX)
            ? gain.description.slice(0, -FIRST_PURCHASE_SUFFIX.length)
            : gain.description,
          activeDays,
        },
      ];
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name, "ko"));
}
