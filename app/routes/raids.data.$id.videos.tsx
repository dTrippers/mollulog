import type { LoaderFunctionArgs } from "react-router";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import type { VideoSortEnum } from "~/graphql/graphql";

const raidVideosQuery = graphql(`
  query RaidVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {
    raid(uid: $uid) {
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

// @deprecated Use the loader from ./raids.$id.videos.tsx instead
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const uid = params.id;
  if (!uid) {
    throw new Response("Raid ID is required", { status: 400 });
  }

  const url = new URL(request.url);
  const first = Number.parseInt(url.searchParams.get("first") || "20");
  const after = url.searchParams.get("after");
  const sort = (url.searchParams.get("sort") || "PUBLISHED_AT_DESC") as VideoSortEnum;

  const { data, error } = await runQuery(raidVideosQuery, { uid, first, after, sort });
  if (error || !data) {
    throw new Response("Error fetching raid videos", { status: 500 });
  }
  if (!data.raid?.videos) {
    return null;
  }

  const videos = data.raid.videos.edges.map((edge) => edge.node);
  const pageInfo = data.raid.videos.pageInfo;
  return { videos, pageInfo };
};
