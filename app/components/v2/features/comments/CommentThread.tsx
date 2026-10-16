import { useEffect, useState } from "react";
import { parseUtcTimestamp, type UtcIsoString } from "~/lib/date-time";
import type { NestedComment } from "~/models/content";
import { CommentComposer, type CommentVisibility } from "./CommentComposer";
import { CommentItem } from "./CommentItem";

export type CommentThreadActions = {
  canReply: boolean;
  onReply: (parentCommentUid: string, body: string, visibility: CommentVisibility) => void;
  onUpdate: (commentUid: string, body: string, visibility: CommentVisibility) => void;
  onDelete: (commentUid: string) => void;
  onPin: (commentUid: string) => void;
  onUnpin: () => void;
};

// Opinions and replies read oldest first, in posting order.
export function sortByCreatedAt<T extends { createdAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function formatRelativePast(createdAt: UtcIsoString, now: UtcIsoString): string {
  const diffMinutes = Math.max(
    0,
    Math.floor((parseUtcTimestamp(now).valueOf() - parseUtcTimestamp(createdAt).valueOf()) / 60000),
  );
  if (diffMinutes < 60) {
    return `${Math.max(1, diffMinutes)}분 전`;
  }
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }
  return `${Math.floor(hours / 24)}일 전`;
}

// Opinions in posting order. Replies sit under their parent, in the parent's content column. One inline editor or reply
// composer is open at a time per opinion. onInlineComposerChange tells the sheet whether one is open, so the bottom
// composer can hide while it is.
export function CommentThread({
  comments,
  now,
  submitting,
  actions,
  onInlineComposerChange,
}: {
  comments: NestedComment[];
  now: UtcIsoString;
  submitting: boolean;
  actions: CommentThreadActions;
  onInlineComposerChange?: (open: boolean) => void;
}) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const sorted = sortByCreatedAt(comments);

  useEffect(() => {
    onInlineComposerChange?.(replyingTo !== null || editingUid !== null);
  }, [replyingTo, editingUid, onInlineComposerChange]);

  // Unmounting while a composer is open must not leave the sheet's footer hidden.
  useEffect(() => () => onInlineComposerChange?.(false), [onInlineComposerChange]);

  const confirmDelete = (commentUid: string) => {
    if (window.confirm("의견을 삭제할까요?")) {
      actions.onDelete(commentUid);
    }
  };

  return (
    <ol className="flex flex-col gap-v2-group-gap">
      {sorted.map((comment) => {
        const editing = editingUid === comment.uid;
        const replying = replyingTo === comment.uid;
        const replies = sortByCreatedAt(comment.subcomments ?? []);
        return (
          <CommentItem
            key={comment.uid}
            comment={comment}
            timeLabel={formatRelativePast(comment.createdAt, now)}
            level="top"
            canReply={actions.canReply && comment.visibility === "public"}
            replying={replying}
            editing={editing}
            submitting={submitting}
            onReply={() => setReplyingTo(replying ? null : comment.uid)}
            onEdit={() => setEditingUid(editing ? null : comment.uid)}
            onDelete={() => confirmDelete(comment.uid)}
            onPin={() => actions.onPin(comment.uid)}
            onUnpin={actions.onUnpin}
            editor={
              editing ? (
                <CommentComposer
                  label="의견 수정"
                  placeholder="의견을 수정해주세요"
                  initialBody={comment.body}
                  initialVisibility={comment.visibility}
                  submitLabel="저장"
                  submitKind="save"
                  disabled={submitting}
                  autoFocus
                  onSubmit={(body, visibility) => {
                    actions.onUpdate(comment.uid, body, visibility);
                    setEditingUid(null);
                  }}
                />
              ) : undefined
            }
          >
            {replies.length > 0 ? (
              <ol className="mt-3 flex flex-col gap-v2-block-gap">
                {replies.map((reply) => {
                  const replyEditing = editingUid === reply.uid;
                  return (
                    <CommentItem
                      key={reply.uid}
                      comment={reply}
                      timeLabel={formatRelativePast(reply.createdAt, now)}
                      level="reply"
                      canReply={false}
                      replying={false}
                      editing={replyEditing}
                      submitting={submitting}
                      onReply={() => undefined}
                      onEdit={() => setEditingUid(replyEditing ? null : reply.uid)}
                      onDelete={() => confirmDelete(reply.uid)}
                      onPin={() => undefined}
                      onUnpin={() => undefined}
                      editor={
                        replyEditing ? (
                          <CommentComposer
                            label="답글 수정"
                            placeholder="답글을 수정해주세요"
                            initialBody={reply.body}
                            initialVisibility={reply.visibility}
                            showVisibility={false}
                            submitLabel="저장"
                            submitKind="save"
                            disabled={submitting}
                            autoFocus
                            onSubmit={(body) => {
                              actions.onUpdate(reply.uid, body, reply.visibility);
                              setEditingUid(null);
                            }}
                          />
                        ) : undefined
                      }
                    />
                  );
                })}
              </ol>
            ) : null}
            {replying ? (
              <div className="mt-3">
                <CommentComposer
                  label="답글 작성"
                  placeholder="답글을 남겨보세요"
                  showVisibility={false}
                  submitLabel="답글 등록"
                  disabled={submitting}
                  autoFocus
                  onSubmit={(body) => {
                    actions.onReply(comment.uid, body, "public");
                    setReplyingTo(null);
                  }}
                />
              </div>
            ) : null}
          </CommentItem>
        );
      })}
    </ol>
  );
}
