import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator, useSearchParams } from "react-router";
import { VideoSortEnum } from "~/graphql/graphql";
import type { RaidVideosData } from "~/routes/raids.data.$raidType.$seasonIndex.videos";

export type RaidVideoItem = {
  id: string;
  title: string;
  score: number;
  youtubeId: string;
  thumbnailUrl: string;
  publishedAt: string;
};

type UseRaidVideosFeedParams = {
  initialData: {
    videos: RaidVideoItem[];
    pageInfo: {
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor: string | null;
      endCursor: string | null;
    };
  } | null;
  raidType: string;
  seasonIndex: number;
};

export function useRaidVideosFeed({ initialData, raidType, seasonIndex }: UseRaidVideosFeedParams) {
  const fetcher = useFetcher<RaidVideosData>();
  const revalidator = useRevalidator();

  const [searchParams, setSearchParams] = useSearchParams();
  const initialSort = (searchParams.get("sort") as VideoSortEnum) || VideoSortEnum.PublishedAtDesc;
  const [sort, setSort] = useState<VideoSortEnum>(initialSort);
  const [allVideos, setAllVideos] = useState<RaidVideoItem[]>(initialData?.videos || []);
  const [hasNextPage, setHasNextPage] = useState(initialData?.pageInfo.hasNextPage || false);
  const [endCursor, setEndCursor] = useState<string | null>(initialData?.pageInfo.endCursor || null);
  const [isLoading, setIsLoading] = useState(false);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement | null>(null);
  const prevSortRef = useRef<VideoSortEnum>(sort);
  const isResettingRef = useRef(false);
  const lastInitialDataSortRef = useRef<string | null>(null);

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
  }, [revalidator, setSearchParams, sort]);

  useEffect(() => {
    if (initialData && revalidator.state === "idle") {
      const currentSort = searchParams.get("sort") || VideoSortEnum.PublishedAtDesc.toString();
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

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const fetchedData = fetcher.data;
      setAllVideos((prev) => {
        const existingIds = new Set(prev.map((video) => video.id));
        const newVideos = (fetchedData.videos || []).filter((video) => !existingIds.has(video.id));
        return [...prev, ...newVideos];
      });
      setHasNextPage(fetchedData.pageInfo?.hasNextPage || false);
      setEndCursor(fetchedData.pageInfo?.endCursor || null);
      setIsLoading(false);
    }
  }, [fetcher.data, fetcher.state]);

  const loadMoreVideos = useCallback(() => {
    if (isLoading || !hasNextPage || !endCursor) {
      return;
    }

    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("first", "12");
    params.set("sort", sort.toString());
    params.set("after", endCursor);

    fetcher.load(`/raids/data/${raidType}/${seasonIndex}/videos?${params.toString()}`);
  }, [endCursor, fetcher, hasNextPage, isLoading, raidType, seasonIndex, sort]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isLoading) {
          loadMoreVideos();
        }
      },
      { threshold: 0.1 },
    );

    if (loadingRef.current) {
      observer.observe(loadingRef.current);
    }

    observerRef.current = observer;
    return () => {
      observerRef.current?.disconnect();
    };
  }, [hasNextPage, isLoading, loadMoreVideos]);

  return {
    allVideos,
    endCursor,
    hasNextPage,
    isLoading,
    loadingRef,
    sort,
    setSort,
  };
}
