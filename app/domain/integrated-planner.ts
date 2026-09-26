import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { PYROXENE_SOURCE_DEFINITIONS } from "~/domain/pyroxene-sources";
import type { PickupResources, Timeline } from "~/domain/pyroxene-timeline";
import type { RunType } from "~/domain/timeline-content";
import {
  formatInstant,
  formatInstantDateKey,
  getInstantTime,
  type LocalDateString,
  normalizeTimeZone,
} from "~/lib/date-time";
import dayjs from "~/lib/dayjs";
import type { RaidType } from "~/models/content.d";

export type PlannerResourceKey = keyof PickupResources;

export type PlannerResourceChange = {
  key: PlannerResourceKey;
  quantity: number;
};

export type PlannerTimelineSource = {
  key: string;
  type: string;
  label: string | null;
  at?: string;
  eventUid?: string;
  raidUid?: string;
  changes: PlannerResourceChange[];
};

export type PlannerDayResources = {
  dateKey: LocalDateString;
  changes: PlannerResourceChange[];
  sources: PlannerTimelineSource[];
};

export type PlannerPeriod = {
  key: string;
  kind: "event" | "recruitment" | "shop" | "raid";
  name: string;
  startDate: LocalDateString;
  endDate: LocalDateString;
  href?: string;
  startAt?: string | null;
  imageUrl?: string | null;
  endAt?: string | null;
  runType?: RunType;
  endless?: boolean;
  calendarStartOnly?: boolean;
  eventUid?: string;
  raidUid?: string;
  raidType?: RaidType;
  seasonIndex?: number | null;
  students?: PlannerPeriodStudent[];
  /**
   * Full recruitment roster (every recruitable student, not narrowed to saved favorites).
   * Only set on merged/display recruitment periods; used to build the recruitment editor's
   * candidate list so registering a favorite never hides the event's other students. The
   * card/strip-facing `students` field keeps its existing favorites-only-when-planned meaning.
   */
  allRecruitmentStudents?: PlannerPeriodStudent[];
  expectedTrials?: number;
  isPlanned?: boolean;
  hasRecruitmentPlan?: boolean;
};

export type PlannerPeriodGroup = {
  key: string;
  eventUid?: string;
  name: string;
  periods: PlannerPeriod[];
};

export type PlannerEventScheduleGroup = {
  group: PlannerPeriodGroup;
  isPlanned: boolean;
  recruitmentPeriods: PlannerPeriod[];
};

export type PlannerScheduleFactKind =
  | "event-start"
  | "event-end"
  | "recruitment-start"
  | "recruitment-end"
  | "shop-deadline"
  | "raid-start"
  | "raid-end"
  | "raid-reward"
  | "raid-ticket-expiry";

export type PlannerScheduleFact = {
  kind: PlannerScheduleFactKind;
  at: string;
};

export type PlannerDateScheduleItem = {
  key: string;
  period: PlannerPeriod;
  eventPeriod?: PlannerPeriod;
  shopPeriod?: PlannerPeriod;
  ongoingRecruitmentPeriods?: PlannerPeriod[];
  recruitmentPeriods?: PlannerPeriod[];
  facts: PlannerScheduleFact[];
};

export type PlannerDateSchedule = {
  onDate: PlannerDateScheduleItem[];
  ongoing: PlannerDateScheduleItem[];
  items: PlannerDateScheduleItem[];
};

export type PlannerRaidScheduleFact = {
  raidUid: string;
  kind: "raid-reward" | "raid-ticket-expiry";
  at: string;
};

export function groupPlannerPeriods(periods: readonly PlannerPeriod[]): PlannerPeriodGroup[] {
  const groups = new Map<string, PlannerPeriodGroup>();
  for (const period of periods) {
    const key = period.eventUid ? `event:${period.eventUid}` : `period:${period.key}`;
    const group = groups.get(key) ?? {
      key,
      ...(period.eventUid ? { eventUid: period.eventUid } : {}),
      name: period.name,
      periods: [],
    };
    group.periods.push(period);
    if (period.kind === "event") group.name = period.name;
    groups.set(key, group);
  }

  return [...groups.values()].sort((left, right) => {
    const leftStartDate = left.periods.reduce(
      (startDate, period) => (period.startDate < startDate ? period.startDate : startDate),
      left.periods[0].startDate,
    );
    const rightStartDate = right.periods.reduce(
      (startDate, period) => (period.startDate < startDate ? period.startDate : startDate),
      right.periods[0].startDate,
    );
    return (
      leftStartDate.localeCompare(rightStartDate) ||
      left.name.localeCompare(right.name) ||
      left.key.localeCompare(right.key)
    );
  });
}

export function getPlannerEventScheduleGroupsForDate(
  periods: readonly PlannerPeriod[],
  dateKey: LocalDateString,
  todayDateKey?: LocalDateString,
): PlannerEventScheduleGroup[] {
  const groups = groupPlannerPeriods(getPlannerPeriodsForDate(periods, dateKey, todayDateKey));
  return groups.map((group) => ({
    group,
    isPlanned: group.periods.some((period) => period.isPlanned),
    recruitmentPeriods: group.periods.filter((period) => period.kind === "recruitment"),
  }));
}

export function getPlannerPeriodsForDate(
  periods: readonly PlannerPeriod[],
  dateKey: LocalDateString,
  _todayDateKey?: LocalDateString,
): PlannerPeriod[] {
  return periods.filter((period) => {
    if (period.kind === "shop") return false;
    if (period.kind === "event" && period.endAt == null) {
      return period.startDate === dateKey;
    }
    return period.startDate <= dateKey && period.endDate >= dateKey;
  });
}

export type PlannerPeriodStudent = {
  uid: string;
  imageUid: string | null;
  name: string;
};

export type PlannerRecruitmentCandidatePeriod = {
  eventUid: string;
  eventName: string;
  startDate: LocalDateString;
  endDate: LocalDateString;
  startAt: string | null;
  endAt: string | null;
  imageUrl: string | null;
  runType?: RunType;
  students: PlannerPeriodStudent[];
};

export type PlannerScheduleContentInput = {
  kind: "event" | "raid";
  uid: string;
  name: string;
  imageUrl?: string | null;
  since: string;
  until: string;
  actualEndAt?: string | null;
  endless?: boolean;
  runType?: RunType;
  tags?: readonly string[];
  recruitmentGroupUid?: string | null;
  recruitments?: {
    until: string | null;
    student: PlannerPeriodStudent | null;
    sourceContentUid?: string;
  }[];
};

export type PlannerFavoriteInput = { contentUid: string; studentUid: string };
export type PlannerEventTrialInput = { eventUid: string; expectedTrials: number | null };

export type PlannerShopPeriodInput = {
  timelineUid: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
  planned: boolean;
};

/**
 * 2026-09-26 decision A5: event-level "내 계획" no longer counts non-default shop input.
 * Planned = has target students (favorites) or a saved recruitment count (expectedTrials
 * non-null) only. Shop plan data itself is unaffected and still drives the shop calculator,
 * forecast, and S7 amounts via its own `planned` (non-default state) gate elsewhere.
 */
export function getPlannerPlannedEventUids({
  favorites,
  eventTrials,
}: {
  favorites: readonly PlannerFavoriteInput[];
  eventTrials: readonly PlannerEventTrialInput[];
}): Set<string> {
  return new Set([
    ...favorites.map(({ contentUid }) => contentUid),
    ...eventTrials.filter(({ expectedTrials }) => expectedTrials !== null).map(({ eventUid }) => eventUid),
  ]);
}

function hasPlannerRecruitmentPlan(period: PlannerPeriod | undefined): boolean {
  return Boolean(
    period?.kind === "recruitment" &&
      ((period.students?.length ?? 0) > 0 || (period.expectedTrials !== undefined && period.expectedTrials !== null)),
  );
}

export type PlannerCalendarDay = {
  dateKey: LocalDateString;
  inMonth: boolean;
};

export type PlannerPeriodTimingStatus = "exact" | "date-only" | "invalid";

export type PlannerCalendarStrip = {
  key: string;
  kind: "event" | "recruitment" | "combined" | "raid";
  period: PlannerPeriod;
  recruitmentPeriods: PlannerPeriod[];
  track: number;
  leftPercent: number;
  widthPercent: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  timingStatus: PlannerPeriodTimingStatus;
};

export type PlannerCalendarStartMarker = {
  key: string;
  period: PlannerPeriod;
  track: number;
  leftPercent: number;
  widthPercent: number;
};

export type PlannerWeekLayout = {
  eventStrips: PlannerCalendarStrip[];
  eventStartMarkers: PlannerCalendarStartMarker[];
  recruitmentStrips: PlannerCalendarStrip[];
  laneCount: number;
  raidStrips: PlannerCalendarStrip[];
  raidLaneCount: number;
};

export type PlannerMonthLayout = {
  monthKey: string;
  weeks: PlannerCalendarDay[][];
  weekLayouts: PlannerWeekLayout[];
};

const RESOURCE_KEYS: readonly PlannerResourceKey[] = ["pyroxene", "oneTimeTicket", "tenTimeTicket"];
export const CALENDAR_FORECAST_SOURCE_TYPES = ["event_reward", "raid", "buy", "other", "event"] as const;
const CALENDAR_FORECAST_SOURCE_TYPE_SET: ReadonlySet<string> = new Set(CALENDAR_FORECAST_SOURCE_TYPES);

export type PlannerDayResourceBreakdown = {
  calendarSources: PlannerTimelineSource[];
  otherSources: PlannerTimelineSource[];
  otherChanges: PlannerResourceChange[];
};

export type PlannerDateResourceAttribution = {
  eventChanges: Record<string, PlannerResourceChange[]>;
  raidChanges: Record<string, PlannerResourceChange[]>;
  directSources: PlannerTimelineSource[];
  unmatchedEventSources: PlannerTimelineSource[];
  unmatchedEventRewardSources: PlannerTimelineSource[];
  unmatchedRaidSources: PlannerTimelineSource[];
};

function sumSourceChanges(sources: readonly PlannerTimelineSource[]): PlannerResourceChange[] {
  const changes: PlannerResourceChange[] = [];
  for (const source of sources) {
    for (const change of source.changes) {
      const aggregate = changes.find(({ key }) => key === change.key);
      if (aggregate) aggregate.quantity += change.quantity;
      else changes.push({ ...change });
    }
  }
  return changes.sort((left, right) => RESOURCE_KEYS.indexOf(left.key) - RESOURCE_KEYS.indexOf(right.key));
}

export function partitionPlannerDayResources(day: PlannerDayResources): PlannerDayResourceBreakdown {
  const calendarSources = day.sources.filter((source) => CALENDAR_FORECAST_SOURCE_TYPE_SET.has(source.type));
  const otherSources = day.sources.filter(
    (source) => !CALENDAR_FORECAST_SOURCE_TYPE_SET.has(source.type) && source.changes.length > 0,
  );
  return {
    calendarSources,
    otherSources,
    otherChanges: sumSourceChanges(otherSources),
  };
}

export function attributePlannerDateResources(
  day: PlannerDayResources | undefined,
  periods: readonly PlannerPeriod[],
  dateItems: readonly PlannerDateScheduleItem[],
): PlannerDateResourceAttribution {
  const eventUids = new Set(
    periods.flatMap((period) => (period.kind === "event" && period.eventUid ? [period.eventUid] : [])),
  );
  const raidUids = new Set(
    periods.flatMap((period) => (period.kind === "raid" && period.raidUid ? [period.raidUid] : [])),
  );
  const visibleEventUids = new Set(
    dateItems.flatMap((item) => (item.period.kind === "event" && item.period.eventUid ? [item.period.eventUid] : [])),
  );
  const visibleRaidUids = new Set(
    dateItems.flatMap((item) => (item.period.kind === "raid" && item.period.raidUid ? [item.period.raidUid] : [])),
  );
  const eventSources = new Map<string, PlannerTimelineSource[]>();
  const raidSources = new Map<string, PlannerTimelineSource[]>();
  const directSources: PlannerTimelineSource[] = [];
  const unmatchedEventSources: PlannerTimelineSource[] = [];
  const unmatchedEventRewardSources: PlannerTimelineSource[] = [];
  const unmatchedRaidSources: PlannerTimelineSource[] = [];

  for (const source of day?.sources ?? []) {
    if (source.type === "event_reward" || source.type === "event") {
      const eventUid = source.eventUid;
      if (!eventUid || !eventUids.has(eventUid) || !visibleEventUids.has(eventUid)) {
        if (source.type === "event_reward") unmatchedEventRewardSources.push(source);
        else unmatchedEventSources.push(source);
        continue;
      }
      const sources = eventSources.get(eventUid) ?? [];
      sources.push(source);
      eventSources.set(eventUid, sources);
      continue;
    }
    if (source.type === "raid") {
      const raidUid = source.raidUid;
      if (!raidUid || !raidUids.has(raidUid) || !visibleRaidUids.has(raidUid)) {
        unmatchedRaidSources.push(source);
        continue;
      }
      const sources = raidSources.get(raidUid) ?? [];
      sources.push(source);
      raidSources.set(raidUid, sources);
      continue;
    }
    if (source.type === "buy" || source.type === "other") directSources.push(source);
  }

  const changesByIdentity = (sourcesByIdentity: ReadonlyMap<string, readonly PlannerTimelineSource[]>) =>
    Object.fromEntries(
      [...sourcesByIdentity].map(([identity, sources]) => [
        identity,
        sumSourceChanges(sources).filter(({ quantity }) => quantity !== 0),
      ]),
    );

  return {
    eventChanges: changesByIdentity(eventSources),
    raidChanges: changesByIdentity(raidSources),
    directSources,
    unmatchedEventSources,
    unmatchedEventRewardSources,
    unmatchedRaidSources,
  };
}

export function getPlannerReadOnlyBuySources(
  directSources: readonly PlannerTimelineSource[],
  editableSourceKeys: ReadonlySet<string>,
): PlannerTimelineSource[] {
  return directSources.filter((source) => source.type === "buy" && !editableSourceKeys.has(source.key));
}

export function getPlannerUnmatchedEventRewardLabel(source: PlannerTimelineSource): string | null {
  if (!source.label) return null;
  return source.eventUid?.startsWith("main-story-reward:") ? `메인 스토리 보상 · ${source.label}` : source.label;
}

function toInstantKey(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isNavigablePlannerEvent(
  content: PlannerScheduleContentInput,
): content is PlannerScheduleContentInput & { kind: "event" } {
  return content.kind === "event" && !content.uid.startsWith("group:") && !content.tags?.includes("main_story_reward");
}

function getPlannerActualEventEndAt(content: PlannerScheduleContentInput): string | null {
  if (content.actualEndAt !== undefined) return content.actualEndAt;
  return content.endless === true ? null : content.until;
}

function buildPlannerRaidPeriods(scheduleItems: readonly PyroxeneScheduleItem[], timeZone: string): PlannerPeriod[] {
  return scheduleItems.flatMap((item) => {
    const raid = item.raid;
    if (!raid || (raid.type !== "total_assault" && raid.type !== "elimination")) return [];
    const startAt = toInstantKey(raid.since);
    const endAt = toInstantKey(raid.until);
    return [
      {
        key: `raid:${raid.uid}`,
        kind: "raid" as const,
        name: raid.name,
        startDate: formatPlannerPeriodDate(startAt, timeZone),
        endDate: formatPlannerPeriodEndDate(endAt, timeZone),
        ...(raid.seasonIndex == null ? {} : { href: `/raids/${raid.type}/${raid.seasonIndex}` }),
        startAt,
        endAt,
        imageUrl: raid.imageUrl ?? null,
        raidUid: raid.uid,
        raidType: raid.type,
        seasonIndex: raid.seasonIndex ?? null,
        isPlanned: false,
      },
    ];
  });
}

export function buildPlannerMonthDays(monthKey: string): PlannerCalendarDay[][] {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error("월을 확인할 수 없어요");

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) throw new Error("월을 확인할 수 없어요");

  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const firstCell = 1 - firstWeekday;
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, firstCell + index));
    const dateKey = date.toISOString().slice(0, 10) as LocalDateString;
    return { dateKey, inMonth: dateKey.startsWith(monthKey) };
  });

  const weeks: PlannerCalendarDay[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

export function shiftPlannerMonth(monthKey: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match || !Number.isInteger(offset)) throw new Error("월을 확인할 수 없어요");
  const serialMonth = Number(match[1]) * 12 + Number(match[2]) - 1 + offset;
  const year = Math.floor(serialMonth / 12);
  const month = (((serialMonth % 12) + 12) % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function formatPlannerPeriodDate(instant: string | Date, timeZone: string): LocalDateString {
  return formatInstantDateKey(instant, timeZone) as LocalDateString;
}

export function formatPlannerPeriodEndDate(instant: string | Date, timeZone: string): LocalDateString {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const end = dayjs(instant).tz(normalizedTimeZone);
  if (!end.isValid()) throw new Error("기간을 확인할 수 없어요");
  if (end.hour() === 0 && end.minute() === 0 && end.second() === 0 && end.millisecond() === 0) {
    return formatInstantDateKey(end.subtract(1, "millisecond").toDate(), normalizedTimeZone) as LocalDateString;
  }
  return formatInstantDateKey(end.toDate(), normalizedTimeZone) as LocalDateString;
}

/**
 * Single shared "M/D HH:mm" point formatter (no zero-padding on month/day). Used for the
 * planner period range, raid reward/ticket-expiry lines, and accessible names alike.
 */
export function formatPlannerPeriodPoint(at: string, timeZone: string): string {
  return formatInstant(at, { timeZone, format: "M/D HH:mm" });
}

export type PlannerPeriodRangeParts = {
  start: string;
  /** null means an endless (open-ended) range: "M/D HH:mm ~". */
  end: string | null;
};

/** Builds the shared "M/D HH:mm ~ M/D HH:mm" (or "M/D HH:mm ~" when endless) range parts. */
export function formatPlannerPeriodRangeParts(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  timeZone: string,
): PlannerPeriodRangeParts | null {
  if (!startAt) return null;
  return {
    start: formatPlannerPeriodPoint(startAt, timeZone),
    end: endAt ? formatPlannerPeriodPoint(endAt, timeZone) : null,
  };
}

/** Plain-text label for the range parts, for accessible names / titles. */
export function plannerPeriodRangeLabel(parts: PlannerPeriodRangeParts): string {
  return parts.end ? `${parts.start} ~ ${parts.end}` : `${parts.start} ~`;
}

export type PlannerPeriodBoldEndpoint = "start" | "end" | null;

/**
 * Determines which endpoint of a range (if any) should be bolded, from the facts already
 * computed for the selected date. Matches by fact kind, and — when `at` values are given —
 * also by exact instant, so a shared facts array (e.g. an event card that also carries its
 * nested recruitment periods' facts) can be used to resolve the bold endpoint for one
 * specific period among several.
 */
export function plannerPeriodBoldEndpoint(
  facts: readonly PlannerScheduleFact[],
  startKind: PlannerScheduleFactKind | null,
  endKind: PlannerScheduleFactKind,
  at?: { startAt?: string | null; endAt?: string | null },
): PlannerPeriodBoldEndpoint {
  const matches = (kind: PlannerScheduleFactKind, factAt?: string | null) =>
    facts.some((fact) => fact.kind === kind && (factAt == null || fact.at === factAt));
  // Some kinds (e.g. a shop period's deadline) have no matching "start" fact kind; a null
  // startKind means that endpoint can never be bolded, without inventing a fact kind for it.
  if (startKind !== null && matches(startKind, at?.startAt)) return "start";
  if (matches(endKind, at?.endAt)) return "end";
  return null;
}

/** Whether two periods share exactly the same start/end instant (used to collapse a recruitment's own period line when it matches its event's). */
export function plannerPeriodsShareRange(
  a: Pick<PlannerPeriod, "startAt" | "endAt">,
  b: Pick<PlannerPeriod, "startAt" | "endAt">,
): boolean {
  if (!a.startAt || !b.startAt || getInstantTime(a.startAt) !== getInstantTime(b.startAt)) return false;
  if (!a.endAt && !b.endAt) return true;
  if (!a.endAt || !b.endAt) return false;
  return getInstantTime(a.endAt) === getInstantTime(b.endAt);
}

export function summarizePyroxeneTimeline(timeline: Timeline, timeZone: string): Record<string, PlannerDayResources> {
  const byDate: Record<string, PlannerDayResources> = {};

  for (const [index, entry] of timeline.entries()) {
    const dateKey = formatInstantDateKey(entry.date.toDate(), timeZone) as LocalDateString;
    let day = byDate[dateKey];
    if (!day) {
      day = { dateKey, changes: [], sources: [] };
      byDate[dateKey] = day;
    }
    const sourceChanges: PlannerResourceChange[] = [];

    for (const key of RESOURCE_KEYS) {
      const quantity = entry.resourceDelta[key] ?? 0;
      if (quantity === 0) continue;
      sourceChanges.push({ key, quantity });
      const aggregate = day.changes.find((change) => change.key === key);
      if (aggregate) aggregate.quantity += quantity;
      else day.changes.push({ key, quantity });
    }

    const label =
      entry.source.type === "event"
        ? "모집 소비"
        : entry.source.description?.trim() ||
          entry.source.event?.name ||
          PYROXENE_SOURCE_DEFINITIONS.find((source) => source.type === entry.source.type)?.label ||
          null;
    day.sources.push({
      key: entry.source.uid ?? `${entry.source.type}:${dateKey}:${index}`,
      type: entry.source.type,
      label,
      at: entry.date.toDate().toISOString(),
      ...(entry.source.event?.uid
        ? { eventUid: entry.source.event.uid }
        : entry.source.type === "event_reward" && entry.source.uid
          ? { eventUid: entry.source.uid }
          : {}),
      ...(entry.source.type === "raid" && entry.source.uid
        ? { raidUid: entry.source.uid.replace(/::ten-time-ticket-expiry$/, "") }
        : {}),
      changes: sourceChanges,
    });
  }

  for (const day of Object.values(byDate)) {
    day.changes.sort((left, right) => RESOURCE_KEYS.indexOf(left.key) - RESOURCE_KEYS.indexOf(right.key));
  }
  return byDate;
}

export function projectPlannerCalendarResources(
  resources: Record<string, PlannerDayResources>,
): Record<string, PlannerDayResources> {
  return Object.fromEntries(
    Object.entries(resources).map(([dateKey, day]) => {
      const { calendarSources } = partitionPlannerDayResources(day);
      const changes = sumSourceChanges(calendarSources);
      return [dateKey, { dateKey: day.dateKey, changes, sources: calendarSources }];
    }),
  );
}

type PlannerExactInterval = {
  startMs: number;
  endMs: number;
};

type PlannerWeekTemporalContext = {
  weekStartMs: number;
  weekEndMs: number;
  dayStartsMs: number[];
  timeZone: string;
  week: readonly PlannerCalendarDay[];
};

type PlannerWeekInterval = {
  timingStatus: PlannerPeriodTimingStatus;
  occupancyStartMs: number;
  occupancyEndMs: number;
  leftPercent: number;
  widthPercent: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

type PlannerCalendarStripDraft = Omit<PlannerCalendarStrip, "track"> & {
  occupancyStartMs: number;
  occupancyEndMs: number;
};

function nextPlannerDate(dateKey: string): LocalDateString {
  return dayjs.utc(`${dateKey}T00:00:00Z`).add(1, "day").format("YYYY-MM-DD") as LocalDateString;
}

function createPlannerWeekTemporalContext(
  week: readonly PlannerCalendarDay[],
  timeZone: string,
): PlannerWeekTemporalContext {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const dayStartsMs = [
    ...week.map(({ dateKey }) => dayjs.tz(`${dateKey}T00:00:00`, normalizedTimeZone).valueOf()),
    dayjs.tz(`${nextPlannerDate(week[week.length - 1].dateKey)}T00:00:00`, normalizedTimeZone).valueOf(),
  ];
  return {
    weekStartMs: dayStartsMs[0],
    weekEndMs: dayStartsMs[dayStartsMs.length - 1],
    dayStartsMs,
    timeZone: normalizedTimeZone,
    week,
  };
}

function getPlannerExactInterval(period: PlannerPeriod): PlannerExactInterval | null {
  if (!period.startAt || !period.endAt) return null;
  const startMs = getInstantTime(period.startAt);
  const endMs = getInstantTime(period.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startMs, endMs };
}

function hasInvalidPlannerInterval(period: PlannerPeriod): boolean {
  if (!period.startAt || !period.endAt) return false;
  const startMs = getInstantTime(period.startAt);
  const endMs = getInstantTime(period.endAt);
  return !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs;
}

function plannerInstantPosition(instantMs: number, dayStartsMs: readonly number[]): number {
  if (instantMs <= dayStartsMs[0]) return 0;
  if (instantMs >= dayStartsMs[dayStartsMs.length - 1]) return 1;

  const dayIndex = dayStartsMs.findIndex((dayStartMs, index) => {
    const nextDayStartMs = dayStartsMs[index + 1];
    return nextDayStartMs !== undefined && instantMs < nextDayStartMs && instantMs >= dayStartMs;
  });
  if (dayIndex < 0) return 0;

  const dayStartMs = dayStartsMs[dayIndex];
  const dayEndMs = dayStartsMs[dayIndex + 1];
  const dayFraction = (instantMs - dayStartMs) / (dayEndMs - dayStartMs);
  return (dayIndex + dayFraction) / (dayStartsMs.length - 1);
}

function buildDateOnlyPlannerInterval(
  period: PlannerPeriod,
  context: PlannerWeekTemporalContext,
  timingStatus: "date-only" | "invalid",
): PlannerWeekInterval | null {
  const { week, weekStartMs, weekEndMs } = context;
  const startsBeforeWeek = period.startDate < week[0].dateKey;
  const endsAfterWeek = period.endDate > week[week.length - 1].dateKey;
  const hasCivilOverlap = period.startDate <= week[week.length - 1].dateKey && period.endDate >= week[0].dateKey;
  if (!hasCivilOverlap) return null;

  const startDate = startsBeforeWeek ? week[0].dateKey : period.startDate;
  const endDate = endsAfterWeek ? week[week.length - 1].dateKey : period.endDate;
  const startColumn = Math.max(
    0,
    week.findIndex(({ dateKey }) => dateKey === startDate),
  );
  const endColumn = Math.max(
    startColumn,
    week.findIndex(({ dateKey }) => dateKey === endDate),
  );
  const occupancyStartMs = Math.max(weekStartMs, dayjs.tz(`${period.startDate}T00:00:00`, context.timeZone).valueOf());
  const occupancyEndMs = Math.min(
    weekEndMs,
    dayjs.tz(`${nextPlannerDate(period.endDate)}T00:00:00`, context.timeZone).valueOf(),
  );
  const normalizedOccupancyStartMs = Math.min(occupancyStartMs, occupancyEndMs);
  const normalizedOccupancyEndMs = Math.max(occupancyStartMs, occupancyEndMs);
  const safeOccupancyEndMs =
    normalizedOccupancyEndMs > normalizedOccupancyStartMs
      ? normalizedOccupancyEndMs
      : Math.min(weekEndMs, normalizedOccupancyStartMs + (context.dayStartsMs[1] - context.dayStartsMs[0]));

  return {
    timingStatus,
    occupancyStartMs: normalizedOccupancyStartMs,
    occupancyEndMs: safeOccupancyEndMs,
    leftPercent: (startColumn / week.length) * 100,
    widthPercent: ((endColumn + 1 - startColumn) / week.length) * 100,
    continuesBefore: startsBeforeWeek,
    continuesAfter: endsAfterWeek,
  };
}

function buildPlannerWeekInterval(
  period: PlannerPeriod,
  context: PlannerWeekTemporalContext,
): PlannerWeekInterval | null {
  const exactInterval = getPlannerExactInterval(period);
  if (!exactInterval) {
    return buildDateOnlyPlannerInterval(period, context, hasInvalidPlannerInterval(period) ? "invalid" : "date-only");
  }

  if (exactInterval.startMs >= context.weekEndMs || exactInterval.endMs <= context.weekStartMs) return null;
  const clippedStartMs = Math.max(exactInterval.startMs, context.weekStartMs);
  const clippedEndMs = Math.min(exactInterval.endMs, context.weekEndMs);
  const leftPercent = plannerInstantPosition(clippedStartMs, context.dayStartsMs) * 100;
  const rightPercent = plannerInstantPosition(clippedEndMs, context.dayStartsMs) * 100;

  return {
    timingStatus: "exact",
    occupancyStartMs: clippedStartMs,
    occupancyEndMs: clippedEndMs,
    leftPercent,
    widthPercent: Math.max(0, rightPercent - leftPercent),
    continuesBefore: exactInterval.startMs < context.weekStartMs,
    continuesAfter: exactInterval.endMs > context.weekEndMs,
  };
}

function hasSamePlannerExactInterval(left: PlannerPeriod, right: PlannerPeriod): boolean {
  const leftInterval = getPlannerExactInterval(left);
  const rightInterval = getPlannerExactInterval(right);
  return (
    leftInterval !== null &&
    rightInterval !== null &&
    leftInterval.startMs === rightInterval.startMs &&
    leftInterval.endMs === rightInterval.endMs
  );
}

function hasSamePlannerBoundary(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return !left && !right;
  const leftMs = getInstantTime(left);
  const rightMs = getInstantTime(right);
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) return leftMs === rightMs;
  return left === right;
}

function hasSamePlannerPeriod(left: PlannerPeriod, right: PlannerPeriod): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "raid" || right.kind === "raid") {
    if (!left.raidUid || left.raidUid !== right.raidUid) return false;
  } else if (!left.eventUid || left.eventUid !== right.eventUid) {
    return false;
  }
  if (left.startAt || left.endAt || right.startAt || right.endAt) {
    return hasSamePlannerBoundary(left.startAt, right.startAt) && hasSamePlannerBoundary(left.endAt, right.endAt);
  }
  return left.startDate === right.startDate && left.endDate === right.endDate;
}

function mergeDuplicatePlannerPeriods(existing: PlannerPeriod, incoming: PlannerPeriod): PlannerPeriod {
  const preferred = incoming.isPlanned === true && existing.isPlanned !== true ? incoming : existing;
  const plannedRecruitmentPeriods = [existing, incoming].filter((period) => period.hasRecruitmentPlan === true);
  const studentSources = plannedRecruitmentPeriods.length > 0 ? plannedRecruitmentPeriods : [preferred];
  const students = studentSources
    .flatMap((period) => period.students ?? [])
    .filter((student, index, list) => list.findIndex((candidate) => candidate.uid === student.uid) === index);
  const allRecruitmentStudents = unionPlannerStudents(existing.allRecruitmentStudents, incoming.allRecruitmentStudents);

  return {
    ...existing,
    ...preferred,
    ...(existing.isPlanned === true || incoming.isPlanned === true ? { isPlanned: true } : {}),
    ...(existing.hasRecruitmentPlan === true || incoming.hasRecruitmentPlan === true
      ? { hasRecruitmentPlan: true }
      : {}),
    ...(students.length > 0 ? { students } : {}),
    ...(allRecruitmentStudents.length > 0 ? { allRecruitmentStudents } : {}),
    ...(preferred.expectedTrials === undefined
      ? { expectedTrials: existing.expectedTrials ?? incoming.expectedTrials }
      : {}),
  };
}

function deduplicatePlannerPeriods(periods: readonly PlannerPeriod[]): PlannerPeriod[] {
  const uniquePeriods: PlannerPeriod[] = [];
  for (const period of periods) {
    const duplicateIndex = uniquePeriods.findIndex((existing) => hasSamePlannerPeriod(existing, period));
    if (duplicateIndex < 0) {
      uniquePeriods.push(period);
      continue;
    }
    uniquePeriods[duplicateIndex] = mergeDuplicatePlannerPeriods(uniquePeriods[duplicateIndex], period);
  }
  return uniquePeriods;
}

type PlannerCalendarLaneItemDraft = {
  kind: "strip" | "marker";
  key: string;
  period: PlannerPeriod;
  startMs: number;
  endMs: number;
  leftPercent: number;
  strip?: PlannerCalendarStripDraft;
  marker?: PlannerCalendarStartMarker;
  track?: number;
};

export function buildPlannerWeekLayout(
  periods: readonly PlannerPeriod[],
  week: readonly PlannerCalendarDay[],
  timeZone: string,
): PlannerWeekLayout {
  if (week.length !== 7) {
    return {
      eventStrips: [],
      eventStartMarkers: [],
      recruitmentStrips: [],
      laneCount: 0,
      raidStrips: [],
      raidLaneCount: 0,
    };
  }

  const context = createPlannerWeekTemporalContext(week, timeZone);
  const uniquePeriods = deduplicatePlannerPeriods(periods);
  const eventPeriods = uniquePeriods.filter((period) => period.kind === "event" && !period.calendarStartOnly);
  const markerDrafts = uniquePeriods
    .filter((period) => period.kind === "event" && period.calendarStartOnly)
    .filter((period) => period.startDate >= week[0].dateKey && period.startDate <= week[6].dateKey)
    .flatMap((period) => {
      if (!period.startAt) return [];
      const startMs = getInstantTime(period.startAt);
      if (!Number.isFinite(startMs) || startMs >= context.weekEndMs) return [];
      const dayIndex = week.findIndex(({ dateKey }) => dateKey === period.startDate);
      const nextDayStartMs = context.dayStartsMs[dayIndex + 1];
      if (dayIndex < 0 || nextDayStartMs === undefined) return [];
      const leftPercent = plannerInstantPosition(Math.max(startMs, context.weekStartMs), context.dayStartsMs) * 100;
      const marker: PlannerCalendarStartMarker = {
        key: period.key,
        period,
        track: 0,
        leftPercent,
        widthPercent: Math.max(0, 100 - leftPercent),
      };
      return [
        {
          kind: "marker" as const,
          key: marker.key,
          period,
          startMs,
          endMs: nextDayStartMs,
          leftPercent,
          marker,
        },
      ];
    });
  const recruitmentPeriods = uniquePeriods.filter((period) => period.kind === "recruitment");
  const raidPeriods = uniquePeriods.filter((period) => period.kind === "raid");
  const mergedRecruitmentPeriods = new Set<PlannerPeriod>();
  const eventDrafts: PlannerCalendarStripDraft[] = [];

  for (const eventPeriod of eventPeriods) {
    const matchingRecruitments = eventPeriod.eventUid
      ? recruitmentPeriods.filter(
          (recruitmentPeriod) =>
            recruitmentPeriod.eventUid === eventPeriod.eventUid &&
            hasSamePlannerExactInterval(eventPeriod, recruitmentPeriod),
        )
      : [];
    for (const recruitmentPeriod of matchingRecruitments) mergedRecruitmentPeriods.add(recruitmentPeriod);
    const interval = buildPlannerWeekInterval(eventPeriod, context);
    if (!interval) continue;
    eventDrafts.push({
      key: matchingRecruitments.length > 0 ? `${eventPeriod.key}:combined` : eventPeriod.key,
      kind: matchingRecruitments.length > 0 ? "combined" : "event",
      period: eventPeriod,
      recruitmentPeriods: matchingRecruitments,
      ...interval,
    });
  }

  const recruitmentDrafts: PlannerCalendarStripDraft[] = [];
  for (const recruitmentPeriod of recruitmentPeriods) {
    if (mergedRecruitmentPeriods.has(recruitmentPeriod)) continue;
    const interval = buildPlannerWeekInterval(recruitmentPeriod, context);
    if (!interval) continue;
    recruitmentDrafts.push({
      key: recruitmentPeriod.key,
      kind: "recruitment",
      period: recruitmentPeriod,
      recruitmentPeriods: [],
      ...interval,
    });
  }

  const eventLaneDrafts: PlannerCalendarLaneItemDraft[] = [
    ...eventDrafts.map((strip) => ({
      kind: "strip" as const,
      key: strip.key,
      period: strip.period,
      startMs: strip.occupancyStartMs,
      endMs: strip.occupancyEndMs,
      leftPercent: strip.leftPercent,
      strip,
    })),
    ...markerDrafts,
  ];
  const recruitmentLaneDrafts = recruitmentDrafts.map((strip) => ({
    kind: "strip" as const,
    key: strip.key,
    period: strip.period,
    startMs: strip.occupancyStartMs,
    endMs: strip.occupancyEndMs,
    leftPercent: strip.leftPercent,
    strip,
  }));
  const parentByEventUid = new Map<string, PlannerCalendarLaneItemDraft>();
  for (const draft of eventLaneDrafts) {
    if (draft.period.eventUid && !parentByEventUid.has(draft.period.eventUid)) {
      parentByEventUid.set(draft.period.eventUid, draft);
    }
  }
  const recruitmentByParent = new Map<string, PlannerCalendarLaneItemDraft[]>();
  const independentRecruitmentDrafts: PlannerCalendarLaneItemDraft[] = [];
  for (const draft of recruitmentLaneDrafts) {
    const parent = draft.period.eventUid ? parentByEventUid.get(draft.period.eventUid) : undefined;
    if (!parent) {
      independentRecruitmentDrafts.push(draft);
      continue;
    }
    const children = recruitmentByParent.get(parent.key) ?? [];
    children.push(draft);
    recruitmentByParent.set(parent.key, children);
  }

  const parentTasks = eventLaneDrafts.map((parent) => ({
    startMs: parent.startMs,
    eventUid: parent.period.eventUid ?? parent.period.key,
    priority: 0,
    parent,
    children: recruitmentByParent.get(parent.key) ?? [],
  }));
  const independentTasks = independentRecruitmentDrafts.map((draft) => ({
    startMs: draft.startMs,
    eventUid: draft.period.eventUid ?? draft.period.key,
    priority: 1,
    parent: null,
    children: [draft],
  }));
  const allocationTasks = [...parentTasks, ...independentTasks].sort(
    (left, right) =>
      left.startMs - right.startMs || left.eventUid.localeCompare(right.eventUid) || left.priority - right.priority,
  );
  const laneIntervals: { startMs: number; endMs: number }[][] = [];
  const trackedLaneDrafts: (PlannerCalendarLaneItemDraft & { track: number })[] = [];
  const allocateLane = (draft: PlannerCalendarLaneItemDraft, firstLane = 0) => {
    let track = firstLane;
    for (; track < laneIntervals.length; track += 1) {
      if (
        laneIntervals[track].every((interval) => interval.endMs <= draft.startMs || interval.startMs >= draft.endMs)
      ) {
        break;
      }
    }
    while (laneIntervals.length <= track) laneIntervals.push([]);
    laneIntervals[track].push({ startMs: draft.startMs, endMs: draft.endMs });
    trackedLaneDrafts.push({ ...draft, track });
    return track;
  };
  for (const task of allocationTasks) {
    if (!task.parent) {
      for (const draft of task.children) allocateLane(draft);
      continue;
    }
    const parentTrack = allocateLane(task.parent);
    const children = task.children.sort(
      (left, right) => left.startMs - right.startMs || left.key.localeCompare(right.key),
    );
    for (const child of children) allocateLane(child, parentTrack + 1);
  }
  const laneCount = laneIntervals.length;
  const eventStrips = trackedLaneDrafts.flatMap(({ period, strip, track }) =>
    strip && period.kind === "event" ? [{ ...strip, track }] : [],
  );
  const recruitmentStrips = trackedLaneDrafts.flatMap(({ period, strip, track }) =>
    strip && period.kind === "recruitment" ? [{ ...strip, track }] : [],
  );
  const eventStartMarkers = trackedLaneDrafts.flatMap(({ kind, marker, track, startMs, leftPercent }) => {
    if (kind !== "marker" || !marker) return [];
    const nextLaneItem = trackedLaneDrafts
      .filter((candidate) => candidate.track === track && candidate.startMs > startMs)
      .sort((left, right) => left.startMs - right.startMs)[0];
    const rightPercent = nextLaneItem ? nextLaneItem.leftPercent : 100;
    return [{ ...marker, track, widthPercent: Math.max(0, rightPercent - leftPercent) }];
  });
  const raidDrafts = raidPeriods.flatMap((period) => {
    const interval = buildPlannerWeekInterval(period, context);
    if (!interval) return [];
    return [
      {
        key: period.key,
        kind: "raid" as const,
        period,
        recruitmentPeriods: [],
        ...interval,
      },
    ];
  });
  const raidLaneIntervals: { startMs: number; endMs: number }[][] = [];
  const raidStrips = [...raidDrafts]
    .sort(
      (left, right) =>
        left.occupancyStartMs - right.occupancyStartMs || left.period.name.localeCompare(right.period.name),
    )
    .map((draft) => {
      let track = 0;
      for (; track < raidLaneIntervals.length; track += 1) {
        if (
          raidLaneIntervals[track].every(
            (interval) => interval.endMs <= draft.occupancyStartMs || interval.startMs >= draft.occupancyEndMs,
          )
        ) {
          break;
        }
      }
      while (raidLaneIntervals.length <= track) raidLaneIntervals.push([]);
      raidLaneIntervals[track].push({ startMs: draft.occupancyStartMs, endMs: draft.occupancyEndMs });
      return { ...draft, track };
    });
  return {
    eventStrips,
    eventStartMarkers,
    recruitmentStrips,
    laneCount,
    raidStrips,
    raidLaneCount: raidLaneIntervals.length,
  };
}

export function buildPlannerMonthLayout(
  monthKey: string,
  periods: readonly PlannerPeriod[],
  timeZone: string,
): PlannerMonthLayout {
  const weeks = buildPlannerMonthDays(monthKey);
  const weekLayouts = weeks.map((week) => buildPlannerWeekLayout(periods, week, timeZone));
  return {
    monthKey,
    weeks,
    weekLayouts,
  };
}

export function getPlannerTodayMonth(now: string | Date, timeZone: string): string {
  return formatInstantDateKey(now, timeZone).slice(0, 7);
}

export function getPlannerMonthEndInstant(monthKey: string, timeZone: string): Date {
  const lastMonthDay = buildPlannerMonthDays(monthKey)
    .flat()
    .filter((day) => day.inMonth)
    .at(-1);
  if (!lastMonthDay) throw new Error("월을 확인할 수 없어요");
  const endOfDisplayDay = dayjs.tz(`${lastMonthDay.dateKey}T23:59:59.999`, normalizeTimeZone(timeZone));
  if (!endOfDisplayDay.isValid()) throw new Error("기간을 확인할 수 없어요");
  return endOfDisplayDay.toDate();
}

export function buildPlannerPeriods({
  contents,
  scheduleItems,
  favorites,
  eventTrials,
  shopPeriods,
  timeZone,
}: {
  contents: readonly PlannerScheduleContentInput[];
  scheduleItems: readonly PyroxeneScheduleItem[];
  favorites: readonly PlannerFavoriteInput[];
  eventTrials: readonly PlannerEventTrialInput[];
  shopPeriods: readonly PlannerShopPeriodInput[];
  timeZone: string;
}): PlannerPeriod[] {
  const favoriteKeys = new Set(favorites.map(({ contentUid, studentUid }) => `${contentUid}\u0000${studentUid}`));
  const contentByUid = new Map(
    contents.filter((content) => content.kind === "event").map((content) => [content.uid, content]),
  );
  const scheduleEvents = scheduleItems.flatMap((item) => (item.event ? [item.event] : []));
  const scheduleEventByUid = new Map(scheduleEvents.map((event) => [event.uid, event]));
  const scheduleEventByContentUid = new Map<string, (typeof scheduleEvents)[number]>();
  for (const scheduleEvent of scheduleEvents) {
    if (!scheduleEventByContentUid.has(scheduleEvent.uid)) {
      scheduleEventByContentUid.set(scheduleEvent.uid, scheduleEvent);
    }
    for (const recruitment of scheduleEvent.recruitments) {
      if (recruitment.sourceContentUid && !scheduleEventByContentUid.has(recruitment.sourceContentUid)) {
        scheduleEventByContentUid.set(recruitment.sourceContentUid, scheduleEvent);
      }
    }
  }
  for (const content of contents) {
    if (content.kind !== "event") continue;
    const scheduleEvent =
      (content.recruitmentGroupUid ? scheduleEventByUid.get(`group:${content.recruitmentGroupUid}`) : undefined) ??
      scheduleEventByUid.get(content.uid);
    if (scheduleEvent) scheduleEventByContentUid.set(content.uid, scheduleEvent);
  }
  const eventTrialByUid = new Map(
    eventTrials
      .filter((entry): entry is PlannerEventTrialInput & { expectedTrials: number } => entry.expectedTrials !== null)
      .map((entry) => [entry.eventUid, entry.expectedTrials]),
  );
  const relatedEventUids = getPlannerPlannedEventUids({ favorites, eventTrials });
  const periods: PlannerPeriod[] = [];

  for (const content of contents) {
    if (!isNavigablePlannerEvent(content) || !relatedEventUids.has(content.uid)) continue;
    const actualEndAt = getPlannerActualEventEndAt(content);
    const calendarStartOnly = actualEndAt === null;
    const startDate = formatPlannerPeriodDate(content.since, timeZone);
    periods.push({
      key: `event:${content.uid}`,
      kind: "event",
      name: content.name,
      startDate,
      endDate: actualEndAt ? formatPlannerPeriodEndDate(actualEndAt, timeZone) : startDate,
      href: `/events/${encodeURIComponent(content.uid)}`,
      startAt: content.since,
      imageUrl: content.imageUrl ?? null,
      endAt: actualEndAt,
      runType: content.runType,
      endless: content.endless,
      calendarStartOnly,
      eventUid: content.uid,
    });
  }

  const plannedStudentsByEventUid = new Map<string, Map<string, PlannerPeriodStudent[]>>();
  for (const event of scheduleEvents) {
    for (const recruitment of event.recruitments) {
      const sourceStudent = recruitment.student;
      const eventUid = recruitment.sourceContentUid ?? event.uid;
      if (!sourceStudent || !favoriteKeys.has(`${eventUid}\u0000${sourceStudent.uid}`)) continue;
      const student: PlannerPeriodStudent = {
        uid: sourceStudent.uid,
        imageUid: sourceStudent.imageUid ?? null,
        name: sourceStudent.name,
      };

      const endAt = toInstantKey(recruitment.until ?? event.until);
      const studentsByEndAt = plannedStudentsByEventUid.get(eventUid) ?? new Map<string, PlannerPeriodStudent[]>();
      const students = studentsByEndAt.get(endAt) ?? [];
      if (!students.some((existing) => existing.uid === student.uid)) students.push(student);
      studentsByEndAt.set(endAt, students);
      plannedStudentsByEventUid.set(eventUid, studentsByEndAt);
    }
  }

  const plannedRecruitmentEventUids = new Set([...plannedStudentsByEventUid.keys(), ...eventTrialByUid.keys()]);
  for (const eventUid of plannedRecruitmentEventUids) {
    const content = contentByUid.get(eventUid);
    const scheduleEvent = scheduleEventByContentUid.get(eventUid);
    if (!scheduleEvent) continue;
    const studentsByEndAt = plannedStudentsByEventUid.get(eventUid) ?? new Map<string, PlannerPeriodStudent[]>();
    const trialCount = eventTrialByUid.get(eventUid);
    const periodEndAts = new Set(studentsByEndAt.keys());
    if (trialCount !== undefined && !periodEndAts.size) {
      periodEndAts.add(toInstantKey(scheduleEvent.until));
    }

    for (const endAt of periodEndAts) {
      periods.push({
        key: `recruitment:${eventUid}:${endAt}`,
        kind: "recruitment",
        name: content?.name ?? scheduleEvent.name,
        startDate: formatPlannerPeriodDate(scheduleEvent.since, timeZone),
        endDate: formatPlannerPeriodEndDate(endAt, timeZone),
        href: `/events/${encodeURIComponent(eventUid)}/recruitment-simulator`,
        startAt: toInstantKey(scheduleEvent.since),
        endAt,
        eventUid,
        students: studentsByEndAt.get(endAt) ?? [],
        ...(trialCount === undefined || trialCount === null ? {} : { expectedTrials: trialCount }),
      });
    }
  }

  for (const shop of shopPeriods) {
    if (!shop.planned || !shop.startAt || !shop.endAt) continue;
    periods.push({
      key: `shop:${shop.timelineUid}`,
      kind: "shop",
      name: shop.name,
      startDate: formatPlannerPeriodDate(shop.startAt, timeZone),
      endDate: formatPlannerPeriodEndDate(shop.endAt, timeZone),
      href: `/events/${encodeURIComponent(shop.timelineUid)}/shop`,
      startAt: shop.startAt,
      endAt: shop.endAt,
      eventUid: shop.timelineUid,
    });
  }

  periods.push(...buildPlannerRaidPeriods(scheduleItems, timeZone));

  return periods.sort(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      left.name.localeCompare(right.name) ||
      left.key.localeCompare(right.key),
  );
}

export function buildPublicPlannerPeriods({
  contents,
  scheduleItems,
  shopPeriods,
  timeZone,
}: {
  contents: readonly PlannerScheduleContentInput[];
  scheduleItems: readonly PyroxeneScheduleItem[];
  shopPeriods: readonly PlannerShopPeriodInput[];
  timeZone: string;
}): PlannerPeriod[] {
  const eventContents = new Map(contents.filter(isNavigablePlannerEvent).map((content) => [content.uid, content]));
  const periods: PlannerPeriod[] = [];

  for (const content of eventContents.values()) {
    const actualEndAt = getPlannerActualEventEndAt(content);
    const calendarStartOnly = actualEndAt === null;
    const startDate = formatPlannerPeriodDate(content.since, timeZone);
    periods.push({
      key: `event:${content.uid}`,
      kind: "event",
      name: content.name,
      startDate,
      endDate: actualEndAt ? formatPlannerPeriodEndDate(actualEndAt, timeZone) : startDate,
      href: `/events/${encodeURIComponent(content.uid)}`,
      startAt: content.since,
      imageUrl: content.imageUrl ?? null,
      endAt: actualEndAt,
      runType: content.runType,
      endless: content.endless,
      calendarStartOnly,
      eventUid: content.uid,
    });
  }

  const studentsByEventAndEnd = new Map<
    string,
    { eventUid: string; name: string; startAt: string | Date; endAt: string | Date; students: PlannerPeriodStudent[] }
  >();
  for (const item of scheduleItems) {
    const event = item.event;
    if (!event) continue;
    for (const recruitment of event.recruitments) {
      const eventUid = recruitment.sourceContentUid ?? event.uid;
      const content = eventContents.get(eventUid);
      if (!content && (eventUid.startsWith("group:") || eventUid.startsWith("main_story_reward:"))) continue;
      const endAt = recruitment.until ?? event.until;
      const key = `${eventUid}\u0000${toInstantKey(endAt)}`;
      const plan = studentsByEventAndEnd.get(key) ?? {
        eventUid,
        name: content?.name ?? event.name,
        startAt: event.since,
        endAt,
        students: [],
      };
      if (recruitment.student) {
        const student: PlannerPeriodStudent = {
          uid: recruitment.student.uid,
          imageUid: recruitment.student.imageUid ?? null,
          name: recruitment.student.name,
        };
        if (!plan.students.some((existing) => existing.uid === student.uid)) plan.students.push(student);
      }
      studentsByEventAndEnd.set(key, plan);
    }
  }

  for (const { eventUid, name, startAt, endAt, students } of studentsByEventAndEnd.values()) {
    periods.push({
      key: `recruitment:${eventUid}:${endAt}`,
      kind: "recruitment",
      name,
      startDate: formatPlannerPeriodDate(startAt, timeZone),
      endDate: formatPlannerPeriodEndDate(endAt, timeZone),
      href: `/events/${encodeURIComponent(eventUid)}/recruitment-simulator`,
      startAt: toInstantKey(startAt),
      endAt: toInstantKey(endAt),
      eventUid,
      students,
    });
  }

  for (const shop of shopPeriods) {
    if (!shop.startAt || !shop.endAt) continue;
    periods.push({
      key: `shop:${shop.timelineUid}`,
      kind: "shop",
      name: shop.name,
      startDate: formatPlannerPeriodDate(shop.startAt, timeZone),
      endDate: formatPlannerPeriodEndDate(shop.endAt, timeZone),
      href: `/events/${encodeURIComponent(shop.timelineUid)}/shop`,
      startAt: shop.startAt,
      endAt: shop.endAt,
      eventUid: shop.timelineUid,
    });
  }

  periods.push(...buildPlannerRaidPeriods(scheduleItems, timeZone));

  return periods.sort(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      left.name.localeCompare(right.name) ||
      left.key.localeCompare(right.key),
  );
}

function unionPlannerStudents(
  ...studentLists: readonly (readonly PlannerPeriodStudent[] | undefined)[]
): PlannerPeriodStudent[] {
  const students: PlannerPeriodStudent[] = [];
  const seenUids = new Set<string>();
  for (const list of studentLists) {
    for (const student of list ?? []) {
      if (seenUids.has(student.uid)) continue;
      seenUids.add(student.uid);
      students.push(student);
    }
  }
  return students;
}

export function buildPlannerDisplayPeriods(
  personalPeriods: readonly PlannerPeriod[],
  publicPeriods: readonly PlannerPeriod[],
  plannedEventUidsInput: ReadonlySet<string> = new Set<string>(),
): PlannerPeriod[] {
  const plannedEventUids = new Set([
    ...plannedEventUidsInput,
    // Only event-kind personal periods (favorites/saved-trial gated, A5) and recruitment periods
    // with actual plan data mark an event as planned here; a "shop" kind personal period (built
    // whenever shop input is non-default, independent of A5) must not.
    ...personalPeriods.flatMap((period) =>
      period.eventUid &&
      (period.kind === "event" || (period.kind === "recruitment" && hasPlannerRecruitmentPlan(period)))
        ? [period.eventUid]
        : [],
    ),
  ]);
  const appendUnique = (period: PlannerPeriod) => {
    const index = displayPeriods.findIndex((existing) => hasSamePlannerPeriod(existing, period));
    if (index < 0) {
      displayPeriods.push(period);
      return;
    }
    displayPeriods[index] = mergeDuplicatePlannerPeriods(displayPeriods[index], period);
  };
  const displayPeriods: PlannerPeriod[] = [];

  for (const publicPeriod of publicPeriods) {
    const personalMatch = personalPeriods.find(
      (period) =>
        hasSamePlannerPeriod(period, publicPeriod) &&
        (publicPeriod.kind !== "recruitment" || hasPlannerRecruitmentPlan(period)),
    );
    const period = publicPeriod.kind === "recruitment" && personalMatch ? personalMatch : publicPeriod;
    const hasRecruitmentPlan = publicPeriod.kind === "recruitment" && hasPlannerRecruitmentPlan(personalMatch);
    appendUnique({
      ...period,
      isPlanned:
        period.kind === "recruitment"
          ? hasRecruitmentPlan
          : Boolean(period.eventUid && plannedEventUids.has(period.eventUid)),
      hasRecruitmentPlan,
      ...(period.kind === "recruitment"
        ? { allRecruitmentStudents: unionPlannerStudents(publicPeriod.students, personalMatch?.students) }
        : {}),
    });
  }

  for (const personalPeriod of personalPeriods) {
    if (publicPeriods.some((period) => hasSamePlannerPeriod(period, personalPeriod))) continue;
    const hasRecruitmentPlan = personalPeriod.kind === "recruitment" && hasPlannerRecruitmentPlan(personalPeriod);
    appendUnique({
      ...personalPeriod,
      isPlanned:
        personalPeriod.kind === "recruitment"
          ? hasRecruitmentPlan
          : Boolean(personalPeriod.eventUid && plannedEventUids.has(personalPeriod.eventUid)),
      hasRecruitmentPlan,
      ...(personalPeriod.kind === "recruitment"
        ? { allRecruitmentStudents: unionPlannerStudents(personalPeriod.students) }
        : {}),
    });
  }

  return displayPeriods.sort(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      (left.startAt && right.startAt ? getInstantTime(left.startAt) - getInstantTime(right.startAt) : 0) ||
      left.name.localeCompare(right.name) ||
      left.key.localeCompare(right.key),
  );
}

function plannerDateScheduleItemKey(period: PlannerPeriod): string {
  const interval = getPlannerExactInterval(period);
  return [
    period.kind,
    period.eventUid ?? period.raidUid ?? period.key,
    interval?.startMs ?? period.startDate,
    interval?.endMs ?? period.endDate,
  ].join(":");
}

export function getPlannerRaidScheduleFacts(
  resourcesByDate: Readonly<Record<string, PlannerDayResources>>,
): PlannerRaidScheduleFact[] {
  return Object.values(resourcesByDate)
    .flatMap((day) =>
      day.sources.flatMap((source) => {
        if (source.type !== "raid" || !source.raidUid || !source.at) return [];
        return [
          {
            raidUid: source.raidUid,
            kind: source.key.endsWith("::ten-time-ticket-expiry")
              ? ("raid-ticket-expiry" as const)
              : ("raid-reward" as const),
            at: source.at,
          },
        ];
      }),
    )
    .sort(
      (left, right) => getInstantTime(left.at) - getInstantTime(right.at) || left.raidUid.localeCompare(right.raidUid),
    );
}

function findPlannerEventForRecruitment(
  period: PlannerPeriod,
  eventsByUid: ReadonlyMap<string, readonly PlannerPeriod[]>,
): PlannerPeriod | undefined {
  if (!period.eventUid) return undefined;
  const events = eventsByUid.get(period.eventUid) ?? [];
  return (
    events.find(
      (event) => event.startAt && period.startAt && getInstantTime(event.startAt) === getInstantTime(period.startAt),
    ) ??
    events.find((event) => event.startDate <= period.startDate && event.endDate >= period.startDate) ??
    events[0]
  );
}

export function getPlannerDateScheduleForDate(
  periods: readonly PlannerPeriod[],
  dateKey: LocalDateString,
  timeZone: string,
  raidFacts: readonly PlannerRaidScheduleFact[] = [],
): PlannerDateSchedule {
  const eventsByUid = new Map<string, PlannerPeriod[]>();
  for (const period of periods) {
    if (period.kind !== "event" || !period.eventUid) continue;
    const events = eventsByUid.get(period.eventUid) ?? [];
    events.push(period);
    eventsByUid.set(period.eventUid, events);
  }

  const onDateByKey = new Map<string, PlannerDateScheduleItem>();
  const addFact = (period: PlannerPeriod, kind: PlannerScheduleFactKind, at: string) => {
    const key = plannerDateScheduleItemKey(period);
    const existing = onDateByKey.get(key);
    if (existing) {
      if (!existing.facts.some((fact) => fact.kind === kind && fact.at === at)) existing.facts.push({ kind, at });
      return;
    }
    onDateByKey.set(key, {
      key,
      period,
      ...(period.eventUid && period.kind !== "event" && period.kind !== "raid"
        ? { eventPeriod: findPlannerEventForRecruitment(period, eventsByUid) }
        : {}),
      facts: [{ kind, at }],
    });
  };

  for (const period of periods) {
    if (period.kind === "event") {
      if (period.startDate === dateKey && period.startAt) addFact(period, "event-start", period.startAt);
      if (period.endAt && formatPlannerPeriodDate(period.endAt, timeZone) === dateKey) {
        addFact(period, "event-end", period.endAt);
      }
      continue;
    }

    if (period.kind === "raid") {
      if (period.startDate === dateKey && period.startAt) addFact(period, "raid-start", period.startAt);
      if (period.endAt && formatPlannerPeriodDate(period.endAt, timeZone) === dateKey) {
        addFact(period, "raid-end", period.endAt);
      }
      continue;
    }

    if (period.kind === "recruitment") {
      if (period.startDate === dateKey && period.startAt) addFact(period, "recruitment-start", period.startAt);
      if (period.endAt && formatPlannerPeriodDate(period.endAt, timeZone) === dateKey) {
        addFact(period, "recruitment-end", period.endAt);
      }
      continue;
    }

    if (period.endAt && formatPlannerPeriodDate(period.endAt, timeZone) === dateKey) {
      addFact(period, "shop-deadline", period.endAt);
    }
  }

  for (const raidFact of raidFacts) {
    if (formatPlannerPeriodDate(raidFact.at, timeZone) !== dateKey) continue;
    const raidPeriod = periods.find((period) => period.kind === "raid" && period.raidUid === raidFact.raidUid);
    if (raidPeriod) addFact(raidPeriod, raidFact.kind, raidFact.at);
  }

  const compareFacts = (left: PlannerScheduleFact, right: PlannerScheduleFact) =>
    getInstantTime(left.at) - getInstantTime(right.at) || left.kind.localeCompare(right.kind);
  const onDate = [...onDateByKey.values()].map((item) => ({
    ...item,
    facts: [...item.facts].sort(compareFacts),
  }));
  onDate.sort(
    (left, right) =>
      getInstantTime(left.facts[0].at) - getInstantTime(right.facts[0].at) ||
      left.period.name.localeCompare(right.period.name),
  );

  const factKeys = new Set(onDate.map((item) => item.key));
  const ongoingCandidates = periods
    .filter((period) => {
      if (period.kind === "shop" || factKeys.has(plannerDateScheduleItemKey(period))) return false;
      if (period.kind === "event" && period.endAt == null) return false;
      return period.startDate < dateKey && period.endDate > dateKey;
    })
    .map((period) => ({
      key: plannerDateScheduleItemKey(period),
      period,
      ...(period.kind === "recruitment" ? { eventPeriod: findPlannerEventForRecruitment(period, eventsByUid) } : {}),
      facts: [],
    }));
  const visibleEventKeys = new Set(
    [...onDate, ...ongoingCandidates].filter((item) => item.period.kind === "event").map((item) => item.key),
  );
  const mergedOngoingRecruitmentKeys = new Set(
    ongoingCandidates.flatMap((item) => {
      if (item.period.kind !== "recruitment" || !item.period.eventUid || !item.eventPeriod) return [];
      return visibleEventKeys.has(plannerDateScheduleItemKey(item.eventPeriod)) ? [item.key] : [];
    }),
  );
  const ongoing = ongoingCandidates.filter(
    (item) => item.period.kind !== "recruitment" || !mergedOngoingRecruitmentKeys.has(item.key),
  );
  const itemsByKey = new Map<string, PlannerDateScheduleItem>();
  for (const item of [...onDate, ...ongoing]) itemsByKey.set(item.key, item);
  const allItems = [...itemsByKey.values()];
  const eventItemsByUid = new Map<string, PlannerDateScheduleItem>();
  const eventItemsByKey = new Map<string, PlannerDateScheduleItem>();
  for (const item of allItems) {
    if (item.period.kind !== "event" || !item.period.eventUid) continue;
    eventItemsByUid.set(item.period.eventUid, item);
    eventItemsByKey.set(item.key, item);
  }
  const parentEventItem = (item: PlannerDateScheduleItem) =>
    item.eventPeriod
      ? eventItemsByKey.get(plannerDateScheduleItemKey(item.eventPeriod))
      : item.period.eventUid
        ? eventItemsByUid.get(item.period.eventUid)
        : undefined;
  for (const item of ongoingCandidates) {
    if (item.period.kind !== "recruitment" || !mergedOngoingRecruitmentKeys.has(item.key) || !item.eventPeriod)
      continue;
    const eventItem = eventItemsByKey.get(plannerDateScheduleItemKey(item.eventPeriod));
    if (!eventItem) continue;
    eventItem.recruitmentPeriods = [...(eventItem.recruitmentPeriods ?? []), item.period];
    eventItem.ongoingRecruitmentPeriods = [...(eventItem.ongoingRecruitmentPeriods ?? []), item.period];
  }

  const visibleItems: PlannerDateScheduleItem[] = [];
  for (const item of allItems) {
    const { period } = item;
    if (period.kind === "recruitment" && period.eventUid) {
      const eventItem = parentEventItem(item);
      if (eventItem) {
        eventItem.facts.push(...item.facts);
        eventItem.recruitmentPeriods = [...(eventItem.recruitmentPeriods ?? []), period];
        if (ongoingCandidates.some((candidate) => candidate.key === item.key)) {
          eventItem.ongoingRecruitmentPeriods = [...(eventItem.ongoingRecruitmentPeriods ?? []), period];
        }
        continue;
      }
      item.recruitmentPeriods = [period];
    }
    if (period.kind === "shop" && period.eventUid) {
      const eventItem = eventItemsByUid.get(period.eventUid);
      if (eventItem) {
        eventItem.facts.push(...item.facts);
        eventItem.shopPeriod = period;
        continue;
      }
      item.shopPeriod = period;
    }
    visibleItems.push(item);
  }

  for (const item of visibleItems) {
    // A standalone shop item (e.g. the shop deadline outlives the event, so there is no visible
    // event card) needs the same recruitmentPeriods filtering as an event item, so its card never
    // falls back to an unfiltered list that could show an already-ended recruitment.
    if ((item.period.kind !== "event" && item.period.kind !== "shop") || !item.period.eventUid) continue;
    const eventRecruitments = periods.filter(
      (period) =>
        period.kind === "recruitment" && period.eventUid === item.period.eventUid && period.endDate >= dateKey,
    );
    const merged = new Map(
      [...(item.recruitmentPeriods ?? []), ...eventRecruitments]
        .filter((period) => period.endDate >= dateKey)
        .map((period) => [period.key, period]),
    );
    item.recruitmentPeriods = [...merged.values()].sort(
      (left, right) =>
        left.startDate.localeCompare(right.startDate) ||
        left.name.localeCompare(right.name) ||
        left.key.localeCompare(right.key),
    );
    const ongoingRecruitments = (item.ongoingRecruitmentPeriods ?? []).filter(
      (period, index, list) => list.findIndex((candidate) => candidate.key === period.key) === index,
    );
    if (ongoingRecruitments.length > 0) item.ongoingRecruitmentPeriods = ongoingRecruitments;
    item.shopPeriod ??= periods.find((period) => period.kind === "shop" && period.eventUid === item.period.eventUid);
    item.facts = item.facts.filter(
      (fact, index, facts) =>
        facts.findIndex((candidate) => candidate.kind === fact.kind && candidate.at === fact.at) === index,
    );
  }

  const sortFacts = (items: PlannerDateScheduleItem[]) => {
    for (const item of items) item.facts.sort(compareFacts);
    items.sort((left, right) => {
      const leftFactAt = left.facts[0] ? getInstantTime(left.facts[0].at) : null;
      const rightFactAt = right.facts[0] ? getInstantTime(right.facts[0].at) : null;
      if (leftFactAt !== null && rightFactAt !== null) {
        return leftFactAt - rightFactAt || left.period.name.localeCompare(right.period.name);
      }
      if (leftFactAt !== null) return -1;
      if (rightFactAt !== null) return 1;
      const leftEnd = left.period.endAt ? getInstantTime(left.period.endAt) : Number.POSITIVE_INFINITY;
      const rightEnd = right.period.endAt ? getInstantTime(right.period.endAt) : Number.POSITIVE_INFINITY;
      return leftEnd - rightEnd || left.period.name.localeCompare(right.period.name);
    });
    return items;
  };

  const sortedItems = sortFacts(visibleItems);
  const factKeysSorted = new Set(onDate.map((item) => item.key));
  const sortedOnDate = sortFacts(sortedItems.filter((item) => item.facts.length > 0));
  const sortedOngoing = sortFacts(
    sortedItems.filter((item) => item.facts.length === 0 && !factKeysSorted.has(item.key)),
  );
  return { onDate: sortedOnDate, ongoing: sortedOngoing, items: sortedItems };
}

export function buildPlannerRecruitmentCandidatesForDate(
  periods: readonly PlannerPeriod[],
  selectedDate?: LocalDateString,
): PlannerRecruitmentCandidatePeriod[] {
  const candidatesByEventUid = new Map<string, PlannerRecruitmentCandidatePeriod>();
  for (const period of periods) {
    if (
      period.kind !== "recruitment" ||
      (selectedDate !== undefined && (period.startDate > selectedDate || period.endDate < selectedDate)) ||
      !period.eventUid
    ) {
      continue;
    }

    const eventPeriod = periods.find(
      (candidatePeriod) => candidatePeriod.kind === "event" && candidatePeriod.eventUid === period.eventUid,
    );
    const candidate =
      candidatesByEventUid.get(period.eventUid) ??
      ({
        eventUid: period.eventUid,
        eventName: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        startAt: period.startAt ?? null,
        endAt: period.endAt ?? null,
        imageUrl: eventPeriod?.imageUrl ?? null,
        ...(eventPeriod?.runType ? { runType: eventPeriod.runType } : {}),
        students: [],
      } satisfies PlannerRecruitmentCandidatePeriod);
    if (period.startDate < candidate.startDate) {
      candidate.startDate = period.startDate;
      candidate.startAt = period.startAt ?? null;
    }
    if (period.endDate > candidate.endDate) {
      candidate.endDate = period.endDate;
      candidate.endAt = period.endAt ?? null;
    }
    if (!candidate.imageUrl && eventPeriod?.imageUrl) candidate.imageUrl = eventPeriod.imageUrl;
    const existingStudentUids = new Set(candidate.students.map((student) => student.uid));
    // Prefer the full recruitment roster (allRecruitmentStudents) so the editor still lists every
    // student once a favorite is saved; fall back to `students` for periods built outside
    // buildPlannerDisplayPeriods (e.g. constructed directly, as in tests).
    for (const student of period.allRecruitmentStudents ?? period.students ?? []) {
      if (existingStudentUids.has(student.uid)) continue;
      candidate.students.push(student);
      existingStudentUids.add(student.uid);
    }
    candidatesByEventUid.set(period.eventUid, candidate);
  }

  return [...candidatesByEventUid.values()].sort(
    (left, right) => left.eventName.localeCompare(right.eventName) || left.eventUid.localeCompare(right.eventUid),
  );
}
