import { raidTypeToParam } from "~/domain/raid";
import { getRecruitmentPeriodNoticeKind, type RecruitmentPeriod } from "~/domain/recruitment-period-notice";
import {
  formatInstant,
  formatInstantDateKey,
  getInstantTime,
  isInstantAfter,
  isInstantBefore,
  parseUtcTimestamp,
  type UtcIsoString,
} from "~/lib/date-time";
import type { EventType, RaidType } from "~/models/content.d";
import { SHOW_LINK_CONTENT_TYPES, SHOW_LINK_RAID_TYPES } from "~/models/content-rules";
import type { ContentFilterState } from "./content-filter-state";

// Favorite counts from this value on are shown in 만 units, such as 1.2만.
const FAVORITE_COUNT_MAN_THRESHOLD = 10000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatThousands(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatFavoriteCount(count: number): string {
  if (count >= FAVORITE_COUNT_MAN_THRESHOLD) {
    return `${(count / FAVORITE_COUNT_MAN_THRESHOLD).toFixed(1)}만`;
  }
  return formatThousands(count);
}

export type FavoriteLabelState = {
  // A label with no count and no completion is hidden.
  visible: boolean;
  icon: "completed" | "favorited" | "unfavorited";
  countText: string | null;
  accessibleName: string;
};

// Completed shows the check only, even when the student is also a favorite. Personal state is read only when the
// viewer is signed in, so guests get the public count alone. An unknown count (null, when the count source failed) shows
// no count: the viewer's own state still shows, and the label never reads a count of its own.
export function getFavoriteLabelState({
  count,
  favorited,
  completed,
  signedIn,
}: {
  count: number | null;
  favorited: boolean;
  completed: boolean;
  signedIn: boolean;
}): FavoriteLabelState {
  const personalCompleted = signedIn && completed;
  const personalFavorited = signedIn && favorited;
  const icon = personalCompleted ? "completed" : personalFavorited ? "favorited" : "unfavorited";
  const stateText = personalCompleted ? ", 모집 완료" : personalFavorited ? ", 내 관심 등록" : "";
  if (count === null) {
    return {
      visible: personalCompleted || personalFavorited,
      icon,
      countText: null,
      accessibleName: `관심 학생${stateText}`,
    };
  }
  return {
    visible: personalCompleted || count > 0,
    icon,
    countText: count > 0 ? formatFavoriteCount(count) : null,
    accessibleName: `관심 학생 ${formatThousands(count)}명${stateText}`,
  };
}

// The recruitment types whose label reads "신규" without a rerun, as recruitmentLabelLocale reads them. A test keeps the
// two in step.
const NEW_RECRUITMENT_TYPES = ["usual", "limited", "fes"];

export function isNewRecruitment({ recruitmentType, rerun }: { recruitmentType: string; rerun: boolean }): boolean {
  return !rerun && NEW_RECRUITMENT_TYPES.includes(recruitmentType);
}

export type FutureMediaSource =
  | { kind: "placeholder" }
  | { kind: "boss"; boss: string }
  | { kind: "logo"; contentUid: string }
  | { kind: "type" };

// Raids show the boss image. Events show their logo when one exists. Anything else shows the type icon. A hidden
// spoiler shows an empty placeholder.
export function selectFutureMediaSource({
  hidden,
  isRaid,
  boss,
  logoContentUid,
}: {
  hidden: boolean;
  isRaid: boolean;
  boss: string | null;
  logoContentUid: string | null;
}): FutureMediaSource {
  if (hidden) {
    return { kind: "placeholder" };
  }
  if (isRaid) {
    return boss ? { kind: "boss", boss } : { kind: "type" };
  }
  return logoContentUid ? { kind: "logo", contentUid: logoContentUid } : { kind: "type" };
}

export function getFutureContentLink(content: {
  contentType: EventType | RaidType;
  raidInfo?: { raidType: RaidType; seasonIndex?: number } | undefined;
  uid: string;
}): string {
  if (content.contentType !== "raid") {
    return `/events/${content.uid}`;
  }

  return content.raidInfo?.seasonIndex != null
    ? `/raids/${raidTypeToParam(content.raidInfo.raidType)}/${content.raidInfo.seasonIndex}`
    : "/raids";
}

// A title links to the detail page only for linkable types, and never while a spoiler is hidden.
export function isFutureContentLinkable({
  contentType,
  raidInfo,
  isSpoiler = false,
  spoilerRevealed = true,
}: {
  contentType: EventType | RaidType;
  raidInfo?: { raidType: string };
  isSpoiler?: boolean;
  spoilerRevealed?: boolean;
}): boolean {
  const linkableType =
    (raidInfo !== undefined && SHOW_LINK_RAID_TYPES.includes(raidInfo.raidType)) ||
    SHOW_LINK_CONTENT_TYPES.includes(contentType);
  return linkableType && (!isSpoiler || spoilerRevealed);
}

export function isContentFilterActive(filter: ContentFilterState): boolean {
  return filter.types.length > 0 || filter.onlyPickups;
}

export function matchesContentFilter(
  content: {
    contentType: EventType | RaidType;
    raidInfo?: { raidType: RaidType } | undefined;
    recruitments: { pickup: boolean }[];
  },
  filter: ContentFilterState,
): boolean {
  const effectiveType = content.raidInfo?.raidType ?? content.contentType;
  if (filter.types.length > 0 && !filter.types.includes(effectiveType)) {
    return false;
  }
  if (filter.onlyPickups && !content.recruitments.some((recruitment) => recruitment.pickup)) {
    return false;
  }
  return true;
}

export type FilterSummary = { kind: "all"; total: number } | { kind: "filtered"; total: number; shown: number };

// The count is withheld (null) when the content list failed to load, so no count is ever invented.
export function getFilterSummary({
  total,
  shown,
  active,
}: {
  total: number | null;
  shown: number;
  active: boolean;
}): FilterSummary | null {
  if (total === null) {
    return null;
  }
  return active ? { kind: "filtered", total, shown } : { kind: "all", total };
}

function dayDifference(from: UtcIsoString, to: UtcIsoString, timeZone: string): number {
  const fromKey = formatInstantDateKey(from, timeZone);
  const toKey = formatInstantDateKey(to, timeZone);
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / MS_PER_DAY);
}

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function getWeekdayLabel(value: UtcIsoString, timeZone: string): string {
  return weekdayLabels[parseUtcTimestamp(value).tz(timeZone).day()];
}

// Day dividers show `MM/DD (요일)` and the days until the date, and `오늘` for the current day.
export function getDayDividerParts(
  since: UtcIsoString,
  now: UtcIsoString,
  timeZone: string,
): { dateText: string; relativeText: string } {
  const days = dayDifference(now, since, timeZone);
  return {
    dateText: `${formatInstant(since, { timeZone, format: "MM/DD" })} (${getWeekdayLabel(since, timeZone)})`,
    relativeText: days <= 0 ? "오늘" : `${days}일 후`,
  };
}

export type RemainingTime =
  | { kind: "days"; days: number; soon: false }
  | { kind: "tomorrow"; soon: false }
  | { kind: "hours"; hours: number; soon: true };

// Only ongoing items show remaining time. Under two days counts as ending soon, as in the 1.x timeline.
export function getRemainingTime(until: UtcIsoString, now: UtcIsoString, timeZone: string): RemainingTime {
  const days = dayDifference(now, until, timeZone);
  if (days >= 2) {
    return { kind: "days", days, soon: false };
  }
  if (days === 1) {
    return { kind: "tomorrow", soon: false };
  }
  const hours = parseUtcTimestamp(until)
    .tz(timeZone)
    .startOf("hour")
    .diff(parseUtcTimestamp(now).tz(timeZone).startOf("hour"), "hour");
  return { kind: "hours", hours: Math.max(0, hours), soon: true };
}

export function isOngoingFutureContent(since: UtcIsoString, until: UtcIsoString | null, now: UtcIsoString): boolean {
  return isInstantBefore(since, now) && (until === null || isInstantAfter(until, now));
}

// The header meta uses the latest end among contents that have a concrete end. Endless-only lists have no meta.
export function getFutureHeaderMeta({
  contents,
  now,
  timeZone,
}: {
  contents: { endAt: UtcIsoString | null; endless: boolean }[];
  now: UtcIsoString;
  timeZone: string;
}): { endLabel: string; daysLeft: number } | null {
  let latest: UtcIsoString | null = null;
  for (const content of contents) {
    if (content.endless || content.endAt === null) {
      continue;
    }
    if (latest === null || getInstantTime(content.endAt) > getInstantTime(latest)) {
      latest = content.endAt;
    }
  }
  if (latest === null) {
    return null;
  }
  return {
    endLabel: formatInstant(latest, { timeZone, format: "MM/DD" }),
    daysLeft: dayDifference(now, latest, timeZone),
  };
}

export type FutureSpecialCase =
  | { kind: "perk-free-100" }
  | { kind: "caution-ended" }
  | { kind: "caution-period"; range: string };

// The caution line for a special case, or null when the case has no caution line.
export function getCautionText(specialCase: FutureSpecialCase): string | null {
  if (specialCase.kind === "caution-ended") {
    return "모집 종료";
  }
  if (specialCase.kind === "caution-period") {
    return `모집 기간 · ${specialCase.range}`;
  }
  return null;
}

export function getFutureSpecialCases({
  contentType,
  tags,
  recruitments,
  recruitmentGroupUid,
  recruitmentPeriod,
  since,
  until,
  endless,
  now,
  timeZone,
}: {
  contentType: EventType | RaidType;
  tags: string[];
  recruitments: { until: UtcIsoString | null }[];
  recruitmentGroupUid?: string | null;
  recruitmentPeriod?: RecruitmentPeriod | null;
  since: UtcIsoString;
  until: UtcIsoString | null;
  endless: boolean;
  now: UtcIsoString;
  timeZone: string;
}): FutureSpecialCase[] {
  const cases: FutureSpecialCase[] = [];
  if (
    tags.includes("recruit_free_100") &&
    recruitments.every((recruitment) => recruitment.until !== null && isInstantAfter(recruitment.until, now))
  ) {
    cases.push({ kind: "perk-free-100" });
  }

  const noticeKind = getRecruitmentPeriodNoticeKind(
    { recruitmentGroupUid, contentType, startAt: since, endAt: until, endless },
    recruitmentPeriod,
    now,
  );
  if (noticeKind !== null && recruitmentPeriod) {
    if (noticeKind === "ended") {
      cases.push({ kind: "caution-ended" });
    } else {
      const start = formatInstant(recruitmentPeriod.startAt, { timeZone, format: "MM/DD" });
      const end = recruitmentPeriod.endAt
        ? formatInstant(recruitmentPeriod.endAt, { timeZone, format: "MM/DD" })
        : "미정";
      cases.push({ kind: "caution-period", range: `${start} ~ ${end}` });
    }
  }
  return cases;
}

export function getFutureFavoriteKeyForStudentAnalysis(
  recruitments: { pickup: boolean; student: unknown; since: UtcIsoString; favoriteKey: string }[],
  now: UtcIsoString,
): string | null {
  const target = recruitments
    .filter(
      (recruitment) => recruitment.pickup && recruitment.student !== null && isInstantAfter(recruitment.since, now),
    )
    .sort((a, b) => getInstantTime(a.since) - getInstantTime(b.since))[0];
  return target?.favoriteKey ?? null;
}

export function getFuturePendingStudentFavoriteKey(
  recruitments: { student: unknown; favoriteKey: string }[],
): string | null {
  return (
    recruitments.find((recruitment) => recruitment.student === null && recruitment.favoriteKey)?.favoriteKey ?? null
  );
}

export type RecruitmentPeriodGroup<T> = {
  key: string;
  since: UtcIsoString;
  until: UtcIsoString | null;
  recruitments: T[];
};

// Recruitments group by their own period, in first-seen order.
export function groupRecruitmentsByPeriod<T extends { since: UtcIsoString; until: UtcIsoString | null }>(
  recruitments: readonly T[],
  timeZone: string,
): RecruitmentPeriodGroup<T>[] {
  const groups = new Map<string, RecruitmentPeriodGroup<T>>();
  for (const recruitment of recruitments) {
    const sinceKey = formatInstantDateKey(recruitment.since, timeZone);
    const untilKey = recruitment.until ? formatInstantDateKey(recruitment.until, timeZone) : "null";
    const key = `${sinceKey}-${untilKey}`;
    const group = groups.get(key) ?? { key, since: recruitment.since, until: recruitment.until, recruitments: [] };
    group.recruitments.push(recruitment);
    groups.set(key, group);
  }
  return [...groups.values()];
}

// Pickup students come first. At most `max` faces show, and the rest count as `+N`.
export function getFaceStack<T extends { pickup: boolean }>(
  items: readonly T[],
  max = 3,
): { shown: T[]; extra: number } {
  const ordered = [...items.filter((item) => item.pickup), ...items.filter((item) => !item.pickup)];
  return { shown: ordered.slice(0, max), extra: Math.max(0, ordered.length - max) };
}

// Endless main and mini stories are dated by their release, so they read "MM/DD 공개". Other open-ended dates read "MM/DD부터".
export function isStoryContentType(contentType: string): boolean {
  return contentType === "main_story" || contentType === "mini_story";
}

export function formatOpenEndedStart(startLabel: string, contentType: string): string {
  return isStoryContentType(contentType) ? `${startLabel} 공개` : `${startLabel}부터`;
}

// The period of a content or a list row, as both the timeline and the list show it. Open-ended dates (no end, or
// endless) read `MM/DD부터`, or `MM/DD 공개` for endless main and mini stories. Hidden spoilers show the same period.
export function formatContentPeriod({
  since,
  until,
  endless,
  contentType,
  timeZone,
}: {
  since: UtcIsoString;
  until: UtcIsoString | null;
  endless: boolean;
  contentType: string;
  timeZone: string;
}): string {
  const start = formatInstant(since, { timeZone, format: "MM/DD" });
  if (endless || until === null) {
    return formatOpenEndedStart(start, contentType);
  }
  return `${start} ~ ${formatInstant(until, { timeZone, format: "MM/DD" })}`;
}
