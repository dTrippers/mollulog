import { compareInstantAsc, formatInstantDateKey, type UtcIsoString } from "~/lib/date-time";

export const SCHEDULE_PICKUP_SECTION_TITLE = "픽업 학생";
export const SCHEDULE_OTHERS_SECTION_TITLE = "픽업 대상 외 모집 가능 학생";

export type ScheduleRecruitment = {
  since: UtcIsoString;
  until: UtcIsoString | null;
  pickup: boolean;
};

export type ScheduleGroupInput<T extends ScheduleRecruitment> = {
  uid: string;
  name: string;
  entries: T[];
  // The content's own end. A recruitment without its own end falls back to it, as the table rows do.
  contentUntil?: UtcIsoString | null;
};

export type ScheduleSection<T> = {
  key: "pickup" | "others" | "all";
  // Null when only one kind of student is in the group, so no section title is shown.
  title: string | null;
  entries: T[];
};

export type ScheduleGroup<T> = {
  uid: string;
  name: string;
  // The group's own period: the earliest start and the latest end, null when any recruitment has no end.
  since: UtcIsoString;
  until: UtcIsoString | null;
  // The name shows only with more than one group. The period shows only when its displayed days differ from the row's.
  showName: boolean;
  showPeriod: boolean;
  sections: ScheduleSection<T>[];
};

// The calendar day of an instant in the display time zone, or null when the instant is open-ended.
function displayedDay(instant: UtcIsoString | null, timeZone: string): string | null {
  return instant === null ? null : formatInstantDateKey(instant, timeZone);
}

// Groups the recruited students of one schedule row by content, as the 1.x table did. A group with both pickup and
// non-pickup students splits into two titled sections. Periods are compared by the days the table displays, so two
// instants on the same displayed day count as equal.
export function buildScheduleGroups<T extends ScheduleRecruitment>(
  groups: ScheduleGroupInput<T>[],
  row: { since: UtcIsoString; until: UtcIsoString | null },
  timeZone: string,
): ScheduleGroup<T>[] {
  const rowSinceDay = displayedDay(row.since, timeZone);
  const rowUntilDay = displayedDay(row.until, timeZone);
  return groups.map((group) => {
    const since = group.entries.map((entry) => entry.since).sort(compareInstantAsc)[0];
    const untils = group.entries.map((entry) => entry.until ?? group.contentUntil ?? null);
    const until = untils.some((value) => value === null)
      ? null
      : (untils
          .filter((value): value is UtcIsoString => value !== null)
          .sort(compareInstantAsc)
          .at(-1) ?? null);
    const pickups = group.entries.filter((entry) => entry.pickup);
    const others = group.entries.filter((entry) => !entry.pickup);
    const split = pickups.length > 0 && others.length > 0;
    const sections: ScheduleSection<T>[] = split
      ? [
          { key: "pickup", title: SCHEDULE_PICKUP_SECTION_TITLE, entries: pickups },
          { key: "others", title: SCHEDULE_OTHERS_SECTION_TITLE, entries: others },
        ]
      : [{ key: "all", title: null, entries: group.entries }];

    return {
      uid: group.uid,
      name: group.name,
      since,
      until,
      showName: groups.length > 1,
      showPeriod: displayedDay(since, timeZone) !== rowSinceDay || displayedDay(until, timeZone) !== rowUntilDay,
      sections,
    };
  });
}
