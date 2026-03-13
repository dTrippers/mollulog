import { ChatBubbleOvalLeftEllipsisIcon } from "@heroicons/react/16/solid";
import { ClickableSurface } from "~/components/primitives";
import { sanitizeClassName } from "~/prophandlers";

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
  placeholder?: string;

  onClick?: () => void;
}

export default function ContentCommentView({ comments, placeholder, onClick }: ContentCommentViewProps) {
  const commentCount = comments ? comments.reduce((acc, comment) => acc + 1 + (comment.subcomments?.length ?? 0), 0) : 0;

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const hasRecentComment = comments?.some((comment) =>
    new Date(comment.createdAt) >= threeDaysAgo ||
    comment.subcomments?.some((sub) => new Date(sub.createdAt) >= threeDaysAgo)
  ) ?? false;

  const pinnedComment = comments?.find((comment) => comment.pinned);
  const displayBody = pinnedComment ? (pinnedComment.body.length > 50 ? `${pinnedComment.body.slice(0, 50)}...` : pinnedComment.body) : null;
  return (
    <ClickableSurface
      className={sanitizeClassName(`
        w-full p-2 flex items-center gap-x-1.5 bg-neutral-100 dark:bg-neutral-900 rounded-lg text-sm transition
        ${onClick ? "cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700" : ""}
      `)}
      onClick={onClick}
    >
      <div className="relative flex items-center gap-x-1">
        <ChatBubbleOvalLeftEllipsisIcon className="shrink-0 size-4 text-neutral-500 dark:text-neutral-400" />
        {comments && <span className="text-neutral-500 dark:text-neutral-400">{commentCount}</span>}
        {hasRecentComment && <div className="absolute -top-0.5 -right-2 size-1.5 bg-red-500 rounded-full animate-pulse" />}
      </div>
      {pinnedComment ? (
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
