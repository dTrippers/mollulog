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

function getDateKey(instant: UtcIsoString, timeZone: string): DateKey {
  return formatInstantDateKey(instant, timeZone);
}

function compareDateKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function addDaysToDateKey(dateKey: DateKey, days: number, timeZone: string): DateKey {
  return dayjs.tz(dateKey, normalizeTimeZone(timeZone)).add(days, "day").format("YYYY-MM-DD");
}

function addWeeklyBoundaryKeys(
  boundaryKeys: Set<DateKey>,
  sinceKey: DateKey,
  untilKey: DateKey,
  timeZone: string,
): void {
  boundaryKeys.add(sinceKey);
  boundaryKeys.add(untilKey);

  for (
    let currentKey = addDaysToDateKey(sinceKey, 7, timeZone);
    currentKey < untilKey;
    currentKey = addDaysToDateKey(currentKey, 7, timeZone)
  ) {
    boundaryKeys.add(currentKey);
  }
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
      const period = getContentPeriod(content);
      if (!period) {
        return [];
      }
      return [{ content, recruitment, since: period.since, until: period.until, contentIndex, recruitmentIndex }];
    }),
  );

  const boundaryKeys = new Set<DateKey>();
  for (const group of recruitmentGroups) {
    addWeeklyBoundaryKeys(boundaryKeys, getDateKey(group.since, timeZone), getDateKey(group.until, timeZone), timeZone);
  }
  const boundaries = [...boundaryKeys].sort(compareDateKeys);

  const rowPeriods = boundaries.slice(0, -1).flatMap((sinceKey, index) => {
    const untilKey = boundaries[index + 1];
    const rowRecruitments = recruitmentGroups
      .filter((group) => getDateKey(group.since, timeZone) < untilKey && getDateKey(group.until, timeZone) > sinceKey)
      .sort(
        (a, b) =>
          compareContentsByTimelineOrder(a, b) ||
          compareInstantAsc(a.since, b.since) ||
          a.recruitmentIndex - b.recruitmentIndex,
      );

    if (rowRecruitments.length === 0) {
      return [];
    }

    return [
      {
        since: toBoundaryInstant(sinceKey, timeZone),
        until: toBoundaryInstant(untilKey, timeZone),
        sinceKey,
        untilKey,
        recruitments: rowRecruitments,
        recruitmentCellKey: getRecruitmentCellKey(rowRecruitments),
      },
    ];
  });

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
