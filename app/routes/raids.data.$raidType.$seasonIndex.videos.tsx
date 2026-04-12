import type { LoaderFunctionArgs } from "react-router";
import type { VideoSortEnum } from "~/graphql/graphql";
import { RaidRepository } from "~/repositories";
export type RaidVideosData = Awaited<ReturnType<RaidRepository["getVideos"]>>;

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
  const parsedFirst = Number.parseInt(url.searchParams.get("first") || "20", 10);
  const first = Number.isNaN(parsedFirst) ? 20 : parsedFirst;
  const after = url.searchParams.get("after");
  const sort = (url.searchParams.get("sort") || "PUBLISHED_AT_DESC") as VideoSortEnum;

  try {
    return await raidRepository.getVideos(currentRaid.uid, { first, after, sort });
  } catch {
    throw new Response("Error fetching raid videos", { status: 500 });
  }
};
