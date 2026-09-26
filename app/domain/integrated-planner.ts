import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { PYROXENE_SOURCE_DEFINITIONS } from "~/domain/pyroxene-sources";
import type { PickupResources, Timeline } from "~/domain/pyroxene-timeline";
import type { RunType } from "~/domain/timeline-content";
import { formatInstantDateKey, getInstantTime, type LocalDateString, normalizeTimeZone } from "~/lib/date-time";
import dayjs from "~/lib/dayjs";

export type PlannerResourceKey = keyof PickupResources;

export type PlannerResourceChange = {
  key: PlannerResourceKey;
  quantity: number;
};

export type PlannerTimelineSource = {
  key: string;
  type: string;
  label: string | null;
  eventUid?: string;
  changes: PlannerResourceChange[];
};

export type PlannerDayResources = {
  dateKey: LocalDateString;
  changes: PlannerResourceChange[];
  sources: PlannerTimelineSource[];
};

export type PlannerPeriod = {
  key: string;
  kind: "event" | "recruitment" | "shop";
  name: string;
  startDate: LocalDateString;
  endDate: LocalDateString;
  href: string;
  startAt?: string | null;
  imageUrl?: string | null;
  endAt?: string | null;
  runType?: RunType;
  endless?: boolean;
  calendarStartOnly?: boolean;
  eventUid?: string;
  students?: PlannerPeriodStudent[];
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
  | "shop-deadline";

export type PlannerScheduleFact = {
  kind: PlannerScheduleFactKind;
  at: string;
};

export type PlannerDateScheduleItem = {
  key: string;
  period: PlannerPeriod;
  eventPeriod?: PlannerPeriod;
  ongoingRecruitmentPeriods?: PlannerPeriod[];
  facts: PlannerScheduleFact[];
};

export type PlannerDateSchedule = {
  onDate: PlannerDateScheduleItem[];
  ongoing: PlannerDateScheduleItem[];
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
    if (period.kind === "event" && (period.endAt == null || period.endless === true)) {
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

export function getPlannerPlannedEventUids({
  favorites,
  eventTrials,
  shopPeriods,
}: {
  favorites: readonly PlannerFavoriteInput[];
  eventTrials: readonly PlannerEventTrialInput[];
  shopPeriods: readonly PlannerShopPeriodInput[];
}): Set<string> {
  return new Set([
    ...favorites.map(({ contentUid }) => contentUid),
    ...eventTrials.filter(({ expectedTrials }) => expectedTrials !== null).map(({ eventUid }) => eventUid),
    ...shopPeriods.filter(({ planned }) => planned).map(({ timelineUid }) => timelineUid),
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
  kind: "event" | "recruitment" | "combined";
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

function toInstantKey(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isNavigablePlannerEvent(
  content: PlannerScheduleContentInput,
): content is PlannerScheduleContentInput & { kind: "event" } {
  return content.kind === "event" && !content.uid.startsWith("group:") && !content.tags?.includes("main_story_reward");
}

function getPlannerActualEventEndAt(content: PlannerScheduleContentInput): string | null {
  if (content.endless === true) return null;
  return content.actualEndAt !== undefined ? content.actualEndAt : content.until;
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
      ...(entry.source.event?.uid ? { eventUid: entry.source.event.uid } : {}),
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
  if (left.kind !== right.kind || !left.eventUid || left.eventUid !== right.eventUid) return false;
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

  return {
    ...existing,
    ...preferred,
    ...(existing.isPlanned === true || incoming.isPlanned === true ? { isPlanned: true } : {}),
    ...(existing.hasRecruitmentPlan === true || incoming.hasRecruitmentPlan === true
      ? { hasRecruitmentPlan: true }
      : {}),
    ...(students.length > 0 ? { students } : {}),
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

export function hasPlannerExactEventHandoff(left: PlannerPeriod, right: PlannerPeriod): boolean {
  if (
    left.kind !== "event" ||
    right.kind !== "event" ||
    !left.eventUid ||
    !right.eventUid ||
    left.eventUid === right.eventUid
  ) {
    return false;
  }
  const leftInterval = getPlannerExactInterval(left);
  const rightInterval = getPlannerExactInterval(right);
  return (
    leftInterval !== null &&
    rightInterval !== null &&
    (leftInterval.endMs === rightInterval.startMs || leftInterval.startMs === rightInterval.endMs)
  );
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
  return {
    eventStrips,
    eventStartMarkers,
    recruitmentStrips,
    laneCount,
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
  const relatedEventUids = getPlannerPlannedEventUids({ favorites, eventTrials, shopPeriods });
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

  return periods.sort(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      left.name.localeCompare(right.name) ||
      left.key.localeCompare(right.key),
  );
}

export function buildPlannerDisplayPeriods(
  personalPeriods: readonly PlannerPeriod[],
  publicPeriods: readonly PlannerPeriod[],
  plannedEventUidsInput: ReadonlySet<string> = new Set<string>(),
): PlannerPeriod[] {
  const plannedEventUids = new Set([
    ...plannedEventUidsInput,
    ...personalPeriods.flatMap((period) =>
      period.eventUid && (period.kind !== "recruitment" || hasPlannerRecruitmentPlan(period)) ? [period.eventUid] : [],
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
    period.eventUid ?? period.key,
    interval?.startMs ?? period.startDate,
    interval?.endMs ?? period.endDate,
  ].join(":");
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
      ...(period.eventUid && period.kind !== "event"
        ? { eventPeriod: findPlannerEventForRecruitment(period, eventsByUid) }
        : {}),
      facts: [{ kind, at }],
    });
  };

  for (const period of periods) {
    if (period.kind === "event") {
      if (period.startDate === dateKey && period.startAt) addFact(period, "event-start", period.startAt);
      if (period.endAt && formatPlannerPeriodDate(period.endAt, timeZone) === dateKey && period.endless !== true) {
        addFact(period, "event-end", period.endAt);
      }
      continue;
    }

    if (period.kind === "recruitment") {
      const eventPeriod = findPlannerEventForRecruitment(period, eventsByUid);
      const hasDifferentStartTime =
        period.startDate === dateKey &&
        Boolean(
          period.startAt &&
            eventPeriod?.startAt &&
            getInstantTime(period.startAt) !== getInstantTime(eventPeriod.startAt),
        );
      if (hasDifferentStartTime && period.startAt) addFact(period, "recruitment-start", period.startAt);
      if (period.endAt && formatPlannerPeriodDate(period.endAt, timeZone) === dateKey) {
        addFact(period, "recruitment-end", period.endAt);
      }
      continue;
    }

    if (period.endAt && formatPlannerPeriodDate(period.endAt, timeZone) === dateKey) {
      addFact(period, "shop-deadline", period.endAt);
    }
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
      if (period.kind === "event" && (period.endAt == null || period.endless === true)) return false;
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
  const ongoingRecruitmentPeriodsByEventKey = new Map<string, PlannerPeriod[]>();
  for (const item of ongoingCandidates) {
    if (!mergedOngoingRecruitmentKeys.has(item.key) || !item.eventPeriod) continue;
    const eventKey = plannerDateScheduleItemKey(item.eventPeriod);
    const recruitments = ongoingRecruitmentPeriodsByEventKey.get(eventKey) ?? [];
    recruitments.push(item.period);
    ongoingRecruitmentPeriodsByEventKey.set(eventKey, recruitments);
  }
  const attachOngoingRecruitments = (items: PlannerDateScheduleItem[]) =>
    items.map((item) => {
      if (item.period.kind !== "event") return item;
      const recruitments = ongoingRecruitmentPeriodsByEventKey.get(item.key);
      return recruitments ? { ...item, ongoingRecruitmentPeriods: recruitments } : item;
    });
  const onDateWithRecruitments = attachOngoingRecruitments(onDate);
  const ongoing = ongoingCandidates.filter(
    (item) => item.period.kind !== "recruitment" || !mergedOngoingRecruitmentKeys.has(item.key),
  );
  ongoing.sort((left, right) => {
    const leftEnd = left.period.endAt ? getInstantTime(left.period.endAt) : Number.POSITIVE_INFINITY;
    const rightEnd = right.period.endAt ? getInstantTime(right.period.endAt) : Number.POSITIVE_INFINITY;
    return leftEnd - rightEnd || left.period.name.localeCompare(right.period.name);
  });

  return { onDate: onDateWithRecruitments, ongoing: attachOngoingRecruitments(ongoing) };
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
    for (const student of period.students ?? []) {
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
