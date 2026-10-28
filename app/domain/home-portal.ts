import type { TimelineContent } from "~/domain/timeline-content";
import { compareInstantAsc, formatInstantDateKey, isInstantAfter, type UtcIsoString } from "~/lib/date-time";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// Whole calendar days from `from` to `to` in the display timezone. Same-day instants give 0.
export function calendarDayDifference(from: UtcIsoString, to: UtcIsoString, timeZone: string): number {
  const fromKey = formatInstantDateKey(from, timeZone);
  const toKey = formatInstantDateKey(to, timeZone);
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / MS_PER_DAY);
}

export type HomeTimeChip =
  | { kind: "ongoing-days"; days: number }
  | { kind: "ongoing-hours"; hours: number }
  | { kind: "upcoming-days"; days: number }
  | { kind: "upcoming-today" }
  | { kind: "publish"; monthDay: string };

// 진행 중: `N일 남음`, and `N시간 남음` under one day. The remaining time is counted from now to the end.
export function getHomeOngoingChip(endAt: UtcIsoString, now: UtcIsoString, timeZone: string): HomeTimeChip {
  const remainingMs = Date.parse(endAt) - Date.parse(now);
  if (remainingMs < MS_PER_DAY) {
    return { kind: "ongoing-hours", hours: Math.max(1, Math.ceil(remainingMs / MS_PER_HOUR)) };
  }
  return { kind: "ongoing-days", days: calendarDayDifference(now, endAt, timeZone) };
}

// 예정: `N일 후 시작`. A start later the same calendar day has no day count yet.
export function getHomeUpcomingChip(startAt: UtcIsoString, now: UtcIsoString, timeZone: string): HomeTimeChip {
  const days = calendarDayDifference(now, startAt, timeZone);
  if (days <= 0) {
    return { kind: "upcoming-today" };
  }
  return { kind: "upcoming-days", days };
}

// 메인 스토리: `MM/DD 공개`, the release date in the display timezone.
export function getHomePublishChip(startAt: UtcIsoString, timeZone: string): HomeTimeChip {
  return { kind: "publish", monthDay: formatInstantDateKey(startAt, timeZone).slice(5).replace("-", "/") };
}

// The shop calculator rule of models/event-content.ts getEventMetadata. Kept in sync by the home domain test.
export function isHomeShopAvailable(
  content: Pick<TimelineContent, "contentType" | "contentUid" | "shopContentUid" | "runType">,
) {
  return (
    content.shopContentUid != null ||
    (content.contentType === "event" && content.contentUid != null && content.runType !== "permanent")
  );
}

export type HomeEntryPoint =
  | { key: "shop"; label: "상점 계산기"; href: string }
  | { key: "simulator"; label: "모집 시뮬레이션"; href: string }
  | { key: "card-flip"; label: "카드 뒤집기"; href: string }
  | { key: "treasure-hunt"; label: "보물찾기"; href: string }
  | { key: "road-puzzle"; label: "철도 연결"; href: string };

// Only the entry points the event can use. Card flip needs the shop; the simulator needs a recruitment group.
export function getHomeEntryPoints(
  content: Pick<
    TimelineContent,
    "uid" | "contentType" | "contentUid" | "shopContentUid" | "runType" | "recruitmentGroupUid"
  >,
  minigameType: string | null,
): HomeEntryPoint[] {
  const shopAvailable = isHomeShopAvailable(content);
  const points: HomeEntryPoint[] = [];
  if (shopAvailable) {
    points.push({ key: "shop", label: "상점 계산기", href: `/events/${content.uid}/shop` });
  }
  if (content.recruitmentGroupUid) {
    points.push({ key: "simulator", label: "모집 시뮬레이션", href: `/events/${content.uid}/recruitment-simulator` });
  }
  if (minigameType === "card_flip" && shopAvailable) {
    points.push({ key: "card-flip", label: "카드 뒤집기", href: `/events/${content.uid}/shop/card-flip` });
  }
  if (minigameType === "treasure_hunt") {
    points.push({ key: "treasure-hunt", label: "보물찾기", href: `/events/${content.uid}/treasure-hunt` });
  }
  if (minigameType === "road_puzzle") {
    points.push({ key: "road-puzzle", label: "철도 연결", href: `/events/${content.uid}/road-puzzle` });
  }
  return points;
}

function isOngoing(startAt: UtcIsoString, endAt: UtcIsoString, now: UtcIsoString): boolean {
  return !isInstantAfter(startAt, now) && isInstantAfter(endAt, now);
}

// 이벤트 slot priority: first/rerun before permanent, event before mini event, then the earlier start.
function compareEventPriority(a: TimelineContent, b: TimelineContent): number {
  const runRank = (content: TimelineContent) => (content.runType === "permanent" ? 1 : 0);
  const typeRank = (content: TimelineContent) => (content.contentType === "mini_event" ? 1 : 0);
  return runRank(a) - runRank(b) || typeRank(a) - typeRank(b) || compareInstantAsc(a.startAt, b.startAt);
}

export type HomeEventSlot = {
  // The hero: the first ongoing event by priority. Null when nothing is ongoing.
  main: TimelineContent | null;
  // The other ongoing events, shown as small tiles under the hero.
  together: TimelineContent[];
  // The next event, only when nothing is ongoing.
  upcoming: TimelineContent | null;
};

// Endless permanent events have no end, so they are left out of the current status.
export function selectHomeEventSlot(contents: TimelineContent[], now: UtcIsoString): HomeEventSlot {
  const candidates = contents.filter(
    (content) => (content.contentType === "event" || content.contentType === "mini_event") && content.endAt !== null,
  );
  const ongoing = candidates
    .filter((content) => content.endAt !== null && isOngoing(content.startAt, content.endAt, now))
    .sort(compareEventPriority);
  if (ongoing.length > 0) {
    const [main, ...together] = ongoing;
    return { main, together, upcoming: null };
  }
  const upcoming = candidates.filter((content) => isInstantAfter(content.startAt, now)).sort(compareEventPriority);
  return { main: null, together: [], upcoming: upcoming[0] ?? null };
}

export type HomeScheduledItem = { startAt: UtcIsoString; endAt: UtcIsoString | null };

// A slot shows every ongoing item. With none, it shows the next single item. An item without an end is never ongoing.
export function selectHomeScheduleSlot<T extends HomeScheduledItem>(
  items: T[],
  now: UtcIsoString,
): { ongoing: T[]; upcoming: T | null } {
  const ongoing = items
    .filter((item) => item.endAt !== null && isOngoing(item.startAt, item.endAt, now))
    .sort((a, b) => compareInstantAsc(a.startAt, b.startAt));
  if (ongoing.length > 0) {
    return { ongoing, upcoming: null };
  }
  const upcoming = items
    .filter((item) => isInstantAfter(item.startAt, now))
    .sort((a, b) => compareInstantAsc(a.startAt, b.startAt));
  return { ongoing: [], upcoming: upcoming[0] ?? null };
}

export type HomeBirthdayCandidate = {
  uid: string;
  name: string;
  // "MM-DD" from the released student's birthday.
  birthday: string;
  // The BAQL character UID of the student: the base student's UID, shared by every skin of the character. Null when BAQL
  // reports none, and the student then stands for itself.
  characterUid: string | null;
};

export type HomeBirthday = {
  uid: string;
  name: string;
  monthDay: string;
  daysUntil: number;
};

// The "MM-DD" of a student birthday. BAQL can return a Date, or a "YYYY-MM-DD" string with any year (such as "0000-10-20").
// A released student without a birthday (null) has no birthday to show, so it returns null and the caller leaves it out.
// Any other value that is not a date throws, so the birthday source reports the failure.
export function toBirthdayMonthDay(birthday: Date | string | null): string | null {
  if (birthday === null || birthday === undefined) {
    return null;
  }
  const iso = birthday instanceof Date ? birthday.toISOString() : birthday;
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  if (!match) {
    throw new Error("student birthday is not a date");
  }
  return `${match[1]}-${match[2]}`;
}

// The birthday list covers the next 30 calendar days, today included, and shows the nearest 5 entries.
export const HOME_BIRTHDAY_WINDOW_DAYS = 30;
export const HOME_BIRTHDAY_LIMIT = 5;

// The "MM-DD" values inside the birthday window. The route uses them to pick the students to look up.
export function getHomeBirthdayMonthDays(todayKey: string, windowDays = HOME_BIRTHDAY_WINDOW_DAYS): string[] {
  return Array.from({ length: windowDays }, (_, offset) => addDaysToDateKey(todayKey, offset).slice(5));
}

// Birthdays within the window from today, counted in the display timezone. Skins of one character merge into one entry,
// grouped by character UID, before the cut. The representative is the base student (its UID is the character UID),
// otherwise the first candidate in UID order. The result is ordered by days until the birthday, then UID, and cut to limit.
export function selectHomeBirthdays(
  candidates: HomeBirthdayCandidate[],
  todayKey: string,
  windowDays = HOME_BIRTHDAY_WINDOW_DAYS,
  limit = HOME_BIRTHDAY_LIMIT,
): HomeBirthday[] {
  const birthdays: HomeBirthday[] = [];
  for (const [offset, monthDay] of getHomeBirthdayMonthDays(todayKey, windowDays).entries()) {
    const matching = candidates
      .filter((candidate) => candidate.birthday === monthDay)
      .sort((a, b) => a.uid.localeCompare(b.uid));
    const groups = new Map<string, HomeBirthdayCandidate[]>();
    for (const candidate of matching) {
      const groupKey = candidate.characterUid ?? candidate.uid;
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), candidate]);
    }
    for (const [groupKey, members] of groups) {
      const representative = members.find((member) => member.uid === groupKey) ?? members[0];
      birthdays.push({ uid: representative.uid, name: representative.name, monthDay, daysUntil: offset });
    }
  }
  return birthdays.sort((a, b) => a.daysUntil - b.daysUntil || a.uid.localeCompare(b.uid)).slice(0, limit);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const time = Date.parse(`${dateKey}T00:00:00Z`) + days * MS_PER_DAY;
  return new Date(time).toISOString().slice(0, 10);
}

// The recruitment group kind label for a group row, such as "복각 픽업 모집". A group without a known kind reads 모집.
export function getHomeRecruitmentKindLabel(
  recruitments: { recruitmentType: string; pickup: boolean; rerun: boolean }[],
): string {
  if (recruitments.some((recruitment) => recruitment.recruitmentType === "recollect")) {
    return "리콜렉트 모집";
  }
  if (recruitments.some((recruitment) => recruitment.recruitmentType === "encore")) {
    return "앙코르 모집";
  }
  const pickup = recruitments.find((recruitment) => recruitment.pickup);
  if (pickup) {
    return pickup.rerun ? "복각 픽업 모집" : "픽업 모집";
  }
  return "모집";
}
