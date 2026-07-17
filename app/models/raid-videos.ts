import dayjs from "dayjs";
import type { Defense } from "~/graphql/graphql";
import { formatInstantDateKey } from "~/lib/date-time";
import type { ParsedRaidRankDocument } from "~/lib/ranks/ranks";
import { getRaidSchedule } from "~/models/raid";

type RaidSchedule = NonNullable<Awaited<ReturnType<typeof getRaidSchedule>>>;

export type VideoSort = "published_at_desc" | "score_desc";

export const DEFAULT_VIDEO_SORT: VideoSort = "score_desc";
export const RAID_VIDEOS_PAGE_SIZE = 20;
const YOUTUBE_SEARCH_TIME_ZONE = "Asia/Tokyo";
const YOUTUBE_SEARCH_END_PADDING_DAYS = 3;

const raidTypeSearchName: Record<string, string> = {
  total_assault: "総力戦",
  elimination: "大決戦",
  unlimit: "制約解除決戦",
};

const defenseTypeSearchName: Partial<Record<Defense, string>> = {
  light: "軽装備",
  heavy: "重装甲",
  special: "特殊装甲",
  elastic: "弾力装甲",
};

export type RaidVideoRankMatch = {
  rank: number;
  finalRank: number;
  parties: ParsedRaidRankDocument["parties"];
};

export type RaidVideoSourceParties = {
  source: string;
  parties: ParsedRaidRankDocument["parties"];
};

export type RaidVideoRankHint = {
  rank: number;
};

export type RaidVideoItem = {
  title: string;
  channelTitle: string;
  score?: number;
  youtubeId: string;
  thumbnailUrl: string;
  publishedAt: string;
  defenseType?: Defense;
  sourceParties?: RaidVideoSourceParties[];
  rankMatch?: RaidVideoRankMatch;
  rankHint?: RaidVideoRankHint;
};

export type RaidVideosData = {
  videos: RaidVideoItem[];
  total: number;
  hasMore: boolean;
} | null;

export function isVideoSort(value: string | null | undefined): value is VideoSort {
  return value === "published_at_desc" || value === "score_desc";
}

export function parseVideoSort(value: string | null | undefined): VideoSort {
  return isVideoSort(value) ? value : DEFAULT_VIDEO_SORT;
}

export function getRaidVideoParties(
  video: Pick<RaidVideoItem, "rankMatch" | "sourceParties">,
): ParsedRaidRankDocument["parties"] {
  if ((video.rankMatch?.parties.length ?? 0) > 0) {
    return video.rankMatch?.parties ?? [];
  }

  return video.sourceParties?.find(({ parties }) => parties.length > 0)?.parties ?? [];
}

export function buildRaidYoutubeSearchUrl({
  raidType,
  bossName,
  defenseType,
  from,
  to,
}: {
  raidType: string;
  bossName: string;
  defenseType: Defense;
  from: string;
  to: string;
}): string | null {
  const raidTypeName = raidTypeSearchName[raidType];
  const defenseTypeName = defenseTypeSearchName[defenseType];
  if (!raidTypeName || !bossName.trim() || !defenseTypeName) {
    return null;
  }

  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set(
    "search_query",
    `${raidTypeName} ${bossName.trim()} ${defenseTypeName} after:${from} before:${to}`,
  );
  return url.toString();
}

export async function getVideoDateRange(
  env: Env,
  schedule: Pick<RaidSchedule, "jpSchedule">,
  forceRefresh = false,
): Promise<{
  from: string;
  to: string;
  youtubeSearchFrom: string;
  youtubeSearchTo: string | null;
} | null> {
  const jpScheduleUid = schedule.jpSchedule?.uid;
  if (!jpScheduleUid) {
    return null;
  }

  const jpSchedule = await getRaidSchedule(env, jpScheduleUid, forceRefresh);
  if (!jpSchedule?.startAt) {
    return null;
  }

  const from = dayjs(jpSchedule.startAt);
  if (!from.isValid()) {
    return null;
  }
  const end = jpSchedule.endAt ? dayjs(jpSchedule.endAt) : null;

  return {
    from: from.toISOString(),
    to: from.add(28, "day").toISOString(),
    youtubeSearchFrom: formatInstantDateKey(jpSchedule.startAt, YOUTUBE_SEARCH_TIME_ZONE),
    youtubeSearchTo:
      end?.isValid() === true
        ? formatInstantDateKey(end.add(YOUTUBE_SEARCH_END_PADDING_DAYS, "day").toISOString(), YOUTUBE_SEARCH_TIME_ZONE)
        : null,
  };
}
