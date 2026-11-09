import { BookmarkIcon, ChevronUpIcon, LockClosedIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/16/solid";
import {
  ArrowPathIcon,
  BookmarkIcon as BookmarkOutlineIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { formatThousands } from "~/domain/futures/futures-view-model";
import type { UtcIsoString } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import type { NestedComment } from "~/models/content";
import { ActionMenu, type ActionMenuItem } from "../../primitives/ActionMenu";
import { Button } from "../../primitives/Button";
import { Skeleton } from "../../primitives/Skeleton";
import { StatusNotice } from "../../primitives/StatusNotice";
import { CommentComposer, type CommentVisibility } from "./CommentComposer";
import { formatRelativePast, sortByCreatedAt } from "./CommentThread";
import { SenseiAvatar } from "./SenseiAvatar";

const INITIAL_VISIBLE = 3;
const VISIBLE_STEP = 10;

export type OpinionInlineListProps = {
  title: string;
  comments: NestedComment[];
  count: number | null;
  now: UtcIsoString;
  loading: boolean;
  unavailable: boolean;
  hidden: boolean;
  signedIn: boolean;
  submitting: boolean;
  // The recruitment opinion switch, shown next to the title.
  headerControl?: ReactNode;
  onCreate: (body: string, visibility: CommentVisibility) => void;
  onDelete: (commentUid: string) => void;
  onPin: (commentUid: string) => void;
  onUnpin: () => void;
  // Opens the full thread, where replies and edits happen.
  onOpenThread: () => void;
  onRetry: () => void;
  onRequestSignIn: () => void;
};

// Opinions read inline on the page, oldest first like the full thread, so the newest sit right above the composer. Only
// the newest few show at first, and older ones load above them. Each opinion shows its first reply, and the rest of the
// conversation opens in the full thread.
export function OpinionInlineList({
  title,
  comments,
  count,
  now,
  loading,
  unavailable,
  hidden,
  signedIn,
  submitting,
  headerControl,
  onCreate,
  onDelete,
  onPin,
  onUnpin,
  onOpenThread,
  onRetry,
  onRequestSignIn,
}: OpinionInlineListProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const ordered = sortByCreatedAt(comments);
  const visible = ordered.slice(Math.max(0, ordered.length - visibleCount));
  const remaining = ordered.length - visible.length;

  return (
    <section data-region="opinions" aria-labelledby="opinions-title" className="flex flex-col gap-3">
      <header className="flex min-h-8 flex-col items-start gap-2 md:flex-row md:items-center md:justify-between">
        <h2 id="opinions-title" className="text-lg font-semibold text-v2-fg">
          {title}
          {count !== null ? (
            <span className="ml-1.5 text-[0.9375rem] font-medium tabular-nums text-v2-fg-tertiary">
              {formatThousands(count)}
            </span>
          ) : null}
        </h2>
        {headerControl}
      </header>

      {loading ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-5">
          <span className="sr-only">의견을 불러오는 중</span>
          {[0, 1, 2].map((key) => (
            <div key={key} className="flex gap-2.5">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2 pt-1">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          ))}
        </div>
      ) : unavailable ? (
        <StatusNotice
          tone="danger"
          action={
            <Button size="sm" onClick={onRetry}>
              <ArrowPathIcon className="size-4" aria-hidden="true" />
              다시 시도
            </Button>
          }
        >
          의견을 불러오지 못했어요
        </StatusNotice>
      ) : ordered.length === 0 ? (
        <p className="text-sm text-v2-fg-tertiary">
          {hidden ? "표시할 의견이 없어요." : "아직 의견이 없어요. 첫 의견을 남겨 보세요."}
        </p>
      ) : (
        <>
          {remaining > 0 ? (
            <Button
              variant="text"
              size="sm"
              className="self-start px-0"
              onClick={() => setVisibleCount((value) => value + VISIBLE_STEP)}
            >
              이전 의견 {formatThousands(remaining)}개 더 보기
              <ChevronUpIcon className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
          <ol className="flex flex-col gap-5">
            {visible.map((comment) => (
              <InlineOpinion
                key={comment.uid}
                comment={comment}
                now={now}
                canReply={signedIn && comment.visibility === "public"}
                submitting={submitting}
                onDelete={onDelete}
                onPin={onPin}
                onUnpin={onUnpin}
                onOpenThread={onOpenThread}
              />
            ))}
          </ol>
        </>
      )}

      {unavailable || loading ? null : signedIn ? (
        <div data-region="opinion-composer">
          <CommentComposer
            label="의견 작성"
            placeholder="의견을 남겨보세요"
            shortcutHint="Enter로 등록, Shift+Enter 줄바꿈"
            submitLabel="등록"
            disabled={submitting}
            onSubmit={onCreate}
          />
        </div>
      ) : (
        <div
          data-region="opinion-composer-signed-out"
          className="flex min-h-10 items-center gap-2 rounded-md bg-v2-inset py-1.5 pr-1.5 pl-3"
        >
          <p className="min-w-0 flex-1 text-sm text-v2-fg-secondary">로그인하면 의견을 남길 수 있어요</p>
          <Button variant="primary" size="sm" onClick={onRequestSignIn}>
            로그인
          </Button>
        </div>
      )}
    </section>
  );
}

function InlineOpinion({
  comment,
  now,
  canReply,
  submitting,
  onDelete,
  onPin,
  onUnpin,
  onOpenThread,
}: {
  comment: NestedComment;
  now: UtcIsoString;
  canReply: boolean;
  submitting: boolean;
  onDelete: (commentUid: string) => void;
  onPin: (commentUid: string) => void;
  onUnpin: () => void;
  onOpenThread: () => void;
}) {
  const [firstReply, ...moreReplies] = sortByCreatedAt(comment.subcomments ?? []);
  const own = comment.sensei.me;
  const menuItems: ActionMenuItem[] = [
    {
      key: "pin",
      label: comment.pinned ? "고정 해제" : "고정",
      icon: comment.pinned ? BookmarkIcon : BookmarkOutlineIcon,
      onSelect: comment.pinned ? onUnpin : () => onPin(comment.uid),
    },
    { key: "edit", label: "수정", icon: PencilSquareIcon, onSelect: onOpenThread },
    {
      key: "delete",
      label: "삭제",
      icon: TrashIcon,
      danger: true,
      onSelect: () => {
        if (window.confirm("의견을 삭제할까요?")) onDelete(comment.uid);
      },
    },
  ];

  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2.5">
      <Link
        to={`/@${comment.sensei.username}`}
        aria-label={`@${comment.sensei.username} 프로필`}
        className="self-start rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
      >
        <SenseiAvatar profileStudentId={comment.sensei.profileStudentId} labels={comment.sensei.labels} />
      </Link>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <OpinionMeta comment={comment} now={now} size="top" />
          {own ? (
            <ActionMenu
              label="의견 메뉴"
              icon={EllipsisHorizontalIcon}
              items={menuItems}
              className="-my-2"
              disabled={submitting}
            />
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-[1.55] wrap-break-word whitespace-pre-line text-v2-fg">{comment.body}</p>
        {firstReply ? (
          <div className="mt-2.5 grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
            <Link
              to={`/@${firstReply.sensei.username}`}
              aria-label={`@${firstReply.sensei.username} 프로필`}
              className="self-start rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
            >
              <SenseiAvatar
                profileStudentId={firstReply.sensei.profileStudentId}
                labels={firstReply.sensei.labels}
                size="compact"
              />
            </Link>
            <div className="min-w-0">
              <OpinionMeta comment={firstReply} now={now} size="reply" />
              <ClampedReply key={`${firstReply.uid}:${firstReply.body}`} body={firstReply.body} />
              {moreReplies.length > 0 ? (
                <button
                  type="button"
                  onClick={onOpenThread}
                  className="mt-1 rounded-sm text-xs font-semibold text-v2-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
                >
                  답글 {formatThousands(moreReplies.length)}개 더 보기
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {canReply && moreReplies.length === 0 ? (
          <button
            type="button"
            onClick={onOpenThread}
            className="mt-1.5 rounded-sm text-xs text-v2-fg-tertiary hover:text-v2-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
          >
            답글 달기
          </button>
        ) : null}
      </div>
    </li>
  );
}

// The first reply is cut at three lines. A reader can always unfold it here, since the full thread may offer nothing
// else to a signed-out reader of a single reply.
function ClampedReply({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || expanded) return;
    const measure = () => setClamped(node.scrollHeight > node.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded]);
  return (
    <>
      <p
        ref={ref}
        className={cn(
          "mt-0.5 text-sm leading-normal wrap-break-word whitespace-pre-line text-v2-fg",
          !expanded && "line-clamp-3",
        )}
      >
        {body}
      </p>
      {clamped && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-0.5 rounded-sm text-xs font-semibold text-v2-fg-tertiary hover:text-v2-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
        >
          더 보기
        </button>
      ) : null}
    </>
  );
}

function OpinionMeta({ comment, now, size }: { comment: NestedComment; now: UtcIsoString; size: "top" | "reply" }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-4">
      <Link
        to={`/@${comment.sensei.username}`}
        className={
          size === "top"
            ? "text-[0.8125rem] font-semibold text-v2-fg hover:underline"
            : "font-semibold text-v2-fg hover:underline"
        }
      >
        {comment.sensei.username}
      </Link>
      <time dateTime={comment.createdAt} className="tabular-nums text-v2-fg-disabled">
        {formatRelativePast(comment.createdAt as UtcIsoString, now)}
      </time>
      {comment.visibility === "private" ? (
        <span title="나만 보기" className="inline-flex items-center gap-1 text-v2-fg-tertiary">
          <LockClosedIcon className="size-3" aria-hidden="true" />
          나만 보기
        </span>
      ) : null}
      {comment.pinned ? (
        <span className="inline-flex items-center gap-1 text-v2-accent">
          <BookmarkIcon className="size-3" aria-hidden="true" />
          고정됨
        </span>
      ) : null}
    </div>
  );
}
