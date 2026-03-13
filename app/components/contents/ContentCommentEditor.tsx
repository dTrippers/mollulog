import { LockClosedIcon, LockOpenIcon, ArrowUturnLeftIcon, TrashIcon, PencilSquareIcon, ArrowUpIcon, XMarkIcon, BookmarkIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { Callout } from "~/components/atoms/typography";
import { ClickableSurface } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { sanitizeClassName } from "~/prophandlers";
import CommentView from "./CommentView";

type CommentData = {
  uid: string;
  body: string;
  visibility: "private" | "public";
  pinned?: boolean;
  createdAt: string;
  sensei: {
    me: boolean;
    username: string;
    profileStudentId: string | null;
  };
  subcomments?: CommentData[];
};

type ContentCommentEditorProps = {
  comments: CommentData[];
  signedIn: boolean;
  placeholder?: string;
  onCreateComment: (body: string, visibility: "private" | "public") => void;
  onCreateSubcomment: (parentCommentId: string, body: string, visibility: "private" | "public") => void;
  onUpdateComment?: (commentUid: string, body: string, visibility: "private" | "public") => void;
  onDeleteComment?: (commentUid: string) => void;
  onPinComment?: (commentUid: string) => void;
  onUnpinComment?: () => void;
  isSubmitting?: boolean;
};

export default function ContentCommentEditor({ comments, signedIn, placeholder, onCreateComment, onCreateSubcomment, onUpdateComment, onDeleteComment, onPinComment, onUnpinComment, isSubmitting = false }: ContentCommentEditorProps) {
  const { showSignIn } = useSignIn();
  const [newCommentBody, setNewCommentBody] = useState<string>("");
  const [newCommentVisibility, setNewCommentVisibility] = useState<"private" | "public">("public");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState<string>("");
  const [replyVisibility, setReplyVisibility] = useState<"private" | "public">("public");
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editBody, setEditBody] = useState<string>("");
  const [editVisibility, setEditVisibility] = useState<"private" | "public">("private");

  const handleCreateComment = () => {
    if (!isSubmitting && newCommentBody.trim()) {
      onCreateComment(newCommentBody.trim(), newCommentVisibility);
      setNewCommentBody("");
      setNewCommentVisibility("private");
    }
  };

  const handleCreateSubcomment = (parentCommentId: string) => {
    if (!isSubmitting && replyBody.trim()) {
      onCreateSubcomment(parentCommentId, replyBody.trim(), replyVisibility);
      setReplyBody("");
      setReplyVisibility("private");
      setReplyingTo(null);
    }
  };

  const handleStartEdit = (comment: CommentData) => {
    setEditingComment(comment.uid);
    setEditBody(comment.body);
    setEditVisibility(comment.visibility);
  };

  const handleUpdateComment = (commentUid: string) => {
    if (!isSubmitting && editBody.trim() && onUpdateComment) {
      onUpdateComment(commentUid, editBody.trim(), editVisibility);
      setEditingComment(null);
      setEditBody("");
      setEditVisibility("private");
    }
  };

  const handleCancelEdit = () => {
    setEditingComment(null);
    setEditBody("");
    setEditVisibility("private");
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
    setReplyBody("");
    setReplyVisibility("private");
  };

  const handleDeleteComment = (commentUid: string) => {
    if (!isSubmitting && onDeleteComment && confirm("의견을 삭제할까요?")) {
      onDeleteComment(commentUid);
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="space-y-1 -mt-3 mb-4">
          {comments.length > 0 ?
            comments.map((comment) => (
              <div key={comment.uid} className="mb-3">
                <div className={editingComment === comment.uid ? "opacity-50" : ""}>
                  <CommentDisplay
                    comment={comment}
                    signedIn={signedIn}
                    isSubmitting={isSubmitting}
                    isEditing={editingComment === comment.uid}
                    isReplying={replyingTo === comment.uid}
                    onReply={() => setReplyingTo(comment.uid)}
                    onEdit={() => handleStartEdit(comment)}
                    onDelete={() => handleDeleteComment(comment.uid)}
                    onPin={onPinComment ? () => onPinComment(comment.uid) : undefined}
                    onUnpin={onUnpinComment}
                    onUpdateComment={onUpdateComment}
                    onDeleteComment={onDeleteComment}
                    onCancelEdit={handleCancelEdit}
                    onCancelReply={handleCancelReply}
                  />
                </div>
                {editingComment === comment.uid && (
                  <CommentForm
                    body={editBody}
                    onBodyChange={setEditBody}
                    visibility={editVisibility}
                    onVisibilityChange={setEditVisibility}
                    onSubmit={() => handleUpdateComment(comment.uid)}
                    isSubmitting={isSubmitting}
                    placeholder={placeholder ?? "의견을 남겨보세요"}
                  />
                )}
                {signedIn && (replyingTo === comment.uid) && (
                  <div className="my-2 ml-2">
                    <CommentForm
                      body={replyBody}
                      onBodyChange={setReplyBody}
                      visibility={replyVisibility}
                      onVisibilityChange={setReplyVisibility}
                      onSubmit={() => handleCreateSubcomment(comment.uid)}
                      isSubmitting={isSubmitting}
                      placeholder="답글을 남겨보세요"
                    />
                  </div>
                )}
                {comment.subcomments && comment.subcomments.length > 0 && (
                  <div className="ml-2 my-1 space-y-1 border-l-2 border-neutral-200 dark:border-neutral-700 pl-4">
                    {comment.subcomments.map((subcomment) => (
                      <div key={subcomment.uid}>
                        <div className={editingComment === subcomment.uid ? "opacity-50" : ""}>
                          <CommentDisplay
                            comment={subcomment}
                            signedIn={signedIn}
                            isSubmitting={isSubmitting}
                            isEditing={editingComment === subcomment.uid}
                            isReplying={replyingTo === subcomment.uid}
                            onEdit={() => handleStartEdit(subcomment)}
                            onDelete={() => handleDeleteComment(subcomment.uid)}
                            onUpdateComment={onUpdateComment}
                            onDeleteComment={onDeleteComment}
                            onCancelEdit={handleCancelEdit}
                            onCancelReply={handleCancelReply}
                          />
                        </div>
                        {editingComment === subcomment.uid && (
                          <CommentForm
                            body={editBody}
                            onBodyChange={setEditBody}
                            visibility={editVisibility}
                            onVisibilityChange={setEditVisibility}
                            onSubmit={() => handleUpdateComment(subcomment.uid)}
                            isSubmitting={isSubmitting}
                            placeholder="의견을 남겨보세요"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )) :
            <p className="my-16 text-center text-neutral-500 dark:text-neutral-400">공개된 의견이 없어요</p>
          }
        </div>
      </div>
      <div className="shrink-0">
        {signedIn ? (
          <CommentForm
            body={newCommentBody}
            onBodyChange={setNewCommentBody}
            visibility={newCommentVisibility}
            onVisibilityChange={setNewCommentVisibility}
            onSubmit={handleCreateComment}
            isSubmitting={isSubmitting}
            placeholder={placeholder ?? "의견을 남겨보세요"}
          />
        ) : (
          <ClickableSurface className="w-full" onClick={() => showSignIn()}>
            <Callout emoji="💬" className="hover:bg-neutral-200 dark:hover:bg-neutral-900 cursor-pointer transition">
              <p>로그인 후 의견을 남겨보세요.</p>
            </Callout>
          </ClickableSurface>
        )}
      </div>
    </>
  );
}

type CommentFormProps = {
  body: string;
  onBodyChange: (value: string) => void;
  visibility: "private" | "public";
  onVisibilityChange: (visibility: "private" | "public") => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  placeholder: string;
};

function CommentForm({ body, onBodyChange, visibility, onVisibilityChange, onSubmit, isSubmitting, placeholder }: CommentFormProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isSubmitting && body.trim()) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="pl-4 pr-2 py-1 my-2 border border-neutral-200 dark:border-neutral-700 text-sm rounded-xl bg-white dark:bg-neutral-800">
      <div className="flex items-center gap-2 min-w-0">
        <input
          className="flex-1 min-w-0 bg-transparent text-sm xl:text-base text-neutral-700 dark:text-neutral-300 focus:outline-none"
          placeholder={placeholder}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting}
        />
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Visibility Toggle Button */}
          <button
            type="button"
            className={sanitizeClassName(`
              flex items-center gap-1 px-2 py-1.5 rounded-lg transition text-sm border shrink-0
              ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700"}
              ${visibility === "public"
                ? "text-blue-500 dark:text-blue-400 border-blue-300 dark:border-blue-600" 
                : "text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700"
              }
            `)}
            onClick={() => onVisibilityChange(visibility === "private" ? "public" : "private")}
            disabled={isSubmitting}
          >
            {visibility === "private" ? <LockClosedIcon className="size-4 shrink-0" /> : <LockOpenIcon className="size-4 shrink-0" />}
            <span className="hidden sm:inline">{visibility === "private" ? "나만 보기" : "전체 공개"}</span>
          </button>

          {/* Submit Button */}
          <button
            type="button"
            className={sanitizeClassName(`
              p-2 rounded-lg transition
              ${(isSubmitting || !body.trim()) ?
                "bg-neutral-400 dark:bg-neutral-500 cursor-not-allowed" :
                "bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 cursor-pointer"
              }
            `)}
            onClick={onSubmit}
            disabled={isSubmitting || !body.trim()}
          >
            <ArrowUpIcon className="size-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

type CommentDisplayProps = {
  comment: CommentData;
  signedIn: boolean;
  isSubmitting: boolean;
  isEditing: boolean;
  isReplying: boolean;
  onReply?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onUpdateComment?: (commentUid: string, body: string, visibility: "private" | "public") => void;
  onDeleteComment?: (commentUid: string) => void;
  onCancelEdit: () => void;
  onCancelReply?: () => void;
};

function CommentDisplay({ comment, signedIn, isSubmitting, isEditing, isReplying, onReply, onEdit, onDelete, onPin, onUnpin, onUpdateComment, onDeleteComment, onCancelEdit, onCancelReply }: CommentDisplayProps) {
  const isSubcomment = (onReply === undefined);
  const showActions = comment.sensei.me && onUpdateComment && onDeleteComment;
  const showPinActions = !isSubcomment && comment.sensei.me && (onPin || onUnpin);
  return (
    <div className="my-3 flex items-start gap-x-2">
      <div className="flex-1">
        <CommentView
          body={comment.body}
          visibility={comment.visibility}
          createdAt={comment.createdAt}
          sensei={comment.sensei}
        />
      </div>
      <div className={`flex gap-x-1 shrink-0 ${!isSubcomment ? "text-neutral-500 dark:text-neutral-400" : ""}`}>
        {signedIn && !isSubcomment && comment.visibility === "public" && (
          <button
            type="button"
            className="p-1 rounded transition cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800"
            onClick={isReplying ? onCancelReply : onReply}
            disabled={isSubmitting}
          >
            {isReplying ? <XMarkIcon className="size-4" /> : <ArrowUturnLeftIcon className="size-4 transform scale-y-[-1]" />}
          </button>
        )}
        {showPinActions && (
          <button
            type="button"
            className={sanitizeClassName(`
              p-1 rounded transition
              ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800"}
              ${comment.pinned ? "text-blue-500 dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}
            `)}
            onClick={comment.pinned ? onUnpin : onPin}
            disabled={isSubmitting}
            title={comment.pinned ? "고정 해제" : "고정하기"}
          >
            <BookmarkIcon className="size-4" />
          </button>
        )}
        {showActions && (
          <>
            {isEditing ? (
              <button
                type="button"
                className={`p-1 rounded transition ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800"}`}
                onClick={onCancelEdit}
                disabled={isSubmitting}
              >
                <XMarkIcon className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                className = {`p-1 rounded transition ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800"}`}
                onClick={onEdit}
                disabled={isSubmitting}
              >
                <PencilSquareIcon className={`size-4 ${isSubcomment ? "text-neutral-500 dark:text-neutral-400" : ""}`} />
              </button>
            )}
            <button
              type="button"
              className={sanitizeClassName(`
                p-1 rounded transition text-neutral-500 dark:text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors
                ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800"}
              `)}
              onClick={onDelete}
              disabled={isSubmitting}
            >
              <TrashIcon className="size-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
