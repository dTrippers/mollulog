import { ChatBubbleLeftEllipsisIcon, LockClosedIcon, PlayCircleIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { PlayIcon } from "@heroicons/react/24/solid";
import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import ContentCommentEditor from "~/components/features/contents/ContentCommentEditor";
import LikeButton from "~/components/features/engagement/LikeButton";
import { AttributeBadge, MarkdownText, ProfileImage, TagIcon } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { compareInstantDesc } from "~/lib/date-time";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import type { CommunityFeedPost, CommunityPostBlock } from "~/models/community";
import type { CommunityEngagementActionResult } from "~/models/community-engagement";
import { STUDENT_GRADING_TAG_DISPLAY, sortStudentGradingTags } from "~/models/student-grading-tag";
import type { EnrichedCommunityFeedPost } from "~/views/community";
import { StudentCards } from "../students";
import {
  getCommentEditorPanelClassName,
  getCommentToggleClassName,
  getCommunityFeedClassName,
  getCommunityPostBodyOrder,
  getCommunityPostCardClassName,
  getCommunityPostTimestampMeta,
  getGroupedAvatarPlaceholderClassName,
  getPickupStudentNameClassName,
  getPickupStudentSummary,
  getSubjectMetaClassName,
  shouldGroupPostWithPrevious,
} from "./community-feed-presentation";

export type CommunityFeedPostItem = EnrichedCommunityFeedPost;

type CommunityFeedProps = {
  posts: CommunityFeedPostItem[];
  signedIn: boolean;
  studentsByUid: Record<string, { name: string }>;
  preview?: boolean;
};

export default function CommunityFeed({ posts, signedIn, studentsByUid, preview = false }: CommunityFeedProps) {
  return (
    <div className={getCommunityFeedClassName({ preview })}>
      {posts.map((post, index) => (
        <CommunityPostCard
          key={post.uid}
          post={post}
          signedIn={signedIn}
          studentsByUid={studentsByUid}
          preview={preview}
          firstInFeed={index === 0}
          groupedWithPrevious={!preview && shouldGroupPostWithPrevious(post, posts[index - 1])}
        />
      ))}
    </div>
  );
}

function getPostTypeLabel(post: CommunityFeedPostItem) {
  if (post.postType === "student_review") {
    return "학생 평가";
  }

  if (post.postType === "event_opinion") {
    return "이벤트 의견";
  }

  if (post.postType === "youtube_video") {
    return "영상";
  }

  if (post.postType === "recruitment_result") {
    return "모집 결과";
  }

  if (post.postType === "walkthrough_timeline") {
    return "공략 타임라인";
  }

  return "공략";
}

function getPostSourceName(post: CommunityFeedPostItem) {
  if (post.postType === "youtube_video") {
    return "공식 유튜브";
  }

  if (post.origin === "curated") {
    return post.sourceName ?? "큐레이션";
  }

  return post.author ? `@${post.author.username}` : "알 수 없음";
}

function getVisibilityLabel(visibility: CommunityFeedPostItem["visibility"]) {
  if (visibility === "private") {
    return "비공개";
  }

  return null;
}

function flattenComments(comments: CommunityFeedPost["comments"]) {
  return comments
    .flatMap((comment) => [comment, ...(comment.subcomments ?? [])])
    .sort((a, b) => -compareInstantDesc(a.createdAt, b.createdAt));
}

function CommunityPostCard({
  post,
  signedIn,
  studentsByUid,
  preview,
  firstInFeed,
  groupedWithPrevious,
}: {
  post: CommunityFeedPostItem;
  signedIn: boolean;
  studentsByUid: Record<string, { name: string }>;
  preview: boolean;
  firstInFeed: boolean;
  groupedWithPrevious: boolean;
}) {
  const displayTimeZone = useDisplayTimeZone();
  const [comments, setComments] = useState(post.comments);
  const [commentEditing, setCommentEditing] = useState(false);
  const commentFetcher = useFetcher<CommunityEngagementActionResult>();
  const timestamp = getCommunityPostTimestampMeta(post, displayTimeZone);
  const visibilityLabel = getVisibilityLabel(post.visibility);
  const canComment =
    post.postType === "event_opinion" || post.postType === "youtube_video" || post.postType === "recruitment_result";
  const likeTarget = post.likeTarget;
  const canLike = likeTarget !== null;
  const bodyOrder = getCommunityPostBodyOrder(post.postType);

  useEffect(() => {
    setComments(post.comments);
  }, [post.comments]);

  useEffect(() => {
    if (commentFetcher.data?.kind === "communityPostCommentsChanged") {
      setComments(commentFetcher.data.comments);
    }
  }, [commentFetcher.data]);

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

  return (
    <article className={getCommunityPostCardClassName({ preview, firstInFeed, groupedWithPrevious })}>
      <div className={`flex items-start ${preview ? "gap-2.5" : "gap-3"}`}>
        {!groupedWithPrevious && post.author && (
          <Link to={`/@${post.author.username}`} className="shrink-0">
            <ProfileImage studentUid={post.author.profileStudentId} imageSize={10} />
          </Link>
        )}
        {!groupedWithPrevious && !post.author && (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200">
            <PlayCircleIcon className="size-5" />
          </div>
        )}
        {groupedWithPrevious && <div className={getGroupedAvatarPlaceholderClassName()} aria-hidden />}
        <div className="min-w-0 flex-1">
          {!groupedWithPrevious && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-5">
              {post.author ? (
                <Link
                  to={`/@${post.author.username}`}
                  className="min-w-0 truncate font-semibold text-foreground hover:underline"
                >
                  @{post.author.username}
                </Link>
              ) : post.sourceUrl ? (
                <a
                  href={post.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate font-semibold text-foreground hover:underline"
                >
                  {getPostSourceName(post)}
                </a>
              ) : (
                <span className="min-w-0 truncate font-semibold text-foreground">{getPostSourceName(post)}</span>
              )}
              <span className="text-muted-foreground">{getPostTypeLabel(post)}</span>
              <span className="text-muted-foreground/60">·</span>
              <time className="shrink-0 text-muted-foreground" dateTime={timestamp.dateTime}>
                {timestamp.text}
              </time>
              {timestamp.edited && <span className="text-muted-foreground/70">수정됨</span>}
              {visibilityLabel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  <LockClosedIcon className="size-3.5" />
                  {visibilityLabel}
                </span>
              )}
            </div>
          )}

          {bodyOrder.map((section) =>
            section === "subject" ? (
              <div key="subject" className={preview ? "mt-1" : groupedWithPrevious ? "mt-0" : "mt-2"}>
                <PostSubjectMeta post={post} studentsByUid={studentsByUid} />
              </div>
            ) : (
              <div key="content" className={preview ? "mt-2" : "mt-2.5"}>
                <PostContent post={post} studentsByUid={studentsByUid} />
              </div>
            ),
          )}

          {!preview && (canComment || canLike) && (
            <div className="mt-4 flex max-w-md items-center gap-2 text-muted-foreground">
              {canComment && (
                <button
                  type="button"
                  className={getCommentToggleClassName({ active: commentEditing })}
                  onClick={() => setCommentEditing((prev) => !prev)}
                  aria-label={`댓글 ${commentCount}개`}
                >
                  <ChatBubbleLeftEllipsisIcon className="size-4" />
                  <span>{commentCount}</span>
                </button>
              )}
              {likeTarget && (
                <LikeButton
                  targetUid={likeTarget.uid}
                  action={likeTarget.action}
                  liked={post.liked}
                  likeCount={post.likeCount}
                  signedIn={signedIn}
                />
              )}
            </div>
          )}

          {!preview && canComment && !commentEditing && recentComments.length > 0 && (
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              {commentCount > recentComments.length && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setCommentEditing(true)}
                >
                  댓글 {commentCount}개 모두 보기
                </button>
              )}
              {recentComments.map((comment) => (
                <button
                  key={comment.uid}
                  type="button"
                  className="block w-full text-left transition-colors hover:text-foreground"
                  onClick={() => setCommentEditing(true)}
                >
                  <span className="font-medium text-foreground">@{comment.sensei.username}</span>{" "}
                  <span className="line-clamp-1 align-middle">{comment.body}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {!preview && canComment && commentEditing && (
        <div className={getCommentEditorPanelClassName({ groupedWithPrevious })}>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
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
              submitComment({ action: "update", commentUid, body, visibility })
            }
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
      <div className={getSubjectMetaClassName(post.postType)}>
        <StudentSubjectLink
          uid={post.subjectStudentUid}
          name={post.subjectStudentName ?? studentsByUid[post.subjectStudentUid]?.name ?? "학생 정보"}
        />
      </div>
    );
  }

  if ((post.postType === "event_opinion" || post.postType === "recruitment_result") && post.subjectContentUid) {
    const pickupStudentSummary = post.pickupStudents ? getPickupStudentSummary(post.pickupStudents) : null;

    return (
      <div className={getSubjectMetaClassName(post.postType)}>
        <Link
          to={`/events/${post.subjectContentUid}`}
          className="inline-flex max-w-full items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline"
        >
          <UserGroupIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
          <span className="max-w-64 truncate sm:max-w-md">{post.subjectContentName ?? "이벤트 보기"}</span>
        </Link>
        {pickupStudentSummary && pickupStudentSummary.visibleStudents.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
            <span className="mr-0.5 shrink-0 text-muted-foreground/70">픽업</span>
            {pickupStudentSummary.visibleStudents.map((student) => (
              <StudentSubjectLink
                key={`${post.uid}-${student.uid}`}
                uid={student.uid}
                name={student.name}
                imageSize={6}
                nameClassName={getPickupStudentNameClassName()}
              />
            ))}
            {pickupStudentSummary.remainingCount > 0 && (
              <span className="ml-0.5 shrink-0 text-muted-foreground">외 {pickupStudentSummary.remainingCount}명</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function StudentSubjectLink({
  uid,
  name,
  imageSize = 6,
  nameClassName = "min-w-0 truncate",
}: {
  uid: string;
  name: string;
  imageSize?: 6;
  nameClassName?: string;
}) {
  return (
    <Link
      to={`/students/${uid}`}
      title={name}
      className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground hover:underline"
    >
      <ProfileImage studentUid={uid} imageSize={imageSize} />
      <span className={nameClassName}>{name}</span>
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
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {sortStudentGradingTags(post.tags).map((tag) => (
              <div key={tag} className="inline-flex cursor-default items-center gap-1 text-xs text-muted-foreground">
                <TagIcon tag={tag} size="sm" />
                <span>{STUDENT_GRADING_TAG_DISPLAY[tag]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (post.postType === "recruitment_result") {
    return (
      <div className="space-y-3">
        {post.recruitmentStats && <RecruitmentResultStats stats={post.recruitmentStats} />}
        <PostBlocks post={post} studentsByUid={studentsByUid} />
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
      {post.postType === "youtube_video" && post.title ? (
        <h3 className="text-base font-semibold leading-6 text-foreground">{getDisplayYoutubeTitle(post.title)}</h3>
      ) : (
        post.title && <h3 className="text-lg font-semibold text-foreground">{post.title}</h3>
      )}
      <PostBlocks post={post} studentsByUid={studentsByUid} />
    </div>
  );
}

function RecruitmentResultStats({ stats }: { stats: NonNullable<CommunityFeedPostItem["recruitmentStats"]> }) {
  const items = [
    { label: "총 모집", value: stats.totalTrial === null ? "미입력" : `${stats.totalTrial}회` },
    { label: "★3", value: `${stats.tier3Count}회` },
    { label: "픽업", value: `${stats.pickupCount}회` },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-baseline gap-1">
          <span>{item.label}</span>
          <span className="font-semibold text-foreground">{item.value}</span>
        </span>
      ))}
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
        <BlockView key={`${post.uid}-${block.type}-${index}`} block={block} post={post} studentsByUid={studentsByUid} />
      ))}
    </div>
  );
}

function BlockView({
  block,
  post,
  studentsByUid,
}: {
  block: CommunityPostBlock;
  post: CommunityFeedPostItem;
  studentsByUid: Record<string, { name: string }>;
}) {
  if (block.type === "plaintext") {
    if (block.text.trim().length === 0) {
      return null;
    }

    return (
      <p
        className={`${post.postType === "walkthrough_timeline" ? "line-clamp-2" : ""} whitespace-pre-wrap text-sm leading-6 text-foreground sm:text-base`}
      >
        {block.text}
      </p>
    );
  }

  if (block.type === "markdown") {
    if (block.text.trim().length === 0) {
      return null;
    }

    return <MarkdownText text={block.text} />;
  }

  if (block.type === "youtube") {
    return <YoutubePreviewBlock block={block} post={post} />;
  }

  if (block.type === "walkthrough_timeline") {
    const firstPartyStudentUids = block.usedStudentUids.slice(0, block.partySize ?? 6);
    return (
      <Link
        to={`/timelines/${block.timelineUid}`}
        className="relative block overflow-hidden rounded-lg bg-muted/50 p-4 transition-colors hover:bg-muted"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-contain bg-right bg-no-repeat opacity-45"
          style={{ backgroundImage: `url(${bossImageUrl(block.bossUid)})` }}
        />
        <span className="pointer-events-none absolute inset-0 bg-linear-to-r from-muted from-45% via-muted/85 via-70% to-muted/20" />
        <div className="relative space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <AttributeBadge text={terrainLocale[block.terrain]} color={null} />
            <AttributeBadge text={defenseTypeLocale[block.defenseType]} color={defenseTypeColor[block.defenseType]} />
            <AttributeBadge text={difficultyLocale[block.maxDifficulty]} color={null} />
          </div>
          {firstPartyStudentUids.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">사용 학생</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {firstPartyStudentUids.map((studentUid) => (
                  <ProfileImage key={studentUid} studentUid={studentUid} imageSize={8} />
                ))}
                {block.partyCount > 1 ? (
                  <span className="ml-1 text-xs font-medium text-muted-foreground">외 {block.partyCount - 1}편성</span>
                ) : null}
              </div>
            </div>
          ) : null}
          <p className="text-sm font-medium text-primary">공략 타임라인 자세히 보기</p>
        </div>
      </Link>
    );
  }

  return (
    <div className="rounded-lg bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{block.title ?? "편성 정보"}</p>
          {(block.raidType || block.seasonIndex !== null) && (
            <p className="text-xs text-muted-foreground">
              {[
                block.raidType,
                block.seasonIndex !== null && block.seasonIndex !== undefined ? `#${block.seasonIndex}` : null,
              ]
                .filter((value) => value)
                .join(" ")}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-3">
        {block.units.map((unit, index) => (
          <div key={`${block.title ?? "unit"}-${index}`}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{index + 1}번째 파티</p>
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

function getYoutubeThumbnailUrl(post: CommunityFeedPostItem): string | null {
  const thumbnailUrl = post.sourceMetadata.thumbnailUrl;
  return typeof thumbnailUrl === "string" && thumbnailUrl.length > 0 ? thumbnailUrl : null;
}

function getDisplayYoutubeTitle(title: string): string {
  return title.replace(/^\s*\[블루 아카이브\]\s*/, "").trim();
}

function getYoutubeWatchUrl(block: Extract<CommunityPostBlock, { type: "youtube" }>, sourceUrl: string | null) {
  const url = sourceUrl ?? `https://www.youtube.com/watch?v=${block.youtubeId}`;

  if (block.startAt) {
    const params = new URLSearchParams({ t: `${block.startAt}s` });
    return `${url}${url.includes("?") ? "&" : "?"}${params.toString()}`;
  }

  return url;
}

function YoutubePreviewBlock({
  block,
  post,
}: {
  block: Extract<CommunityPostBlock, { type: "youtube" }>;
  post: CommunityFeedPostItem;
}) {
  const thumbnailUrl = getYoutubeThumbnailUrl(post);
  const title = post.title ? getDisplayYoutubeTitle(post.title) : "YouTube video";
  const watchUrl = getYoutubeWatchUrl(block, post.sourceUrl);

  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noreferrer"
      className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-muted text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:max-w-md"
      aria-label={`YouTube에서 동영상 보기: ${title}`}
    >
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="size-full bg-muted" />
      )}
      <div className="absolute inset-0 bg-black/10 transition group-hover:bg-black/15" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-black/55 text-white shadow-md shadow-black/20 ring-1 ring-white/20 backdrop-blur-sm transition group-hover:scale-105 group-hover:bg-black/65 sm:size-12">
          <PlayIcon className="ml-0.5 size-5 sm:size-6" />
        </span>
      </span>
    </a>
  );
}
