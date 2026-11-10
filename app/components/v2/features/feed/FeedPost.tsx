import { ChatBubbleLeftEllipsisIcon, LockClosedIcon } from "@heroicons/react/16/solid";
import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import { useSignIn } from "~/contexts/SignInProvider";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { nowUtcIso } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import type { NestedCommunityComment } from "~/models/community";
import type { CommunityEngagementActionResult } from "~/models/community-engagement";
import type { NestedComment } from "~/models/content";
import { STUDENT_GRADING_TAG_DISPLAY, sortStudentGradingTags } from "~/models/student-grading-tag";
import type { EnrichedCommunityFeedPost, EnrichedCommunityPostBlock } from "~/views/community";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { MarkdownContent } from "../../primitives/MarkdownContent";
import { CommentComposer, type CommentVisibility } from "../comments/CommentComposer";
import { CommentThread } from "../comments/CommentThread";
import { SenseiAvatar } from "../comments/SenseiAvatar";
import { GradingTagIcon } from "../students/GradingTagIcon";
import { EventAttachment, StudentAttachment, VideoAttachment, WalkthroughAttachment } from "./FeedAttachments";
import { FeedLikeButton } from "./FeedLikeButton";
import { getFeedPostTimestamp, getFeedPostTypeLabel } from "./feed-model";

export type FeedPostItem = EnrichedCommunityFeedPost;
export type FeedStudentsByUid = Record<string, { name: string }>;

function toThreadComments(comments: NestedCommunityComment[]): NestedComment[] {
  return comments.map((comment) => ({
    ...comment,
    pinned: false,
    subcomments: comment.subcomments ? toThreadComments(comment.subcomments) : undefined,
  }));
}

function countComments(comments: NestedCommunityComment[]): number {
  return comments.reduce((count, comment) => count + 1 + (comment.subcomments?.length ?? 0), 0);
}

function displayYoutubeTitle(title: string): string {
  return title.replace(/^\s*\[블루 아카이브\]\s*/, "").trim();
}

function youtubeWatchUrl(block: Extract<EnrichedCommunityPostBlock, { type: "youtube" }>, sourceUrl: string | null) {
  const url = sourceUrl ?? `https://www.youtube.com/watch?v=${block.youtubeId}`;
  if (!block.startAt) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${new URLSearchParams({ t: `${block.startAt}s` }).toString()}`;
}

// One post of a person's feed, in the 2.0 shape: avatar, one name line, the text, a compact attachment, then the
// reactions. Only a post that takes comments shows the comment toggle, and only a post with a like target shows a like.
export function FeedPost({
  post,
  signedIn,
  studentsByUid,
}: {
  post: FeedPostItem;
  signedIn: boolean;
  studentsByUid: FeedStudentsByUid;
}) {
  const timeZone = useDisplayTimeZone();
  const { showSignIn } = useSignIn();
  const commentFetcher = useFetcher<CommunityEngagementActionResult>();
  const [comments, setComments] = useState(post.comments);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const timestamp = getFeedPostTimestamp(post, timeZone);
  const canComment =
    post.postType === "event_opinion" || post.postType === "youtube_video" || post.postType === "recruitment_result";
  const likeTarget = post.likeTarget;
  const commentCount = useMemo(() => countComments(comments), [comments]);
  const threadComments = useMemo(() => toThreadComments(comments), [comments]);

  useEffect(() => {
    setComments(post.comments);
  }, [post.comments]);

  useEffect(() => {
    if (commentFetcher.data?.kind === "communityPostCommentsChanged") {
      setComments(commentFetcher.data.comments);
    }
  }, [commentFetcher.data]);

  const submitComment = (data: {
    action: "create" | "createSubcomment" | "update" | "delete";
    body?: string;
    visibility?: CommentVisibility;
    parentCommentUid?: string;
    commentUid?: string;
  }) =>
    commentFetcher.submit(data, {
      action: `/api/community/posts/${post.uid}/comments`,
      method: "post",
      encType: "application/json",
    });

  const submitting = commentFetcher.state !== "idle";
  const authorName = post.author ? `@${post.author.username}` : (post.sourceName ?? "");
  const eventAttachment =
    (post.postType === "event_opinion" || post.postType === "recruitment_result") &&
    post.subjectContentUid &&
    post.subjectContentName ? (
      <EventAttachment
        contentUid={post.subjectContentUid}
        contentType={post.subjectContentType}
        name={post.subjectContentName}
        pickupStudents={post.pickupStudents}
      />
    ) : null;
  const studentName = post.subjectStudentUid
    ? (post.subjectStudentName ?? studentsByUid[post.subjectStudentUid]?.name ?? null)
    : null;
  const studentAttachment =
    post.postType === "student_review" && post.subjectStudentUid && studentName ? (
      <StudentAttachment uid={post.subjectStudentUid} name={studentName} />
    ) : null;

  return (
    <article className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 p-v2-block-p">
      {post.author ? (
        <Link
          to={`/@${post.author.username}`}
          className={cn("h-fit rounded-full", v2FocusRing)}
          aria-label={authorName}
        >
          <SenseiAvatar profileStudentId={post.author.profileStudentId} labels={post.author.labels} size="post" />
        </Link>
      ) : (
        <span aria-hidden="true" className="size-10" />
      )}
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[0.8125rem] leading-5 text-v2-fg-tertiary">
          {post.author ? (
            <Link
              to={`/@${post.author.username}`}
              className="min-w-0 truncate text-sm font-bold text-v2-fg hover:underline"
            >
              {authorName}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-sm font-bold text-v2-fg">{authorName}</span>
          )}
          <span aria-hidden="true">·</span>
          <span>{getFeedPostTypeLabel(post.postType)}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={timestamp.dateTime} className="tabular-nums">
            {timestamp.text}
          </time>
          {timestamp.edited ? (
            <>
              <span aria-hidden="true">·</span>
              <span>수정됨</span>
            </>
          ) : null}
          {post.visibility === "private" ? (
            <span className="inline-flex items-center gap-0.5">
              <LockClosedIcon className="size-3.5" aria-hidden="true" />
              비공개
            </span>
          ) : null}
        </div>

        {eventAttachment}
        {studentAttachment}

        {post.postType === "recruitment_result" && post.recruitmentStats ? (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-xs text-v2-fg-tertiary tabular-nums">
            <span>
              총 모집{" "}
              <b className="font-semibold text-v2-fg">
                {post.recruitmentStats.totalTrial === null
                  ? "미입력"
                  : `${post.recruitmentStats.totalTrial.toLocaleString("ko-KR")}회`}
              </b>
            </span>
            <span>
              ★3{" "}
              <b className="font-semibold text-v2-fg">{post.recruitmentStats.tier3Count.toLocaleString("ko-KR")}회</b>
            </span>
            <span>
              픽업{" "}
              <b className="font-semibold text-v2-fg">{post.recruitmentStats.pickupCount.toLocaleString("ko-KR")}회</b>
            </span>
          </p>
        ) : null}

        {post.title ? (
          <h3 className="mt-1 text-base leading-[1.4] font-bold text-v2-fg">
            {post.postType === "youtube_video" ? displayYoutubeTitle(post.title) : post.title}
          </h3>
        ) : null}

        {post.blocks.map((block, index) => {
          if (block.type === "plaintext") {
            return block.text.trim().length === 0 ? null : (
              <p
                // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no id and never reorder
                key={`${block.type}-${index}`}
                className={cn(
                  "mt-1 text-[0.9375rem] leading-[1.6] break-keep whitespace-pre-wrap text-v2-fg [overflow-wrap:anywhere]",
                  post.postType === "walkthrough_timeline" && "line-clamp-2",
                )}
              >
                {block.text}
              </p>
            );
          }
          if (block.type === "markdown") {
            return block.text.trim().length === 0 ? null : (
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no id and never reorder
              <div key={`${block.type}-${index}`} className="mt-1">
                <MarkdownContent html={block.html} headingLevel={3} />
              </div>
            );
          }
          if (block.type === "walkthrough_timeline") {
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no id and never reorder
            return <WalkthroughAttachment key={`${block.type}-${index}`} block={block} />;
          }
          if (block.type === "youtube") {
            return (
              <VideoAttachment
                // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no id and never reorder
                key={`${block.type}-${index}`}
                href={youtubeWatchUrl(block, post.sourceUrl)}
                title={post.title ? displayYoutubeTitle(post.title) : "YouTube에서 보기"}
              />
            );
          }
          return null;
        })}

        {post.postType === "student_review" && post.tags.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {sortStudentGradingTags(post.tags).map((tag) => (
              <li key={tag} className="inline-flex items-center gap-1 text-xs text-v2-fg-tertiary">
                <GradingTagIcon tag={tag} size="xs" />
                {STUDENT_GRADING_TAG_DISPLAY[tag]}
              </li>
            ))}
          </ul>
        ) : null}

        {canComment || likeTarget ? (
          <div className="mt-2 flex items-center gap-4">
            {canComment ? (
              <button
                type="button"
                onClick={() => setCommentsOpen((open) => !open)}
                aria-expanded={commentsOpen}
                aria-label={`댓글 ${commentCount}개`}
                className={cn(
                  "-ml-1.5 inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[0.8125rem] tabular-nums hover:bg-v2-hover hover:text-v2-fg",
                  commentsOpen ? "text-v2-fg" : "text-v2-fg-tertiary",
                  v2FocusRing,
                )}
              >
                <ChatBubbleLeftEllipsisIcon className="size-4" aria-hidden="true" />
                {commentCount}
              </button>
            ) : null}
            {likeTarget ? (
              <FeedLikeButton
                targetUid={likeTarget.uid}
                action={likeTarget.action}
                liked={post.liked}
                likeCount={post.likeCount}
                signedIn={signedIn}
              />
            ) : null}
          </div>
        ) : null}

        {canComment && commentsOpen ? (
          <div className="mt-2 flex flex-col gap-v2-group-gap rounded-lg bg-v2-inset p-v2-tile-p">
            {threadComments.length > 0 ? (
              <CommentThread
                comments={threadComments}
                now={nowUtcIso()}
                submitting={submitting}
                actions={{
                  canReply: signedIn,
                  onReply: (parentCommentUid, body) =>
                    submitComment({ action: "createSubcomment", body, parentCommentUid }),
                  onUpdate: (commentUid, body, visibility) =>
                    submitComment({ action: "update", commentUid, body, visibility }),
                  onDelete: (commentUid) => submitComment({ action: "delete", commentUid }),
                }}
              />
            ) : (
              <p className="text-sm text-v2-fg-tertiary">아직 댓글이 없어요</p>
            )}
            {signedIn ? (
              <CommentComposer
                label="댓글 작성"
                placeholder="댓글을 남겨보세요"
                showVisibility={false}
                submitLabel="댓글 등록"
                disabled={submitting}
                onSubmit={(body) => submitComment({ action: "create", body, visibility: "public" })}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm text-v2-fg-secondary">
                로그인하면 댓글을 남길 수 있어요.
                <Button size="sm" onClick={showSignIn}>
                  로그인
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
