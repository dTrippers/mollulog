import { ChatBubbleOvalLeftIcon, ChevronRightIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { formatThousands } from "~/domain/futures/futures-view-model";
import type { UtcIsoString } from "~/lib/date-time";
import type { NestedComment } from "~/models/content";
import { Button } from "../../primitives/Button";
import { Skeleton } from "../../primitives/Skeleton";
import { formatRelativePast, sortByCreatedAt } from "./CommentThread";
import { SenseiAvatar } from "./SenseiAvatar";

export type OpinionPreviewProps = {
  title: string;
  comments: NestedComment[] | undefined;
  count: number | null;
  now: UtcIsoString;
  loading: boolean;
  unavailable: boolean;
  hidden: boolean;
  onOpen: () => void;
  onRetry: () => void;
};

export function OpinionPreview({
  title,
  comments,
  count,
  now,
  loading,
  unavailable,
  hidden,
  onOpen,
  onRetry,
}: OpinionPreviewProps) {
  const latestComments = comments ? sortByCreatedAt(comments).slice(-4) : [];
  return (
    <section className="space-y-v2-block-gap">
      <header className="flex min-h-v2-row-min items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-v2-fg">
          {title}{" "}
          {count !== null ? (
            <span className="ml-1 text-sm font-normal tabular-nums text-v2-fg-tertiary">{formatThousands(count)}</span>
          ) : null}
        </h2>
        <Button type="button" variant="text" size="sm" onClick={onOpen}>
          모두 보기 <ChevronRightIcon className="size-4" aria-hidden="true" />
        </Button>
      </header>
      <div className="rounded-lg bg-v2-surface p-v2-block-p">
        {loading ? (
          <div role="status" aria-busy="true" className="space-y-v2-group-gap">
            <span className="sr-only">의견을 불러오는 중</span>
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="flex gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : unavailable ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="alert" className="text-sm text-v2-danger">
              의견을 불러오지 못했어요.
            </p>
            <Button onClick={onRetry} size="sm">
              다시 시도
            </Button>
          </div>
        ) : latestComments.length === 0 ? (
          <p className="py-4 text-center text-sm text-v2-fg-tertiary">
            {hidden ? "표시할 의견이 없어요." : "작성된 의견이 없어요."}
          </p>
        ) : (
          <ol className="space-y-v2-group-gap">
            {latestComments.map((comment) => (
              <li key={comment.uid} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                <Link
                  to={`/@${comment.sensei.username}`}
                  aria-label={`@${comment.sensei.username} 프로필`}
                  className="self-start rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
                >
                  <SenseiAvatar profileStudentId={comment.sensei.profileStudentId} labels={comment.sensei.labels} />
                </Link>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-1.5 text-xs leading-4">
                    <Link to={`/@${comment.sensei.username}`} className="font-semibold text-v2-fg hover:underline">
                      {comment.sensei.username}
                    </Link>
                    <time dateTime={comment.createdAt} className="tabular-nums text-v2-fg-tertiary">
                      {formatRelativePast(comment.createdAt as UtcIsoString, now)}
                    </time>
                  </div>
                  <p className="mt-1 line-clamp-3 wrap-break-word whitespace-pre-line text-sm leading-[1.375rem] text-v2-fg">
                    {comment.body}
                  </p>
                  {(comment.subcomments?.length ?? 0) > 0 ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-v2-fg-tertiary">
                      <ChatBubbleOvalLeftIcon className="size-3.5" aria-hidden="true" />
                      답글 {comment.subcomments?.length}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
