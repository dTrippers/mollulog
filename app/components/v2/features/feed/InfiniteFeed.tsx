import { ArrowPathIcon, ExclamationCircleIcon } from "@heroicons/react/16/solid";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { Button } from "../../primitives/Button";
import { StatusNotice } from "../../primitives/StatusNotice";
import { FeedPost, type FeedPostItem, type FeedStudentsByUid } from "./FeedPost";

// One page of a feed, as the route loader returns it. `failed` means the page could not be loaded: the loader answers
// with it instead of throwing, so a failed "more" request can be shown at the end of the list.
export type FeedPageData = {
  page: number;
  totalPages: number;
  signedIn: boolean;
  studentsByUid: FeedStudentsByUid;
  posts: FeedPostItem[];
  failed: boolean;
};

// What `getPageUrl` loads: the screen's own route loader, which returns the page under `feed`. The URL must target that
// route itself (with `?index` for an index route), not its parent layout.
export type FeedPageLoaderData = { feed: FeedPageData };

type InfiniteFeedProps = FeedPageData & {
  emptyText: string;
  // Changes when the feed belongs to someone else, so the loaded pages start over.
  resetKey: string;
  getPageUrl: (page: number) => string;
};

// The feed list: loaded pages stacked in one surface, then 더 보기 (it also loads when it scrolls near), a loading state, or
// a failure line with a retry. Already loaded posts stay when a later page fails.
export function InfiniteFeed({
  posts: initialPosts,
  signedIn,
  studentsByUid: initialStudentsByUid,
  page: initialPage,
  totalPages: initialTotalPages,
  failed: initialFailed,
  emptyText,
  resetKey,
  getPageUrl,
}: InfiniteFeedProps) {
  const fetcher = useFetcher<FeedPageLoaderData>();
  const revalidator = useRevalidator();
  const [posts, setPosts] = useState(initialPosts);
  const [studentsByUid, setStudentsByUid] = useState(initialStudentsByUid);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [moreFailed, setMoreFailed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const lastAppliedPageRef = useRef(initialPage);
  const requestedResetKeyRef = useRef<string | null>(null);
  const loading = fetcher.state !== "idle";
  const hasMore = page < totalPages;

  useEffect(() => {
    void resetKey;
    setPosts(initialPosts);
    setStudentsByUid(initialStudentsByUid);
    setPage(initialPage);
    setTotalPages(initialTotalPages);
    setMoreFailed(false);
    lastAppliedPageRef.current = initialPage;
    requestedResetKeyRef.current = null;
  }, [initialPage, initialPosts, initialStudentsByUid, initialTotalPages, resetKey]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || requestedResetKeyRef.current !== resetKey) {
      return;
    }
    const data = fetcher.data.feed;
    if (data.failed) {
      setMoreFailed(true);
      return;
    }
    if (data.page <= lastAppliedPageRef.current) {
      return;
    }
    lastAppliedPageRef.current = data.page;
    setMoreFailed(false);
    setPage(data.page);
    setTotalPages(data.totalPages);
    setStudentsByUid((previous) => ({ ...previous, ...data.studentsByUid }));
    setPosts((previous) => {
      const known = new Set(previous.map((post) => post.uid));
      return [...previous, ...data.posts.filter((post) => !known.has(post.uid))];
    });
  }, [fetcher.data, fetcher.state, resetKey]);

  const loadNextPage = useCallback(() => {
    if (loading || !hasMore) {
      return;
    }
    requestedResetKeyRef.current = resetKey;
    setMoreFailed(false);
    fetcher.load(getPageUrl(page + 1));
  }, [fetcher, getPageUrl, hasMore, loading, page, resetKey]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    // A failed page waits for the retry button: scrolling must not request it again and again.
    if (!sentinel || !hasMore || moreFailed) {
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
  }, [hasMore, loadNextPage, moreFailed]);

  if (initialFailed && posts.length === 0) {
    return (
      <div className="rounded-lg bg-v2-surface p-v2-block-p">
        <StatusNotice
          tone="danger"
          Icon={ExclamationCircleIcon}
          action={
            <Button size="sm" onClick={() => revalidator.revalidate()} disabled={revalidator.state !== "idle"}>
              <ArrowPathIcon className="size-4" aria-hidden="true" />
              다시 시도
            </Button>
          }
        >
          작성한 글을 불러오지 못했어요.
        </StatusNotice>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-lg bg-v2-surface px-v2-block-p py-8 text-center text-sm text-v2-fg-secondary">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-v2-block-gap">
      <div className="divide-y divide-v2-divider overflow-hidden rounded-lg bg-v2-surface">
        {posts.map((post) => (
          <FeedPost key={post.uid} post={post} signedIn={signedIn} studentsByUid={studentsByUid} />
        ))}
      </div>
      {hasMore ? (
        <div ref={sentinelRef} className="flex flex-wrap items-center justify-center gap-2 py-2">
          {moreFailed ? (
            <StatusNotice tone="danger" Icon={ExclamationCircleIcon}>
              글을 더 불러오지 못했어요.
            </StatusNotice>
          ) : null}
          <Button size={moreFailed ? "sm" : "md"} onClick={loadNextPage} disabled={loading}>
            {loading ? "불러오는 중…" : moreFailed ? "다시 시도" : "더 보기"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
