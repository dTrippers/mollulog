import {
  ArrowUturnLeftIcon,
  BookmarkIcon,
  LockClosedIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid";
import { BookmarkIcon as BookmarkOutlineIcon, EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import type { NestedComment } from "~/models/content";
import { ActionMenu, type ActionMenuItem } from "../../primitives/ActionMenu";
import { IconButton } from "../../primitives/IconButton";
import { SenseiAvatar } from "./SenseiAvatar";

export type CommentItemProps = {
  comment: NestedComment;
  // Relative posting time for the name line.
  timeLabel: string;
  // Top-level opinions can be replied to and pinned. Replies can be edited and deleted.
  level: "top" | "reply";
  canReply: boolean;
  replying: boolean;
  editing: boolean;
  submitting: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
  onUnpin: () => void;
  // The inline editor replaces the body while editing.
  editor?: ReactNode;
  // Reply list and inline reply composer, rendered under the body in the content column.
  children?: ReactNode;
};

// One opinion or reply. Desktop shows every applicable action as an icon button in the top-right corner. Mobile keeps the
// reply button and moves the own actions into a ⋯ menu.
export function CommentItem({
  comment,
  timeLabel,
  level,
  canReply,
  replying,
  editing,
  submitting,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onUnpin,
  editor,
  children,
}: CommentItemProps) {
  const top = level === "top";
  const own = comment.sensei.me;
  const pinnable = top && own;
  const isPrivate = comment.visibility === "private";
  const username = comment.sensei.username;
  const menuItems: ActionMenuItem[] = [
    ...(pinnable
      ? [
          {
            key: "pin",
            label: comment.pinned ? "고정 해제" : "고정",
            icon: comment.pinned ? BookmarkIcon : BookmarkOutlineIcon,
            onSelect: comment.pinned ? onUnpin : onPin,
          },
        ]
      : []),
    { key: "edit", label: "수정", icon: PencilSquareIcon, onSelect: onEdit },
    { key: "delete", label: "삭제", icon: TrashIcon, danger: true, onSelect: onDelete },
  ];

  const actions = editing ? (
    <IconButton
      icon={XMarkIcon}
      label="수정 취소"
      onClick={onEdit}
      disabled={submitting}
      className="-my-2 max-lg:-my-3.5"
    />
  ) : (
    // The buttons center on the name line and overflow it instead of growing it, so the name stays level with the avatar top.
    <div className="-my-2 flex shrink-0 items-center max-lg:-my-3.5">
      {top && canReply ? (
        <IconButton
          icon={replying ? XMarkIcon : ArrowUturnLeftIcon}
          label={replying ? "답글 취소" : "답글 달기"}
          onClick={onReply}
          disabled={submitting}
        />
      ) : null}
      {pinnable ? (
        <IconButton
          icon={comment.pinned ? BookmarkIcon : BookmarkOutlineIcon}
          label="의견 고정"
          pressed={comment.pinned}
          onClick={comment.pinned ? onUnpin : onPin}
          disabled={submitting}
          className="max-lg:hidden"
        />
      ) : null}
      {own ? (
        <>
          <IconButton
            icon={PencilSquareIcon}
            label="의견 수정"
            onClick={onEdit}
            disabled={submitting}
            className="max-lg:hidden"
          />
          <IconButton
            icon={TrashIcon}
            label="의견 삭제"
            danger
            onClick={onDelete}
            disabled={submitting}
            className="max-lg:hidden"
          />
          <ActionMenu
            label="의견 메뉴"
            icon={EllipsisHorizontalIcon}
            items={menuItems}
            className="lg:hidden"
            disabled={submitting}
          />
        </>
      ) : null}
    </div>
  );
  return (
    <li
      className={cn(
        "grid gap-x-3",
        top ? "grid-cols-[2rem_minmax(0,1fr)]" : "grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2",
      )}
    >
      <Link
        to={`/@${username}`}
        aria-label={`@${username} 프로필`}
        className="flex shrink-0 self-start rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
      >
        <SenseiAvatar
          profileStudentId={comment.sensei.profileStudentId}
          labels={comment.sensei.labels}
          size={top ? "default" : "compact"}
        />
      </Link>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4">
            <Link to={`/@${username}`} className="text-[0.8125rem] font-semibold text-v2-fg hover:underline">
              {username}
            </Link>
            {own ? <span className="text-v2-fg-tertiary">나</span> : null}
            <time dateTime={comment.createdAt} className="text-v2-fg-tertiary tabular-nums">
              {timeLabel}
            </time>
            {isPrivate ? (
              <span title="나만 보기" className="inline-flex text-v2-fg-tertiary">
                <LockClosedIcon className="size-3.5" aria-hidden="true" />
                <span className="sr-only">나만 보기</span>
              </span>
            ) : null}
            {pinnable && comment.pinned ? (
              <span title="고정됨" className="inline-flex text-v2-fg-tertiary lg:hidden">
                <BookmarkIcon className="size-3.5" aria-hidden="true" />
                <span className="sr-only">고정됨</span>
              </span>
            ) : null}
          </div>
          {actions}
        </div>
        {editor ? (
          <div className="mt-3">{editor}</div>
        ) : (
          <p className="mt-1 text-sm leading-[1.375rem] wrap-break-word whitespace-pre-line text-v2-fg">
            {comment.body}
          </p>
        )}
        {children}
      </div>
    </li>
  );
}
