import { useId } from "react";
import { Link } from "react-router";
import { formatInstant } from "~/lib/date-time";
import type { Post } from "~/models/post";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { v2FocusRing } from "../../layout/styles";

export type PostSummary = Pick<Post, "uid" | "title" | "createdAt">;

// Location state that marks a post opened from the news list. The detail back action returns to that list page.
export const newsListOriginState = { from: "news-list" } as const;

export type PostRowListProps = {
  posts: PostSummary[];
  timeZone: string;
  // Passed to the row links. The list page sets newsListOriginState so the detail can return to the list.
  linkState?: unknown;
};

// One link per row. The title is the accessible name, and the date is the description.
export function PostRowList({ posts, timeZone, linkState }: PostRowListProps) {
  const id = useId();
  return (
    <ul className="divide-y divide-v2-divider rounded-lg bg-v2-surface px-v2-block-p">
      {posts.map((post, index) => {
        const titleId = `${id}-${index}-title`;
        const dateId = `${id}-${index}-date`;
        return (
          <li key={post.uid}>
            <Link
              to={`/posts/${post.uid}`}
              state={linkState}
              prefetch="intent"
              aria-labelledby={titleId}
              aria-describedby={dateId}
              className={`relative isolate -mx-2 flex min-h-12 items-baseline justify-between gap-3 rounded-md px-2 py-3 text-v2-fg before:absolute before:inset-x-0 before:inset-y-1 before:-z-10 before:rounded-md before:content-[''] hover:before:bg-v2-hover focus-visible:before:bg-v2-hover ${v2FocusRing}`}
              {...getV2LinkTransitionProps("forward")}
            >
              <span id={titleId} className="min-w-0 break-keep break-words text-sm leading-5">
                {post.title}
              </span>
              <time
                id={dateId}
                dateTime={post.createdAt}
                className="shrink-0 text-xs leading-5 text-v2-fg-tertiary tabular-nums"
              >
                {formatInstant(post.createdAt, { timeZone, format: "YYYY/MM/DD" })}
              </time>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
