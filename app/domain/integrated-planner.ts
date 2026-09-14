import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { PYROXENE_SOURCE_DEFINITIONS } from "~/domain/pyroxene-sources";
import type { PickupResources, Timeline } from "~/domain/pyroxene-timeline";
import { formatInstantDateKey, type LocalDateString, normalizeTimeZone } from "~/lib/date-time";
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
  eventUid?: string;
  students?: PlannerPeriodStudent[];
  expectedTrials?: number;
  conflict?: boolean;
};

export type PlannerPeriodGroup = {
  key: string;
  eventUid?: string;
  name: string;
  periods: PlannerPeriod[];
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

export type PlannerPeriodStudent = {
  uid: string;
  imageUid: string | null;
  name: string;
};

export type PlannerRecruitmentCandidatePeriod = {
  eventUid: string;
  eventName: string;
  startDate: LocalDateString;
  students: PlannerPeriodStudent[];
};

export type PlannerScheduleContentInput = {
  kind: "event" | "raid";
  uid: string;
  name: string;
  since: string;
  until: string;
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
  conflict?: boolean;
};

export type PlannerCalendarDay = {
  dateKey: LocalDateString;
  inMonth: boolean;
};

export type PlannerPeriodSegment = {
  period: PlannerPeriod;
  startColumn: number;
  endColumn: number;
  track: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

const RESOURCE_KEYS: readonly PlannerResourceKey[] = ["pyroxene", "oneTimeTicket", "tenTimeTicket"];

function toInstantKey(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isNavigablePlannerEvent(
  content: PlannerScheduleContentInput,
): content is PlannerScheduleContentInput & { kind: "event" } {
  return content.kind === "event" && !content.uid.startsWith("group:") && !content.tags?.includes("main_story_reward");
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
      entry.source.description?.trim() ||
      entry.source.event?.name ||
      PYROXENE_SOURCE_DEFINITIONS.find((source) => source.type === entry.source.type)?.label ||
      null;
    day.sources.push({
      key: entry.source.uid ?? `${entry.source.type}:${dateKey}:${index}`,
      type: entry.source.type,
      label,
      changes: sourceChanges,
    });
  }

  for (const day of Object.values(byDate)) {
    day.changes.sort((left, right) => RESOURCE_KEYS.indexOf(left.key) - RESOURCE_KEYS.indexOf(right.key));
  }
  return byDate;
}

export function splitPlannerPeriodsForWeek(
  periods: readonly PlannerPeriod[],
  week: readonly PlannerCalendarDay[],
): PlannerPeriodSegment[] {
  if (week.length !== 7) return [];
  const weekStart = week[0].dateKey;
  const weekEnd = week[6].dateKey;
  const candidates = periods
    .filter((period) => period.startDate <= weekEnd && period.endDate >= weekStart)
    .map((period) => {
      const startColumn = Math.max(
        0,
        week.findIndex((day) => day.dateKey >= period.startDate),
      );
      const reverseEndColumn = [...week].reverse().findIndex((day) => day.dateKey <= period.endDate);
      const endColumn = 6 - reverseEndColumn;
      return {
        period,
        startColumn,
        endColumn,
        continuesBefore: period.startDate < weekStart,
        continuesAfter: period.endDate > weekEnd,
      };
    })
    .filter((segment) => segment.startColumn <= segment.endColumn)
    .sort(
      (left, right) =>
        left.startColumn - right.startColumn ||
        left.endColumn - right.endColumn ||
        left.period.name.localeCompare(right.period.name),
    );

  const trackEnds: number[] = [];
  return candidates.map((segment) => {
    let track = trackEnds.findIndex((endColumn) => endColumn < segment.startColumn);
    if (track === -1) track = trackEnds.length;
    trackEnds[track] = segment.endColumn;
    return { ...segment, track };
  });
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
  eventRewardUids,
  shopPeriods,
  timeZone,
}: {
  contents: readonly PlannerScheduleContentInput[];
  scheduleItems: readonly PyroxeneScheduleItem[];
  favorites: readonly PlannerFavoriteInput[];
  eventTrials: readonly PlannerEventTrialInput[];
  eventRewardUids: readonly string[];
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
  const plannedShopUids = new Set(shopPeriods.filter((period) => period.planned).map((period) => period.timelineUid));
  const relatedEventUids = new Set([
    ...favorites.map((favorite) => favorite.contentUid),
    ...eventTrials.filter((entry) => entry.expectedTrials !== null).map((entry) => entry.eventUid),
    ...eventRewardUids,
    ...plannedShopUids,
  ]);
  const periods: PlannerPeriod[] = [];

  for (const content of contents) {
    if (!isNavigablePlannerEvent(content) || !relatedEventUids.has(content.uid)) continue;
    periods.push({
      key: `event:${content.uid}`,
      kind: "event",
      name: content.name,
      startDate: formatPlannerPeriodDate(content.since, timeZone),
      endDate: formatPlannerPeriodEndDate(content.until, timeZone),
      href: `/events/${encodeURIComponent(content.uid)}`,
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
    const scheduleEvent = content ? scheduleEventByContentUid.get(content.uid) : undefined;
    if (!content || !scheduleEvent) continue;
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
        name: content.name,
        startDate: formatPlannerPeriodDate(scheduleEvent.since, timeZone),
        endDate: formatPlannerPeriodEndDate(endAt, timeZone),
        href: `/events/${encodeURIComponent(eventUid)}/recruitment-simulator`,
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
      eventUid: shop.timelineUid,
      conflict: shop.conflict,
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
    periods.push({
      key: `event:${content.uid}`,
      kind: "event",
      name: content.name,
      startDate: formatPlannerPeriodDate(content.since, timeZone),
      endDate: formatPlannerPeriodEndDate(content.until, timeZone),
      href: `/events/${encodeURIComponent(content.uid)}`,
      eventUid: content.uid,
    });
  }

  const studentsByEventAndEnd = new Map<
    string,
    { eventUid: string; startAt: string | Date; endAt: string | Date; students: PlannerPeriodStudent[] }
  >();
  for (const item of scheduleItems) {
    const event = item.event;
    if (!event) continue;
    for (const recruitment of event.recruitments) {
      const eventUid = recruitment.sourceContentUid ?? event.uid;
      const content = eventContents.get(eventUid);
      if (!content) continue;
      const endAt = recruitment.until ?? event.until;
      const key = `${eventUid}\u0000${toInstantKey(endAt)}`;
      const plan = studentsByEventAndEnd.get(key) ?? { eventUid, startAt: event.since, endAt, students: [] };
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

  for (const { eventUid, startAt, endAt, students } of studentsByEventAndEnd.values()) {
    const content = eventContents.get(eventUid);
    if (!content) continue;
    periods.push({
      key: `recruitment:${eventUid}:${endAt}`,
      kind: "recruitment",
      name: content.name,
      startDate: formatPlannerPeriodDate(startAt, timeZone),
      endDate: formatPlannerPeriodEndDate(endAt, timeZone),
      href: `/events/${encodeURIComponent(eventUid)}/recruitment-simulator`,
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

export function buildPlannerRecruitmentCandidatesForDate(
  periods: readonly PlannerPeriod[],
  selectedDate: LocalDateString,
): PlannerRecruitmentCandidatePeriod[] {
  const candidatesByEventUid = new Map<string, PlannerRecruitmentCandidatePeriod>();
  for (const period of periods) {
    if (
      period.kind !== "recruitment" ||
      period.startDate > selectedDate ||
      period.endDate < selectedDate ||
      !period.eventUid
    ) {
      continue;
    }

    const candidate =
      candidatesByEventUid.get(period.eventUid) ??
      ({
        eventUid: period.eventUid,
        eventName: period.name,
        startDate: period.startDate,
        students: [],
      } satisfies PlannerRecruitmentCandidatePeriod);
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
