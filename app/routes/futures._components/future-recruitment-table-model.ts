import type { Attack, Defense, RecruitmentTypeEnum, Terrain } from "~/graphql/graphql";
import {
  type UtcIsoString,
  compareInstantAsc,
  formatInstant,
  formatInstantDateKey,
  getInstantTime,
  normalizeTimeZone,
} from "~/lib/date-time";
import dayjs from "~/lib/dayjs";
import { CONTENT_ORDER, SHOW_LINK_CONTENT_TYPES, SHOW_LINK_RAID_TYPES } from "~/models/content-rules";
import type { EventType, RaidType, Role } from "~/models/content.d";

export type FutureRecruitmentTableRecruitment = {
  recruitmentType: RecruitmentTypeEnum;
  pickup: boolean;
  rerun: boolean;
  since: UtcIsoString;
  until: UtcIsoString | null;
  studentName: string;
  favoriteKey: string;
  student: {
    uid: string;
    attackType?: Attack;
    defenseType?: Defense;
    role?: Role;
    schaleDbId?: string | null;
    initialTier?: number;
  } | null;
};

export type FutureRecruitmentTableContent = {
  uid: string;
  recruitmentGroupUid?: string | null;
  name: string;
  link?: string;
  imageUrl?: string | null;
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  endless: boolean;
  contentType: EventType | RaidType | "raid";
  runType: "first" | "rerun" | "permanent";
  confirmed: boolean;
  isSpoiler: boolean;
  tags: string[];
  recruitments: FutureRecruitmentTableRecruitment[];
  raidInfo?: {
    raidType: RaidType;
    boss: string;
    name: string;
    terrain: Terrain;
    attackType: Attack | null;
    defenseTypes: {
      defenseType: Defense;
      difficulty: string | null;
    }[];
  };
};

export type FutureRecruitmentTableRecruitmentGroup = {
  content: FutureRecruitmentTableContent;
  recruitment: FutureRecruitmentTableRecruitment;
  since: UtcIsoString;
  until: UtcIsoString;
};

export type FutureRecruitmentTableRow = {
  since: UtcIsoString;
  until: UtcIsoString;
  recruitments: FutureRecruitmentTableRecruitmentGroup[];
  recruitmentRowSpan: number;
  hideRecruitmentCell: boolean;
  events: FutureRecruitmentTableContent[];
  raids: FutureRecruitmentTableContent[];
  campaigns: FutureRecruitmentTableContent[];
};

export function isFutureRecruitmentTableContentVisible(
  content: FutureRecruitmentTableContent,
  spoilerRevealed: boolean,
): boolean {
  return !content.isSpoiler || spoilerRevealed;
}

export function isFutureRecruitmentTableContentLinkable(
  content: FutureRecruitmentTableContent,
  spoilerRevealed: boolean,
): boolean {
  if (!isFutureRecruitmentTableContentVisible(content, spoilerRevealed)) {
    return false;
  }

  if (content.raidInfo !== undefined) {
    return SHOW_LINK_RAID_TYPES.includes(content.raidInfo.raidType);
  }

  return SHOW_LINK_CONTENT_TYPES.includes(content.contentType);
}

export function formatAuxiliaryContentPeriodLabel({
  contentStartAt,
  contentEndAt,
  contentEndless,
  rowSince,
  rowUntil,
  timeZone,
}: {
  contentStartAt: UtcIsoString;
  contentEndAt: UtcIsoString | null;
  contentEndless: boolean;
  rowSince: UtcIsoString;
  rowUntil: UtcIsoString;
  timeZone: string;
}): string | null {
  const contentSinceDateKey = formatInstantDateKey(contentStartAt, timeZone);
  const contentUntilDateKey = contentEndAt ? formatInstantDateKey(contentEndAt, timeZone) : null;
  const rowSinceDateKey = formatInstantDateKey(rowSince, timeZone);
  const rowUntilDateKey = formatInstantDateKey(rowUntil, timeZone);

  if (contentEndless) {
    if (contentSinceDateKey === rowSinceDateKey) {
      return null;
    }

    return formatInstant(contentStartAt, { timeZone, format: "MM/DD HH:mm" });
  }

  if (contentSinceDateKey === rowSinceDateKey && contentUntilDateKey === rowUntilDateKey) {
    return null;
  }

  const since = formatInstant(contentStartAt, { timeZone, format: "MM/DD HH:mm" });
  const until = contentEndAt ? formatInstant(contentEndAt, { timeZone, format: "MM/DD HH:mm" }) : "미정";
  return `${since} ~ ${until}`;
}

type InternalRecruitmentGroup = FutureRecruitmentTableRecruitmentGroup & {
  contentIndex: number;
  recruitmentIndex: number;
};

type DateKey = string;

function getContentPeriod(content: FutureRecruitmentTableContent): { since: UtcIsoString; until: UtcIsoString } | null {
  if (!content.endAt || getInstantTime(content.startAt) >= getInstantTime(content.endAt)) {
    return null;
  }

  return { since: content.startAt, until: content.endAt };
}

function getRecruitmentPeriod(
  content: FutureRecruitmentTableContent,
  recruitment: FutureRecruitmentTableRecruitment,
): { since: UtcIsoString; until: UtcIsoString } | null {
  const until = recruitment.until ?? content.endAt;
  if (!until || getInstantTime(recruitment.since) >= getInstantTime(until)) {
    return null;
  }

  return { since: recruitment.since, until };
}

function getDateKey(instant: UtcIsoString, timeZone: string): DateKey {
  return formatInstantDateKey(instant, timeZone);
}

function compareDateKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toBoundaryInstant(dateKey: DateKey, timeZone: string): UtcIsoString {
  return dayjs.tz(dateKey, normalizeTimeZone(timeZone)).utc().toISOString();
}

function isRaidContent(content: FutureRecruitmentTableContent): boolean {
  return content.contentType === "raid" || content.raidInfo !== undefined;
}

function isCampaignContent(content: FutureRecruitmentTableContent): boolean {
  return content.contentType === "campaign" || content.contentType === "update";
}

function isEventContent(content: FutureRecruitmentTableContent): boolean {
  return !isRaidContent(content) && !isCampaignContent(content);
}

function isHeldContent(content: FutureRecruitmentTableContent): boolean {
  return content.contentType !== "pickup";
}

function getContentOrderIndex(content: FutureRecruitmentTableContent): number {
  const contentType = content.raidInfo?.raidType ?? content.contentType;
  const index = CONTENT_ORDER.indexOf(contentType);
  return index >= 0 ? index : CONTENT_ORDER.length;
}

function compareContentsByTimelineOrder(
  a: { content: FutureRecruitmentTableContent; contentIndex: number },
  b: { content: FutureRecruitmentTableContent; contentIndex: number },
): number {
  return (
    getContentOrderIndex(a.content) - getContentOrderIndex(b.content) ||
    compareInstantAsc(a.content.startAt, b.content.startAt) ||
    a.contentIndex - b.contentIndex
  );
}

function getRecruitmentCellKey(rowRecruitments: InternalRecruitmentGroup[]): string {
  return rowRecruitments.map((group) => `${group.content.uid}:${group.recruitmentIndex}`).join("|");
}

export function buildFutureRecruitmentTableRows(
  contents: FutureRecruitmentTableContent[],
  timeZone = "UTC",
): FutureRecruitmentTableRow[] {
  const recruitmentGroups: InternalRecruitmentGroup[] = contents.flatMap((content, contentIndex) =>
    content.recruitments.flatMap((recruitment, recruitmentIndex) => {
      const period = getRecruitmentPeriod(content, recruitment);
      if (!period) {
        return [];
      }
      return [{ content, recruitment, since: period.since, until: period.until, contentIndex, recruitmentIndex }];
    }),
  );

  const rowRecruitmentsBySince = new Map<string, InternalRecruitmentGroup[]>();
  for (const group of recruitmentGroups) {
    const sinceKey = getDateKey(group.since, timeZone);
    rowRecruitmentsBySince.set(sinceKey, [...(rowRecruitmentsBySince.get(sinceKey) ?? []), group]);
  }

  const rowPeriods = [...rowRecruitmentsBySince.entries()]
    .map(([sinceKey, rowRecruitments]) => {
      const untilKey = rowRecruitments
        .map((group) => getDateKey(group.until, timeZone))
        .sort(compareDateKeys)
        .at(-1) as DateKey;
      const sortedRecruitments = rowRecruitments.sort(
        (a, b) =>
          compareContentsByTimelineOrder(a, b) ||
          compareDateKeys(getDateKey(a.until, timeZone), getDateKey(b.until, timeZone)) ||
          a.recruitmentIndex - b.recruitmentIndex,
      );

      return {
        since: toBoundaryInstant(sinceKey, timeZone),
        until: toBoundaryInstant(untilKey, timeZone),
        sinceKey,
        untilKey,
        recruitments: sortedRecruitments,
        recruitmentCellKey: getRecruitmentCellKey(sortedRecruitments),
      };
    })
    .sort(
      (a, b) =>
        compareDateKeys(a.sinceKey, b.sinceKey) ||
        compareInstantAsc(a.recruitments[0].since, b.recruitments[0].since) ||
        a.recruitments[0].contentIndex - b.recruitments[0].contentIndex,
    );

  const auxiliaryContentsByRow = new Map<number, { content: FutureRecruitmentTableContent; contentIndex: number }[]>();
  for (const [contentIndex, content] of contents.entries()) {
    if (!isHeldContent(content)) {
      continue;
    }

    const period = getContentPeriod(content);
    if (!period) {
      continue;
    }

    const contentSinceKey = getDateKey(period.since, timeZone);
    const rowIndex = rowPeriods.findIndex((row) => row.sinceKey <= contentSinceKey && contentSinceKey < row.untilKey);
    if (rowIndex >= 0) {
      const contentsForRow = auxiliaryContentsByRow.get(rowIndex) ?? [];
      contentsForRow.push({ content, contentIndex });
      auxiliaryContentsByRow.set(rowIndex, contentsForRow);
    }
  }

  const rows = rowPeriods.map((row, rowIndex) => {
    const auxiliaryContents = (auxiliaryContentsByRow.get(rowIndex) ?? [])
      .sort(compareContentsByTimelineOrder)
      .map((item) => item.content);
    const hideRecruitmentCell = rowIndex > 0 && rowPeriods[rowIndex - 1].recruitmentCellKey === row.recruitmentCellKey;

    return [
      {
        since: row.since,
        until: row.until,
        recruitments: row.recruitments,
        recruitmentCellKey: row.recruitmentCellKey,
        recruitmentRowSpan: 1,
        hideRecruitmentCell,
        events: auxiliaryContents.filter(isEventContent),
        raids: auxiliaryContents.filter(isRaidContent),
        campaigns: auxiliaryContents.filter(isCampaignContent),
      },
    ][0];
  });

  const visibleRows: typeof rows = [];
  for (const row of rows) {
    const hasAuxiliaryContents = row.events.length > 0 || row.raids.length > 0 || row.campaigns.length > 0;
    if (!row.hideRecruitmentCell || hasAuxiliaryContents) {
      visibleRows.push(row);
      continue;
    }

    const previousRow = visibleRows.at(-1);
    if (!previousRow || previousRow.recruitmentCellKey !== row.recruitmentCellKey) {
      continue;
    }

    visibleRows[visibleRows.length - 1] = { ...previousRow, until: row.until };
  }

  return visibleRows.map((row, rowIndex) => {
    if (row.hideRecruitmentCell) {
      return row;
    }

    let recruitmentRowSpan = 1;
    for (let nextIndex = rowIndex + 1; nextIndex < visibleRows.length; nextIndex += 1) {
      if (visibleRows[nextIndex].recruitmentCellKey !== row.recruitmentCellKey) {
        break;
      }
      recruitmentRowSpan += 1;
    }

    return { ...row, recruitmentRowSpan };
  });
}
