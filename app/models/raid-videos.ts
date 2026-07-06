import dayjs from "dayjs";
import type { ParsedRaidRankDocument } from "~/lib/ranks/ranks";
import { getRaidSchedule } from "~/models/raid";

type RaidSchedule = NonNullable<Awaited<ReturnType<typeof getRaidSchedule>>>;

export type VideoSort = "published_at_desc" | "score_desc";

export const DEFAULT_VIDEO_SORT: VideoSort = "score_desc";
export const RAID_VIDEOS_PAGE_SIZE = 20;

export type RaidVideoRankMatch = {
  rank: number;
  finalRank: number;
  parties: ParsedRaidRankDocument["parties"];
};

export type RaidVideoItem = {
  title: string;
  channelTitle: string;
  score?: number;
  youtubeId: string;
  thumbnailUrl: string;
  publishedAt: string;
  rankMatch?: RaidVideoRankMatch;
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

export async function getVideoDateRange(
  env: Env,
  schedule: Pick<RaidSchedule, "jpSchedule">,
  forceRefresh = false,
): Promise<{ from: string; to: string } | null> {
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

  return {
    from: from.toISOString(),
    to: from.add(28, "day").toISOString(),
  };
}
