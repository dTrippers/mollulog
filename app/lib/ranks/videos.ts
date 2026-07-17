import { Defense } from "~/graphql/graphql";
import { fetchWithTimeout, readBodyWithTimeout } from "~/lib/fetch-timeout";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import type { RaidVideosData, VideoSort } from "~/models/raid-videos";
import { DEFAULT_VIDEO_SORT, RAID_VIDEOS_PAGE_SIZE } from "~/models/raid-videos";
import { RANK_API_BASE_URL } from "./base";
import { convertRawPartySlot, type RawPartySlotStudent } from "./ranks";

export type RankMatchApiResponse = {
  raidType?: string | null;
  season?: number | null;
  defenseType?: string | null;
  rank?: number | null;
  finalRank?: number | null;
  parties?: Array<{ students?: RawPartySlotStudent[] | null } | null> | null;
};

type SourcePartySlotStudent = {
  uid?: string | null;
};

export type SourcePartiesApiResponse = {
  source?: string | null;
  parties?: Array<{ students?: SourcePartySlotStudent[] | null } | null> | null;
};

export type RankHintApiResponse = {
  rank?: number | null;
};

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
    sourceParties?: SourcePartiesApiResponse[] | null;
    rankMatch?: RankMatchApiResponse | null;
    rankHint?: RankHintApiResponse | null;
  }> | null;
  total?: number | null;
  hasMore?: boolean | null;
};

export type RaidVideosQueryOptions = {
  raidType: string;
  boss: string;
  defenseType?: string;
  from?: string;
  to?: string;
  scoreGte?: number;
  scoreLt?: number;
  limit?: number;
  offset?: number;
  sort?: VideoSort;
};

const RANK_VIDEOS_FETCH_TIMEOUT_MS = RUNTIME_TIMEOUTS.external.ranksVideosFetch;
const RANK_VIDEOS_BODY_TIMEOUT_MS = RUNTIME_TIMEOUTS.external.ranksVideosBody;
const RAID_VIDEO_DEFENSE_TYPES = new Set<Defense>([
  Defense.Light,
  Defense.Heavy,
  Defense.Special,
  Defense.Elastic,
  Defense.Composite,
  Defense.Normal,
]);

function parseRaidVideoDefenseType(value: string | null | undefined): Defense | null {
  return value && RAID_VIDEO_DEFENSE_TYPES.has(value as Defense) ? (value as Defense) : null;
}

export async function fetchRaidVideos({
  raidType,
  boss,
  defenseType,
  from,
  to,
  scoreGte,
  scoreLt,
  limit = RAID_VIDEOS_PAGE_SIZE,
  offset = 0,
  sort = DEFAULT_VIDEO_SORT,
}: RaidVideosQueryOptions): Promise<Exclude<RaidVideosData, null>> {
  const url = new URL("/v1/videos", RANK_API_BASE_URL);
  url.searchParams.set("raidType", raidType);
  url.searchParams.set("boss", boss);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 100)));
  url.searchParams.set("offset", String(Math.max(offset, 0)));
  url.searchParams.set("sort", sort);

  if (defenseType) {
    url.searchParams.set("defenseType", defenseType);
  }
  if (from) {
    url.searchParams.set("from", from);
  }
  if (to) {
    url.searchParams.set("to", to);
  }
  if (scoreGte !== undefined) {
    url.searchParams.set("scoreGte", String(scoreGte));
  }
  if (scoreLt !== undefined) {
    url.searchParams.set("scoreLt", String(scoreLt));
  }

  const response = await fetchWithTimeout(url, {}, RANK_VIDEOS_FETCH_TIMEOUT_MS, "ranks.videos.fetch", {
    url: url.toString(),
  });
  if (!response.ok) {
    throw new Error(`failed to fetch raid videos: ${response.status}`);
  }

  const data = (await readBodyWithTimeout(() => response.json(), RANK_VIDEOS_BODY_TIMEOUT_MS, "ranks.videos.body", {
    url: url.toString(),
  })) as VideosApiResponse;
  return {
    videos:
      data.videos?.map((video) => {
        const defenseType = parseRaidVideoDefenseType(video.defenseType);
        return {
          title: video.title ?? "",
          channelTitle: video.channelTitle ?? "",
          score: typeof video.score === "number" ? video.score : undefined,
          youtubeId: video.youtubeId ?? "",
          thumbnailUrl: video.thumbnailUrl ?? "",
          publishedAt: video.publishedAt ?? "",
          ...(defenseType ? { defenseType } : {}),
          sourceParties: video.sourceParties?.map((source) => ({
            source: source.source ?? "",
            parties: (source.parties ?? []).map((party, partyIndex) => ({
              partyIndex,
              slots: (party?.students ?? []).map((slot, slotIndex) => ({
                slotIndex,
                tier: null,
                level: null,
                isAssist: null,
                studentUid: slot?.uid ?? null,
              })),
            })),
          })),
          rankMatch: video.rankMatch
            ? {
                rank: video.rankMatch.rank ?? 0,
                finalRank: video.rankMatch.finalRank ?? 0,
                parties: (video.rankMatch.parties ?? []).map((party, partyIndex) => ({
                  partyIndex,
                  slots: (party?.students ?? []).map((slot, slotIndex) => convertRawPartySlot(slot, slotIndex)),
                })),
              }
            : undefined,
          rankHint:
            typeof video.rankHint?.rank === "number" && video.rankHint.rank > 0
              ? { rank: video.rankHint.rank }
              : undefined,
        };
      }) ?? [],
    total: data.total ?? 0,
    hasMore: data.hasMore ?? false,
  };
}
