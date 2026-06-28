import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useOutletContext } from "react-router";
import { RaidVideosScreen } from "~/components/features/raids";
import { raidTypeFromParam, raidTypeToParam } from "~/domain/raid";
import { fetchRaidVideos } from "~/lib/ranks";
import { getRaidScheduleByTypeAndSeason } from "~/models/raid";
import { RAID_VIDEOS_PAGE_SIZE, getVideoDateRange, parseVideoSort } from "~/models/raid-videos";
import type { RaidPageContext } from "./raids.$raidType.$seasonIndex";
import { useRaidVideosFeed } from "./raids.$raidType.$seasonIndex._components/useRaidVideosFeed";

function createErrorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const loader = async ({ params, request, context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const { raidType, seasonIndex } = params;
  if (!raidType || !seasonIndex) {
    throw createErrorResponse("총력전/대결전 정보를 찾을 수 없어요", 404);
  }

  const parsedSeasonIndex = Number.parseInt(seasonIndex, 10);
  if (Number.isNaN(parsedSeasonIndex)) {
    throw createErrorResponse("총력전/대결전 정보를 찾을 수 없어요", 404);
  }

  const currentRaid = await getRaidScheduleByTypeAndSeason(env, raidTypeFromParam(raidType), parsedSeasonIndex);
  if (!currentRaid) {
    throw createErrorResponse("총력전/대결전 정보를 찾을 수 없어요", 404);
  }

  const url = new URL(request.url);
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
      limit: RAID_VIDEOS_PAGE_SIZE,
      offset: 0,
      sort,
    });
  } catch {
    throw createErrorResponse("공략 영상을 불러오는 중 오류가 발생했어요", 500);
  }
};

export default function RaidVideos() {
  const { currentRaid } = useOutletContext<RaidPageContext>();
  const initialData = useLoaderData<typeof loader>();
  const { allVideos, hasMore, isLoading, loadingRef, sort, setSort } = useRaidVideosFeed({
    initialData,
    raidType: raidTypeToParam(currentRaid.raidType),
    seasonIndex: currentRaid.seasonIndex,
  });

  return (
    <RaidVideosScreen
      videos={allVideos}
      hasMore={hasMore}
      sort={sort}
      setSort={setSort}
      isLoading={isLoading}
      loadingRef={loadingRef}
    />
  );
}
