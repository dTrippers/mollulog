import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { Link } from "react-router";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { v2FocusRing } from "../../layout/styles";
import { PostRowList, type PostSummary } from "./PostRowList";
import { RecentPostsFailure } from "./PostStates";

export type RecentPostsSource = { status: "success"; data: PostSummary[] } | { status: "error" };

export type RecentPostsProps = {
  source: RecentPostsSource;
  timeZone: string;
  onRetry: () => void;
};

// Recent news below a news post, without the current post. It is omitted when there is nothing to show. A failure
// replaces only this block.
export function RecentPosts({ source, timeZone, onRetry }: RecentPostsProps) {
  if (source.status === "success" && source.data.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="recent-posts-title" className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="recent-posts-title" className="text-base leading-6 font-semibold text-v2-fg">
          최근 소식
        </h2>
        <Link
          to="/news"
          className={`-my-3 inline-flex min-h-11 items-center gap-0.5 rounded-md text-sm text-v2-fg-secondary hover:text-v2-fg ${v2FocusRing}`}
          {...getV2LinkTransitionProps("reverse")}
        >
          모두 보기
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-2 md:mt-3">
        {source.status === "error" ? (
          <RecentPostsFailure onRetry={onRetry} />
        ) : (
          <PostRowList posts={source.data} timeZone={timeZone} />
        )}
      </div>
    </section>
  );
}
