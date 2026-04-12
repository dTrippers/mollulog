import { useLoaderData, useOutletContext } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { RaidVideosScreen } from "~/components/features/raids";
import type { VideoSortEnum } from "~/graphql/graphql";
import { raidTypeToParam } from "~/models/raid";
import { RaidRepository } from "~/repositories";
import type { RaidPageContext } from "./raids.$raidType.$seasonIndex";
import { useRaidVideosFeed } from "./raids.$raidType.$seasonIndex._components/useRaidVideosFeed";

export const loader = async ({ params, request, context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const { raidType, seasonIndex } = params;
  const raidRepository = new RaidRepository(env);
  if (!raidType || !seasonIndex) {
    throw new Response("Raid params are required", { status: 400 });
  }

  const parsedSeasonIndex = Number.parseInt(seasonIndex, 10);
  if (Number.isNaN(parsedSeasonIndex)) {
    throw new Response("Raid params are required", { status: 400 });
  }

  const currentRaid = await raidRepository.getByTypeAndSeason(raidType, parsedSeasonIndex);
  if (!currentRaid) {
    throw new Response("Raid not found", { status: 404 });
  }

  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const sort = (url.searchParams.get("sort") || "PUBLISHED_AT_DESC") as VideoSortEnum;

  try {
    return await raidRepository.getVideos(currentRaid.uid, { first: 12, after, sort });
  } catch {
    throw new Response("Error fetching raid videos", { status: 500 });
  }
};

export default function RaidVideos() {
  const { currentRaid } = useOutletContext<RaidPageContext>();
  const initialData = useLoaderData<typeof loader>();
  const { allVideos, endCursor, hasNextPage, isLoading, loadingRef, sort, setSort } = useRaidVideosFeed({
    initialData,
    raidType: raidTypeToParam(currentRaid.raidType),
    seasonIndex: currentRaid.seasonIndex,
  });

  return (
    <RaidVideosScreen
      videos={allVideos}
      pageInfo={{
        hasNextPage,
        hasPreviousPage: false,
        startCursor: null,
        endCursor,
      }}
      sort={sort}
      setSort={setSort}
      isLoading={isLoading}
      loadingRef={loadingRef}
    />
  );
}
