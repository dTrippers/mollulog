import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator, useSearchParams } from "react-router";
import { type Difficulty, parseDifficulty } from "~/domain/raid-score";
import { parseVideoSort, RAID_VIDEOS_PAGE_SIZE, type RaidVideoItem, type VideoSort } from "~/models/raid-videos";
import type { RaidVideosData } from "~/routes/raids.data.$raidType.$seasonIndex.videos";

type UseRaidVideosFeedParams = {
  initialData: RaidVideosData;
  raidType: string;
  seasonIndex: number;
  defenseType: string;
};

export function useRaidVideosFeed({ initialData, raidType, seasonIndex, defenseType }: UseRaidVideosFeedParams) {
  const fetcher = useFetcher<RaidVideosData>();
  const revalidator = useRevalidator();

  const [searchParams, setSearchParams] = useSearchParams();
  const initialSort = parseVideoSort(searchParams.get("sort"));
  const initialDifficulty = parseDifficulty(searchParams.get("difficulty"));
  const [sort, setSort] = useState<VideoSort>(initialSort);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(initialDifficulty);
  const [allVideos, setAllVideos] = useState<RaidVideoItem[]>(initialData?.videos ?? []);
  const [hasMore, setHasMore] = useState(initialData?.hasMore ?? false);
  const [offset, setOffset] = useState(initialData?.videos.length ?? 0);
  const [isLoading, setIsLoading] = useState(false);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement | null>(null);
  const prevSortRef = useRef<VideoSort>(sort);
  const prevDifficultyRef = useRef<Difficulty | null>(difficulty);
  const prevDefenseTypeRef = useRef(defenseType);
  const isResettingRef = useRef(false);
  const lastInitialDataKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevSortRef.current !== sort) {
      prevSortRef.current = sort;
      isResettingRef.current = true;
      setAllVideos([]);
      setHasMore(false);
      setOffset(0);
      setIsLoading(true);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("sort", sort);
        return next;
      });
      revalidator.revalidate();
    }
  }, [revalidator, setSearchParams, sort]);

  useEffect(() => {
    if (prevDifficultyRef.current !== difficulty) {
      prevDifficultyRef.current = difficulty;
      isResettingRef.current = true;
      setAllVideos([]);
      setHasMore(false);
      setOffset(0);
      setIsLoading(true);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (difficulty) {
          next.set("difficulty", difficulty);
        } else {
          next.delete("difficulty");
        }
        return next;
      });
      revalidator.revalidate();
    }
  }, [difficulty, revalidator, setSearchParams]);

  useEffect(() => {
    if (prevDefenseTypeRef.current === defenseType) {
      return;
    }

    prevDefenseTypeRef.current = defenseType;
    isResettingRef.current = true;
    setAllVideos([]);
    setHasMore(false);
    setOffset(0);
    setIsLoading(true);
    prevDifficultyRef.current = null;
    setDifficulty(null);
  }, [defenseType]);

  useEffect(() => {
    if (revalidator.state !== "idle") {
      return;
    }

    const currentSort = parseVideoSort(searchParams.get("sort"));
    const currentDifficulty = parseDifficulty(searchParams.get("difficulty"));
    const currentKey = `${raidType}:${seasonIndex}:${defenseType}:${currentSort}:${currentDifficulty ?? "all"}`;
    if (isResettingRef.current || lastInitialDataKeyRef.current !== currentKey) {
      lastInitialDataKeyRef.current = currentKey;
      isResettingRef.current = false;
      setAllVideos(initialData?.videos ?? []);
      setHasMore(initialData?.hasMore ?? false);
      setOffset(initialData?.videos.length ?? 0);
      setIsLoading(false);
    }
  }, [defenseType, initialData, raidType, revalidator.state, searchParams, seasonIndex]);

  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data === undefined) {
      return;
    }

    const fetchedData = fetcher.data;
    if (!fetchedData) {
      setHasMore(false);
      setIsLoading(false);
      return;
    }

    setAllVideos((prev) => {
      const existingIds = new Set(prev.map((video) => video.youtubeId));
      const newVideos = fetchedData.videos.filter((video) => !existingIds.has(video.youtubeId));
      return [...prev, ...newVideos];
    });
    setHasMore(fetchedData.hasMore);
    setOffset((prev) => prev + RAID_VIDEOS_PAGE_SIZE);
    setIsLoading(false);
  }, [fetcher.data, fetcher.state]);

  const loadMoreVideos = useCallback(() => {
    if (isLoading || !hasMore) {
      return;
    }

    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("limit", String(RAID_VIDEOS_PAGE_SIZE));
    params.set("sort", sort);
    params.set("offset", String(offset));
    params.set("defenseType", defenseType);
    if (difficulty) {
      params.set("difficulty", difficulty);
    }

    fetcher.load(`/raids/data/${raidType}/${seasonIndex}/videos?${params.toString()}`);
  }, [defenseType, difficulty, fetcher, hasMore, isLoading, offset, raidType, seasonIndex, sort]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
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
  }, [hasMore, isLoading, loadMoreVideos]);

  return {
    allVideos,
    hasMore,
    isLoading,
    loadingRef,
    difficulty,
    setDifficulty,
    sort,
    setSort,
  };
}
