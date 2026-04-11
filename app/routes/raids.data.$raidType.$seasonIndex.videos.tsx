import type { LoaderFunctionArgs } from "react-router";
import { graphql } from "~/graphql";
import type { VideoSortEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { RaidRepository } from "~/repositories";

const raidScheduleVideosQuery = graphql(`
  query RaidScheduleVideosData($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {
    raidSchedule(uid: $uid) {
      videos(first: $first, after: $after, sort: $sort) {
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        edges {
          node { id title score youtubeId thumbnailUrl publishedAt }
        }
      }
    }
  }
`);

export type RaidVideosData = {
  videos: {
    id: string;
    title: string;
    score: number;
    youtubeId: string;
    thumbnailUrl: string;
    publishedAt: string;
  }[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
} | null;

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
  const first = Number.parseInt(url.searchParams.get("first") || "20");
  const after = url.searchParams.get("after");
  const sort = (url.searchParams.get("sort") || "PUBLISHED_AT_DESC") as VideoSortEnum;

  const { data, error } = await runQuery(raidScheduleVideosQuery, { uid: currentRaid.uid, first, after, sort });
  if (error || !data) {
    throw new Response("Error fetching raid videos", { status: 500 });
  }
  if (!data.raidSchedule?.videos) {
    return null;
  }

  const videos = data.raidSchedule.videos.edges.map((edge) => edge.node);
  const pageInfo = data.raidSchedule.videos.pageInfo;
  return { videos, pageInfo };
};
