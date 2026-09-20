import { ChatBubbleOvalLeftEllipsisIcon } from "@heroicons/react/16/solid";
import { ClickableSurface } from "~/components/primitives";
import { cn } from "~/lib/utils";
import type { ContentCommentSummary } from "~/models/content";

type ContentCommentViewProps = {
  comments?: {
    uid: string;
    body: string;
    visibility: "private" | "public";
    pinned: boolean;
    createdAt: string;
    sensei: {
      username: string;
      profileStudentId: string | null;
    };
    subcomments?: {
      uid: string;
      body: string;
      visibility: "private" | "public";
      createdAt: string;
      sensei: {
        username: string;
        profileStudentId: string | null;
      };
    }[];
  }[];
  summary?: ContentCommentSummary;
  placeholder?: string;
  unavailable?: boolean;

  onClick?: () => void;
};

function summarizeComments(comments: NonNullable<ContentCommentViewProps["comments"]>): ContentCommentSummary {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const pinnedComment = comments.find((comment) => comment.pinned);
  return {
    count: comments.reduce((acc, comment) => acc + 1 + (comment.subcomments?.length ?? 0), 0),
    hasRecentComment: comments.some(
      (comment) =>
        new Date(comment.createdAt) >= threeDaysAgo ||
        comment.subcomments?.some((sub) => new Date(sub.createdAt) >= threeDaysAgo),
    ),
    pinnedPreviewBody: pinnedComment?.body ?? null,
  };
}

export default function ContentCommentView({
  comments,
  summary,
  placeholder,
  unavailable = false,
  onClick,
}: ContentCommentViewProps) {
  const resolvedSummary = comments ? summarizeComments(comments) : (summary ?? null);

  const displayBody = resolvedSummary?.pinnedPreviewBody
    ? resolvedSummary.pinnedPreviewBody.length > 50
      ? `${resolvedSummary.pinnedPreviewBody.slice(0, 50)}...`
      : resolvedSummary.pinnedPreviewBody
    : null;
  return (
    <ClickableSurface
      className={cn(`
        w-full p-2 flex items-center gap-x-1.5 rounded-lg bg-neutral-100 text-sm shadow-xs shadow-black/5 transition dark:bg-neutral-900 dark:shadow-none
        ${onClick && !unavailable ? "cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700" : ""}
      `)}
      onClick={onClick}
      disabled={unavailable}
    >
      <div className="relative flex items-center gap-x-1">
        <ChatBubbleOvalLeftEllipsisIcon className="shrink-0 size-4 text-neutral-500 dark:text-neutral-400" />
        {!unavailable && resolvedSummary && (
          <span className="text-neutral-500 dark:text-neutral-400">{resolvedSummary.count}</span>
        )}
        {!unavailable && resolvedSummary?.hasRecentComment && (
          <div className="absolute -top-0.5 -right-2 size-1.5 bg-red-500 rounded-full animate-pulse" />
        )}
      </div>
      {unavailable ? (
        <p className="ml-1 pl-2 border-l border-neutral-200 dark:border-neutral-700 grow text-neutral-400 dark:text-neutral-600">
          의견을 불러오지 못했습니다
        </p>
      ) : displayBody ? (
        <p className="ml-1 pl-2 border-l border-neutral-200 dark:border-neutral-700 grow text-neutral-700 dark:text-neutral-300">
          {displayBody}
        </p>
      ) : (
        <p className="ml-1 pl-2 border-l border-neutral-200 dark:border-neutral-700 grow text-neutral-400 dark:text-neutral-600">
          {placeholder ?? "의견을 남겨보세요"}
        </p>
      )}
    </ClickableSurface>
  );
}
