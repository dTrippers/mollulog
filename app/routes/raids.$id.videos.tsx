import { useEffect, useState, useRef, useCallback } from "react";
import { useFetcher, useLoaderData, useOutletContext, useSearchParams, useRevalidator } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import type { RaidPageContext } from "./raids.$id";
import { RaidVideosScreen } from "~/components/raids";
import { graphql } from "~/graphql";
import { VideoSortEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import type { RaidVideosData } from "./raids.data.$id.videos";

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

type Video = {
  id: string;
  title: string;
  score: number;
  youtubeId: string;
  thumbnailUrl: string;
  publishedAt: string;
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const uid = params.id;
  if (!uid) {
    throw new Response("Raid ID is required", { status: 400 });
  }

  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const sort = (url.searchParams.get("sort") || "PUBLISHED_AT_DESC") as VideoSortEnum;

  const { data, error } = await runQuery(raidVideosQuery, { uid, first: 12, after, sort });
  if (error || !data) {
    throw new Response("Error fetching raid videos", { status: 500 });
  }
  if (!data.raid?.videos) {
    return null;
  }

  const videos: Video[] = data.raid.videos.edges
    .filter((edge) => edge.node !== null)
    .map((edge) => {
      const node = edge.node!;
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
  const pageInfo = data.raid.videos.pageInfo;
  return { videos, pageInfo };
};

export default function RaidVideos() {
  const { currentRaid } = useOutletContext<RaidPageContext>();
  const initialData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<RaidVideosData>();
  const revalidator = useRevalidator();

  const [searchParams, setSearchParams] = useSearchParams();
  const initialSort = (searchParams.get("sort") as VideoSortEnum) || VideoSortEnum.PublishedAtDesc;
  const [sort, setSort] = useState<VideoSortEnum>(initialSort);
  const [allVideos, setAllVideos] = useState<Video[]>(initialData?.videos || []);
  const [hasNextPage, setHasNextPage] = useState(initialData?.pageInfo.hasNextPage || false);
  const [endCursor, setEndCursor] = useState<string | null>(initialData?.pageInfo.endCursor || null);
  const [isLoading, setIsLoading] = useState(false);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const prevSortRef = useRef<VideoSortEnum>(sort);
  const isResettingRef = useRef(false);
  const lastInitialDataSortRef = useRef<string | null>(null);

  // Reset videos when sort changes
  useEffect(() => {
    if (prevSortRef.current !== sort) {
      prevSortRef.current = sort;
      isResettingRef.current = true;
      setAllVideos([]);
      setHasNextPage(false);
      setEndCursor(null);
      setIsLoading(true);
      setSearchParams((prev) => {
        prev.set("sort", sort.toString());
        return prev;
      });
      revalidator.revalidate();
    }
  }, [sort, setSearchParams, revalidator]);

  // Update videos when loader data changes (initial load or sort change)
  useEffect(() => {
    if (initialData && revalidator.state === "idle") {
      const currentSort = searchParams.get("sort") || VideoSortEnum.PublishedAtDesc.toString();
      // Only update if this is a fresh load (sort changed or initial mount)
      if (isResettingRef.current || lastInitialDataSortRef.current !== currentSort) {
        lastInitialDataSortRef.current = currentSort;
        isResettingRef.current = false;
        setAllVideos(initialData.videos || []);
        setHasNextPage(initialData.pageInfo?.hasNextPage || false);
        setEndCursor(initialData.pageInfo?.endCursor || null);
        setIsLoading(false);
      }
    }
  }, [initialData, revalidator.state, searchParams]);

  // Handle fetcher data updates (infinite scroll)
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      setAllVideos((prev) => {
        const existingIds = new Set(prev.map((v) => v.id));
        const newVideos = (fetcher.data!.videos || []).filter((v) => !existingIds.has(v.id));
        return [...prev, ...newVideos];
      });
      setHasNextPage(fetcher.data.pageInfo?.hasNextPage || false);
      setEndCursor(fetcher.data.pageInfo?.endCursor || null);
      setIsLoading(false);
    }
  }, [fetcher.data, fetcher.state]);

  // Load more videos function
  const loadMoreVideos = useCallback(() => {
    if (isLoading || !hasNextPage || !endCursor) return;

    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("first", "12");
    params.set("sort", sort.toString());
    params.set("after", endCursor);

    fetcher.load(`/raids/data/${currentRaid.uid}/videos?${params.toString()}`);
  }, [isLoading, hasNextPage, endCursor, sort, currentRaid.uid, fetcher]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isLoading) {
          loadMoreVideos();
        }
      },
      { threshold: 0.1 }
    );

    if (loadingRef.current) {
      observer.observe(loadingRef.current);
    }

    observerRef.current = observer;
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasNextPage, isLoading, loadMoreVideos]);

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
