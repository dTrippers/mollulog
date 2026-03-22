import { useLoaderData, useOutletContext } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import type { RaidPageContext } from "./raids.$raidType.$seasonIndex";
import { RaidVideosScreen } from "~/components/features/raids";
import { graphql } from "~/graphql";
import type { VideoSortEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { useRaidVideosFeed, type RaidVideoItem } from "./raids.$raidType.$seasonIndex._components/useRaidVideosFeed";
import { raidTypeFromParam, raidTypeToParam } from "~/models/raid";

const raidVideosQuery = graphql(`
  query RaidScheduleVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {
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

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { raidType, seasonIndex } = params;
  if (!raidType || !seasonIndex) {
    throw new Response("Raid params are required", { status: 400 });
  }

  const uid = `gl_${raidTypeFromParam(raidType)}_${seasonIndex}`;

  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const sort = (url.searchParams.get("sort") || "PUBLISHED_AT_DESC") as VideoSortEnum;

  const { data, error } = await runQuery(raidVideosQuery, { uid, first: 12, after, sort });
  if (error || !data) {
    throw new Response("Error fetching raid videos", { status: 500 });
  }
  if (!data.raidSchedule?.videos) {
    return null;
  }

  const videos: RaidVideoItem[] = data.raidSchedule.videos.edges
    .flatMap((edge) => {
      const node = edge.node;
      if (!node) {
        return [];
      }
      return {
        id: node.id ?? "",
        title: node.title ?? "",
        score: node.score ?? 0,
        youtubeId: node.youtubeId ?? "",
        thumbnailUrl: node.thumbnailUrl ?? "",
        publishedAt: node.publishedAt instanceof Date
          ? node.publishedAt.toISOString()
          : String(node.publishedAt ?? ""),
      };
    });
  const pageInfo = data.raidSchedule.videos.pageInfo;
  return { videos, pageInfo };
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
