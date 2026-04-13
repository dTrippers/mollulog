import type { LoaderFunctionArgs } from "react-router";
import { fetchRaidVideos } from "~/lib/ranks";
import { getVideoDateRange } from "~/models/raid-videos";
import { RAID_VIDEOS_PAGE_SIZE, RaidRepository, type RaidVideosData, parseVideoSort } from "~/repositories";

export type { RaidVideosData };

function createErrorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const loader = async ({ params, request, context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const { raidType, seasonIndex } = params;
  const raidRepository = new RaidRepository(env);
  if (!raidType || !seasonIndex) {
    throw createErrorResponse("총력전/대결전 정보를 찾을 수 없어요", 404);
  }

  const parsedSeasonIndex = Number.parseInt(seasonIndex, 10);
  if (Number.isNaN(parsedSeasonIndex)) {
    throw createErrorResponse("총력전/대결전 정보를 찾을 수 없어요", 404);
  }

  const currentRaid = await raidRepository.getByTypeAndSeason(raidType, parsedSeasonIndex);
  if (!currentRaid) {
    throw createErrorResponse("총력전/대결전 정보를 찾을 수 없어요", 404);
  }

  const url = new URL(request.url);
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") || String(RAID_VIDEOS_PAGE_SIZE), 10);
  const parsedOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
  const limit = Number.isNaN(parsedLimit) ? RAID_VIDEOS_PAGE_SIZE : parsedLimit;
  const offset = Number.isNaN(parsedOffset) ? 0 : parsedOffset;
  const sort = parseVideoSort(url.searchParams.get("sort"));
  const videoDateRange = await getVideoDateRange(env, currentRaid);
  if (!videoDateRange) {
    return null;
  }

  try {
    return await fetchRaidVideos({
      raidType: currentRaid.raidType,
      boss: currentRaid.raidBoss.uid,
      from: videoDateRange.from,
      to: videoDateRange.to,
      limit,
      offset,
      sort,
    });
  } catch {
    throw createErrorResponse("공략 영상을 불러오는 중 오류가 발생했어요", 500);
  }
};
