import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { EmptyView, LoadingSkeleton } from "~/components/primitives";
import CommunityFeed, { type CommunityFeedPostItem } from "./CommunityFeed";

type CommunityInfiniteFeedPageData = {
  page: number;
  totalPages: number;
  signedIn: boolean;
  studentsByUid: Record<string, { name: string }>;
  posts: CommunityFeedPostItem[];
};

type CommunityInfiniteFeedProps = CommunityInfiniteFeedPageData & {
  emptyText: string;
  resetKey: string;
  getPageUrl: (page: number) => string;
};

export default function CommunityInfiniteFeed({
  posts: initialPosts,
  signedIn,
  studentsByUid: initialStudentsByUid,
  page: initialPage,
  totalPages: initialTotalPages,
  emptyText,
  resetKey,
  getPageUrl,
}: CommunityInfiniteFeedProps) {
  const fetcher = useFetcher<CommunityInfiniteFeedPageData>();
  const [posts, setPosts] = useState(initialPosts);
  const [studentsByUid, setStudentsByUid] = useState(initialStudentsByUid);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const lastAppliedPageRef = useRef(initialPage);
  const lastRequestedResetKeyRef = useRef<string | null>(null);
  const loading = fetcher.state !== "idle";
  const hasMore = page < totalPages;

  useEffect(() => {
    void resetKey;
    setPosts(initialPosts);
    setStudentsByUid(initialStudentsByUid);
    setPage(initialPage);
    setTotalPages(initialTotalPages);
    lastAppliedPageRef.current = initialPage;
    lastRequestedResetKeyRef.current = null;
  }, [initialPage, initialPosts, initialStudentsByUid, initialTotalPages, resetKey]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }

    const data = fetcher.data;
    if (lastRequestedResetKeyRef.current !== resetKey) {
      return;
    }

    if (data.page <= lastAppliedPageRef.current) {
      return;
    }

    lastAppliedPageRef.current = data.page;
    setPage(data.page);
    setTotalPages(data.totalPages);
    setStudentsByUid((prev) => ({ ...prev, ...data.studentsByUid }));
    setPosts((prev) => {
      const existingUids = new Set(prev.map((post) => post.uid));
      const nextPosts = data.posts.filter((post) => !existingUids.has(post.uid));
      return [...prev, ...nextPosts];
    });
  }, [fetcher.data, fetcher.state, resetKey]);

  const loadNextPage = useCallback(() => {
    if (loading || !hasMore) {
      return;
    }

    lastRequestedResetKeyRef.current = resetKey;
    fetcher.load(getPageUrl(page + 1));
  }, [fetcher, getPageUrl, hasMore, loading, page, resetKey]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadNextPage();
        }
      },
      { rootMargin: "240px 0px 240px 0px", threshold: 0.1 },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, loadNextPage]);

  if (posts.length === 0 && !loading) {
    return <EmptyView text={emptyText} />;
  }

  return (
    <div className="space-y-4">
      <CommunityFeed posts={posts} signedIn={signedIn} studentsByUid={studentsByUid} />
      {hasMore && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-3 py-5">
          {loading && <LoadingSkeleton />}
          <button
            type="button"
            className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={loadNextPage}
            disabled={loading}
          >
            {loading ? "불러오는 중" : "더 보기"}
          </button>
        </div>
      )}
    </div>
  );
}
