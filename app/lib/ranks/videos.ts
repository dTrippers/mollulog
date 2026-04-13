import type { RaidVideosData, VideoSort } from "~/models/raid-videos";
import { DEFAULT_VIDEO_SORT, RAID_VIDEOS_PAGE_SIZE } from "~/models/raid-videos";
import { RANK_API_BASE_URL } from "./base";

export type VideosApiResponse = {
  videos?: Array<{
    youtubeId?: string | null;
    title?: string | null;
    channelTitle?: string | null;
    thumbnailUrl?: string | null;
    publishedAt?: string | null;
    raidType?: string | null;
    boss?: string | null;
    defenseType?: string | null;
    score?: number | null;
  }> | null;
  total?: number | null;
  hasMore?: boolean | null;
};

export type RaidVideosQueryOptions = {
  raidType: string;
  boss: string;
  defenseType?: string;
  from: string;
  to: string;
  limit?: number;
  offset?: number;
  sort?: VideoSort;
};

export async function fetchRaidVideos({
  raidType,
  boss,
  defenseType,
  from,
  to,
  limit = RAID_VIDEOS_PAGE_SIZE,
  offset = 0,
  sort = DEFAULT_VIDEO_SORT,
}: RaidVideosQueryOptions): Promise<Exclude<RaidVideosData, null>> {
  const url = new URL("/v1/videos", RANK_API_BASE_URL);
  url.searchParams.set("raidType", raidType);
  url.searchParams.set("boss", boss);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 100)));
  url.searchParams.set("offset", String(Math.max(offset, 0)));
  url.searchParams.set("sort", sort);

  if (defenseType) {
    url.searchParams.set("defenseType", defenseType);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch raid videos: ${response.status}`);
  }

  const data = (await response.json()) as VideosApiResponse;
  return {
    videos:
      data.videos?.map((video) => ({
        title: video.title ?? "",
        channelTitle: video.channelTitle ?? "",
        score: typeof video.score === "number" ? video.score : undefined,
        youtubeId: video.youtubeId ?? "",
        thumbnailUrl: video.thumbnailUrl ?? "",
        publishedAt: video.publishedAt ?? "",
      })) ?? [],
    total: data.total ?? 0,
    hasMore: data.hasMore ?? false,
  };
}
