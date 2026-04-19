import { ChatBubbleLeftEllipsisIcon, HeartIcon, LockClosedIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { HeartIcon as SolidHeartIcon } from "@heroicons/react/24/solid";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import ContentCommentEditor from "~/components/features/contents/ContentCommentEditor";
import { useSignIn } from "~/contexts/SignInProvider";
import { MarkdownText, ProfileImage, TagIcon } from "~/components/primitives";
import type { CommunityFeedPost, CommunityPostBlock } from "~/models/community";
import {
  STUDENT_GRADING_TAG_DISPLAY,
  type StudentGradingTagValue,
  sortStudentGradingTags,
} from "~/models/student-grading-tag";
import { StudentCards } from "../students";

type CommunityFeedPostItem = CommunityFeedPost & {
  subjectStudentName?: string | null;
  subjectContentName?: string | null;
  tags?: StudentGradingTagValue[];
  pickupStudents?: { uid: string; name: string }[];
};

type CommunityFeedProps = {
  posts: CommunityFeedPostItem[];
  signedIn: boolean;
  studentsByUid: Record<string, { name: string }>;
};

export default function CommunityFeed({ posts, signedIn, studentsByUid }: CommunityFeedProps) {
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <CommunityPostCard
          key={post.uid}
          post={post}
          signedIn={signedIn}
          studentsByUid={studentsByUid}
        />
      ))}
    </div>
  );
}

function formatPostTimestamp(createdAt: string, updatedAt: string) {
  const created = dayjs(createdAt);
  const updated = dayjs(updatedAt);
  if (updated.isAfter(created)) {
    return `(수정됨) ${updated.format("YYYY.MM.DD")}`;
  }

  return created.format("YYYY.MM.DD");
}

function getActionLabel(post: CommunityFeedPostItem) {
  if (post.postType === "student_review") {
    return "학생 평가를 작성했어요.";
  }

  if (post.postType === "event_opinion") {
    return "이벤트 의견을 남겼어요.";
  }

  return "공략글을 작성했어요.";
}

function getVisibilityLabel(visibility: CommunityFeedPostItem["visibility"]) {
  if (visibility === "private") {
    return "비공개";
  }

  if (visibility === "unlisted") {
    return "프로필 공개";
  }

  return null;
}

function flattenComments(comments: CommunityFeedPost["comments"]) {
  return comments
    .flatMap((comment) => [comment, ...(comment.subcomments ?? [])])
    .sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf());
}

function CommunityPostCard({
  post,
  signedIn,
  studentsByUid,
}: {
  post: CommunityFeedPostItem;
  signedIn: boolean;
  studentsByUid: Record<string, { name: string }>;
}) {
  const { showSignIn } = useSignIn();
  const [comments, setComments] = useState(post.comments);
  const [liked, setLiked] = useState(post.liked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentEditing, setCommentEditing] = useState(false);
  const commentFetcher = useFetcher();
  const likeFetcher = useFetcher<{ likeCount: number; liked: boolean }>();
  const timestamp = formatPostTimestamp(post.createdAt, post.updatedAt);
  const visibilityLabel = getVisibilityLabel(post.visibility);
  const canComment = post.postType === "event_opinion";
  const canLike = post.postType === "guide";

  useEffect(() => {
    setComments(post.comments);
  }, [post.comments]);

  useEffect(() => {
    setLiked(post.liked);
    setLikeCount(post.likeCount);
  }, [post.liked, post.likeCount]);

  useEffect(() => {
    if (Array.isArray(commentFetcher.data)) {
      setComments(commentFetcher.data);
    }
  }, [commentFetcher.data]);

  useEffect(() => {
    if (likeFetcher.data) {
      setLiked(likeFetcher.data.liked);
      setLikeCount(likeFetcher.data.likeCount);
    }
  }, [likeFetcher.data]);

  const commentCount = useMemo(
    () => comments.reduce((count, comment) => count + 1 + (comment.subcomments?.length ?? 0), 0),
    [comments],
  );
  const recentComments = useMemo(() => flattenComments(comments).slice(-2), [comments]);

  const submitComment = (data: {
    action: "create" | "update" | "delete";
    body?: string;
    visibility?: "private" | "public";
    commentUid?: string;
  }) => {
    commentFetcher.submit(data, {
      action: `/api/community/posts/${post.uid}/comments`,
      method: "post",
      encType: "application/json",
    });
  };

  const toggleLike = () => {
    if (!signedIn) {
      showSignIn();
      return;
    }

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((prev) => prev + (nextLiked ? 1 : -1));
    likeFetcher.submit(
      { liked: nextLiked },
      {
        action: `/api/community/posts/${post.uid}/likes`,
        method: "post",
        encType: "application/json",
      },
    );
  };

  return (
    <article className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
      <div className="flex items-start gap-3">
        <Link to={`/@${post.author.username}`} className="shrink-0">
          <ProfileImage studentUid={post.author.profileStudentId} imageSize={8} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 text-sm text-neutral-700 dark:text-neutral-200">
                  <Link to={`/@${post.author.username}`} className="font-semibold hover:underline">
                    @{post.author.username}
                  </Link>{" "}
                  선생님이 {getActionLabel(post)}
                </p>
                {visibilityLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                    <LockClosedIcon className="size-3.5" />
                    {visibilityLabel}
                  </span>
                )}
              </div>
              <PostSubjectMeta post={post} studentsByUid={studentsByUid} />
            </div>
            <span className="shrink-0 pt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{timestamp}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-neutral-200 pt-3 ml-11 dark:border-neutral-700">
        <PostContent post={post} studentsByUid={studentsByUid} />
      </div>

      {(canComment || canLike) && (
        <div className="mt-3 ml-11 flex items-center gap-1.5">
          {canComment && (
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
                commentEditing
                  ? "border-neutral-300 bg-neutral-100 text-neutral-800 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-700"
              }`}
              onClick={() => setCommentEditing((prev) => !prev)}
            >
              <ChatBubbleLeftEllipsisIcon className="size-4" />
              <span>{commentCount}</span>
            </button>
          )}
          {canLike && (
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition ${
                liked
                  ? "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
              }`}
              onClick={toggleLike}
            >
              {liked ? <SolidHeartIcon className="size-4" /> : <HeartIcon className="size-4" />}
              <span>{likeCount}</span>
            </button>
          )}
        </div>
      )}

      {canComment && !commentEditing && recentComments.length > 0 && (
        <div className="mt-2 ml-11 space-y-1">
          {commentCount > recentComments.length && (
            <button
              type="button"
              className="text-xs text-neutral-500 transition hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              onClick={() => setCommentEditing(true)}
            >
              댓글 {commentCount}개 모두 보기
            </button>
          )}
          {recentComments.map((comment) => (
            <button
              key={comment.uid}
              type="button"
              className="block w-full text-left text-sm text-neutral-700 transition hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
              onClick={() => setCommentEditing(true)}
            >
              <span className="font-semibold">@{comment.sensei.username}</span>{" "}
              <span className="line-clamp-1 align-middle">{comment.body}</span>
            </button>
          ))}
        </div>
      )}

      {canComment && commentEditing && (
        <div className="mt-3 w-full rounded-lg bg-neutral-50 px-3 py-3 dark:bg-neutral-900/50">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
            <ChatBubbleLeftEllipsisIcon className="size-4" />
            <span>댓글</span>
          </div>
          <ContentCommentEditor
            comments={comments}
            signedIn={signedIn}
            variant="compact"
            hideVisibilityToggle
            isSubmitting={commentFetcher.state === "submitting"}
            onCreateComment={(body, visibility) => submitComment({ action: "create", body, visibility })}
            onUpdateComment={(commentUid, body, visibility) =>
              submitComment({ action: "update", commentUid, body, visibility })}
            onDeleteComment={(commentUid) => submitComment({ action: "delete", commentUid })}
            placeholder="댓글을 남겨보세요"
          />
        </div>
      )}
    </article>
  );
}

function PostSubjectMeta({
  post,
  studentsByUid,
}: {
  post: CommunityFeedPostItem;
  studentsByUid: Record<string, { name: string }>;
}) {
  if (post.postType === "student_review" && post.subjectStudentUid) {
    return (
      <div className="mt-2">
        <StudentSubjectPill
          uid={post.subjectStudentUid}
          name={post.subjectStudentName ?? studentsByUid[post.subjectStudentUid]?.name ?? "학생 정보"}
        />
      </div>
    );
  }

  if (post.postType === "event_opinion" && post.subjectContentUid) {
    return (
      <div className="mt-2 space-y-2">
        <Link
          to={`/events/${post.subjectContentUid}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <UserGroupIcon className="size-4" />
          <span className="max-w-[14rem] truncate sm:max-w-[18rem]">
            {post.subjectContentName ?? "이벤트 보기"}
          </span>
        </Link>
        {post.pickupStudents && post.pickupStudents.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.pickupStudents.map((student) => (
              <StudentSubjectPill
                key={`${post.uid}-${student.uid}`}
                uid={student.uid}
                name={student.name}
                showName={false}
                imageSize={8}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function StudentSubjectPill({
  uid,
  name,
  showName = true,
  imageSize = 6,
}: {
  uid: string;
  name: string;
  showName?: boolean;
  imageSize?: 6 | 8;
}) {
  return (
    <Link
      to={`/students/${uid}`}
      title={name}
      className={
        showName
          ? "inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-neutral-100 pr-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          : "inline-flex items-center overflow-hidden rounded-full transition hover:opacity-90"
      }
    >
      <ProfileImage studentUid={uid} imageSize={imageSize} />
      {showName && <span>{name}</span>}
    </Link>
  );
}

function PostContent({
  post,
  studentsByUid,
}: {
  post: CommunityFeedPostItem;
  studentsByUid: Record<string, { name: string }>;
}) {
  if (post.postType === "student_review") {
    return (
      <div className="space-y-3">
        <PostBlocks post={post} studentsByUid={studentsByUid} />
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sortStudentGradingTags(post.tags).map((tag) => (
              <div
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              >
                <TagIcon tag={tag} size="sm" />
                <span>{STUDENT_GRADING_TAG_DISPLAY[tag]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (post.postType === "event_opinion") {
    return (
      <div className="space-y-3">
        <PostBlocks post={post} studentsByUid={studentsByUid} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {post.title && <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{post.title}</h3>}
      <PostBlocks post={post} studentsByUid={studentsByUid} />
    </div>
  );
}

function PostBlocks({
  post,
  studentsByUid,
}: {
  post: CommunityFeedPostItem;
  studentsByUid: Record<string, { name: string }>;
}) {
  return (
    <div className="space-y-3">
      {post.blocks.map((block, index) => (
        <BlockView
          key={`${post.uid}-${block.type}-${index}`}
          block={block}
          studentsByUid={studentsByUid}
        />
      ))}
    </div>
  );
}

function BlockView({
  block,
  studentsByUid,
}: {
  block: CommunityPostBlock;
  studentsByUid: Record<string, { name: string }>;
}) {
  if (block.type === "plaintext") {
    if (block.text.trim().length === 0) {
      return null;
    }

    return <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700 dark:text-neutral-200">{block.text}</p>;
  }

  if (block.type === "markdown") {
    if (block.text.trim().length === 0) {
      return null;
    }

    return <MarkdownText text={block.text} />;
  }

  if (block.type === "youtube") {
    return (
      <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
        <iframe
          className="aspect-video w-full"
          src={`https://www.youtube.com/embed/${block.youtubeId}${block.startAt ? `?start=${block.startAt}` : ""}`}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {block.title ?? "편성 정보"}
          </p>
          {(block.raidType || block.seasonIndex !== null) && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {[block.raidType, block.seasonIndex !== null && block.seasonIndex !== undefined ? `#${block.seasonIndex}` : null]
                .filter((value) => value)
                .join(" ")}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-3">
        {block.units.map((unit, index) => (
          <div key={`${block.title ?? "unit"}-${index}`}>
            <p className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">{index + 1}번째 파티</p>
            <StudentCards
              students={unit.map((uid) =>
                uid
                  ? {
                      uid,
                      name: studentsByUid[uid]?.name,
                    }
                  : { uid: null },
              )}
              mobileGrid={6}
              pcGrid={10}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
