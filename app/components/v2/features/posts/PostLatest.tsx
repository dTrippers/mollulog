import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { Link } from "react-router";
import { formatInstant } from "~/lib/date-time";
import type { Post } from "~/models/post";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { v2FocusRing } from "../../layout/styles";
import { MarkdownContent } from "../../primitives/MarkdownContent";

export type PostLatestProps = {
  post: Pick<Post, "uid" | "title" | "content" | "createdAt">;
  timeZone: string;
  linkState?: unknown;
};

// Splits off the last word so it can stay on one line with the chevron.
function splitLastWord(title: string) {
  const lastSpace = title.lastIndexOf(" ");
  return lastSpace < 0
    ? { head: "", tail: title }
    : { head: title.slice(0, lastSpace + 1), tail: title.slice(lastSpace + 1) };
}

// The newest post on the first list page, shown in full. Its title links to the detail page.
export function PostLatest({ post, timeZone, linkState }: PostLatestProps) {
  const { head: titleHead, tail: titleTail } = splitLastWord(post.title);
  return (
    <article aria-labelledby="latest-post-title" className="rounded-lg bg-v2-surface p-v2-block-p">
      <h2 id="latest-post-title" className="break-keep break-words text-xl leading-7 font-semibold text-v2-fg">
        <Link
          to={`/posts/${post.uid}`}
          state={linkState}
          prefetch="intent"
          className={`rounded-sm hover:underline hover:underline-offset-4 ${v2FocusRing}`}
          {...getV2LinkTransitionProps("forward")}
        >
          {titleHead}
          {/* The last word and the chevron stay together, so a wrapped title leaves the chevron after its last word. */}
          <span className="whitespace-nowrap">
            {titleTail}
            <ChevronRightIcon
              className="ml-0.5 inline-block size-5 align-[-0.25em] text-v2-fg-tertiary"
              aria-hidden="true"
            />
          </span>
        </Link>
      </h2>
      <time dateTime={post.createdAt} className="mt-1 block text-sm leading-5 text-v2-fg-tertiary tabular-nums">
        {formatInstant(post.createdAt, { timeZone, format: "YYYY/MM/DD" })}
      </time>
      <div className="mt-4">
        <MarkdownContent text={post.content} headingLevel={3} />
      </div>
    </article>
  );
}
