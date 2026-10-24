import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { ArrowTopRightOnSquareIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { SenseiAvatar } from "~/components/v2/features/comments/SenseiAvatar";
import StudentPortrait from "~/components/v2/features/students/StudentPortrait";
import { formatInstant, type UtcIsoString } from "~/lib/date-time";
import { defenseTypeLocale, difficultyLocale, terrainLocale } from "~/locales/ko";
import { STUDENT_GRADING_TAG_DISPLAY, sortStudentGradingTags } from "~/models/student-grading-tag";
import type { HomeYoutubeChannelSection, YoutubeChannelKey } from "~/models/youtube";
import type { EnrichedCommunityFeedPost } from "~/views/community";
import { HomeEmpty, HomeRetryButton, HomeSection } from "./HomePrimitives";

export type HomeFeedState = { status: "success"; posts: EnrichedCommunityFeedPost[] } | { status: "error" };

export type HomeYoutubeState = { status: "success"; sections: HomeYoutubeChannelSection[] } | { status: "error" };

export type HomeYoutubeChannelLink = { key: YoutubeChannelKey; url: string };

const CHANNEL_TITLES: Record<YoutubeChannelKey, string> = {
  kr: "한국 공식 채널",
  jp: "일본 공식 채널",
};

const POST_TYPE_LABELS: Record<string, string> = {
  student_review: "학생 평가",
  event_opinion: "이벤트 의견",
  walkthrough_timeline: "공략 타임라인",
};

// The item's target follows the existing community feed: an event opinion opens its event, a student review opens its
// student, and a walkthrough opens its timeline. The item has no link when the post has no such target.
function feedItemHref(post: EnrichedCommunityFeedPost): string | null {
  if (post.postType === "event_opinion" && post.subjectContentUid) {
    return `/events/${post.subjectContentUid}`;
  }
  if (post.postType === "student_review" && post.subjectStudentUid) {
    return `/students/${post.subjectStudentUid}`;
  }
  if (post.postType === "walkthrough_timeline") {
    const timeline = post.blocks.find((block) => block.type === "walkthrough_timeline");
    return timeline && "timelineUid" in timeline ? `/timelines/${timeline.timelineUid}` : null;
  }
  return null;
}

function FeedStudentImage({ uid, name, showName = false }: { uid: string; name: string; showName?: boolean }) {
  return (
    <Link
      to={`/students/${uid}`}
      aria-label={`${name} 정보`}
      title={name}
      className="inline-flex min-w-0 items-center gap-1.5 rounded-sm transition-opacity duration-v2-fast ease-v2-standard hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none"
    >
      <StudentPortrait uid={uid} className="size-6 rounded-full object-cover" />
      {showName ? <span className="truncate">{name}</span> : null}
    </Link>
  );
}

// The subject follows the existing feed: a student portrait and name, or an event line followed by pickup portraits.
function feedContext(post: EnrichedCommunityFeedPost): ReactNode {
  if (post.postType === "student_review") {
    return post.subjectStudentUid && post.subjectStudentName ? (
      <FeedStudentImage uid={post.subjectStudentUid} name={post.subjectStudentName} showName />
    ) : null;
  }
  if (post.postType === "event_opinion" || post.postType === "recruitment_result") {
    const students = post.pickupStudents ?? [];
    const visibleStudents = students.slice(0, students.length > 7 ? 5 : students.length);
    const remainingCount = students.length - visibleStudents.length;
    return post.subjectContentName || visibleStudents.length > 0 ? (
      <div className="flex min-w-0 flex-col gap-1">
        {post.subjectContentName ? (
          post.subjectContentUid ? (
            <Link
              to={`/events/${post.subjectContentUid}`}
              className="inline-flex min-w-0 items-center gap-1.5 transition-colors duration-v2-fast ease-v2-standard hover:text-v2-fg motion-reduce:transition-none"
            >
              <UserGroupIcon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{post.subjectContentName}</span>
            </Link>
          ) : (
            <span className="truncate">{post.subjectContentName}</span>
          )
        ) : null}
        {visibleStudents.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1">
            <span>픽업</span>
            {visibleStudents.map((student) => (
              <FeedStudentImage key={student.uid} uid={student.uid} name={student.name} />
            ))}
            {remainingCount > 0 ? <span>외 {remainingCount}명</span> : null}
          </span>
        ) : null}
      </div>
    ) : null;
  }
  if (post.postType === "walkthrough_timeline") {
    const timeline = post.blocks.find((block) => block.type === "walkthrough_timeline");
    if (timeline?.type !== "walkthrough_timeline") {
      return null;
    }
    return [
      terrainLocale[timeline.terrain],
      `${defenseTypeLocale[timeline.defenseType]} ${difficultyLocale[timeline.maxDifficulty]}`,
      `학생 ${timeline.usedStudentUids.length}명`,
    ].join(" · ");
  }
  return null;
}

// Markdown syntax removed for the two-line preview: links keep their text, and heading, quote, list, and emphasis marks go.
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[`*~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The body is the first text block: plaintext as written, markdown as plain text. Other blocks are not previewed. A student
// review without a text block has its grading tags as its only written content, so their display names form the body.
function feedBody(post: EnrichedCommunityFeedPost): string | null {
  for (const block of post.blocks) {
    if (block.type === "plaintext" && block.text.trim().length > 0) {
      return block.text.trim();
    }
    if (block.type === "markdown" && block.text.trim().length > 0) {
      const text = markdownToPlainText(block.text);
      return text.length > 0 ? text : null;
    }
  }
  if (post.postType === "student_review" && post.tags && post.tags.length > 0) {
    return sortStudentGradingTags(post.tags)
      .map((tag) => STUDENT_GRADING_TAG_DISPLAY[tag])
      .join(" · ");
  }
  return null;
}

// As in the existing feed preview, the author avatar stays beside the author, subject, and body column.
function FeedItem({ post, timeZone }: { post: EnrichedCommunityFeedPost; timeZone: string }) {
  const href = feedItemHref(post);
  const context = feedContext(post);
  const body = feedBody(post);
  return (
    <li className="flex min-w-0 items-start gap-2.5 py-3 first:pt-v2-block-p transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover motion-reduce:transition-none">
      {post.author ? (
        <Link
          to={`/@${post.author.username}`}
          aria-label={`@${post.author.username} 프로필`}
          className="shrink-0 transition-opacity duration-v2-fast ease-v2-standard hover:opacity-80 motion-reduce:transition-none"
        >
          <SenseiAvatar profileStudentId={post.author.profileStudentId} labels={post.author.labels} />
        </Link>
      ) : (
        <span className="size-8 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs leading-4">
          {post.author ? (
            <Link
              to={`/@${post.author.username}`}
              className="min-w-0 truncate text-xs font-semibold text-v2-fg underline decoration-transparent transition-colors duration-v2-fast ease-v2-standard hover:decoration-current motion-reduce:transition-none"
            >
              @{post.author.username}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-xs font-semibold text-v2-fg">알 수 없음</span>
          )}
          <span className="text-v2-fg-tertiary">{POST_TYPE_LABELS[post.postType] ?? "공략"}</span>
          <span aria-hidden="true" className="text-v2-fg-tertiary">
            ·
          </span>
          <time dateTime={post.displayAt} className="text-v2-fg-tertiary tabular-nums">
            {formatInstant(post.displayAt as UtcIsoString, { timeZone, format: "MM/DD" })}
          </time>
        </div>
        {context ? <div className="mt-1 text-xs text-v2-fg-tertiary">{context}</div> : null}
        {post.title || body ? (
          <div className="mt-2 flex min-w-0 flex-col gap-0.5">
            {post.title ? (
              href ? (
                <Link
                  to={href}
                  className="text-sm font-semibold text-v2-fg underline decoration-transparent line-clamp-2 transition-colors duration-v2-fast ease-v2-standard hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none"
                >
                  {post.title}
                </Link>
              ) : (
                <p className="text-sm font-semibold text-v2-fg line-clamp-2">{post.title}</p>
              )
            ) : null}
            {body ? (
              href ? (
                <Link
                  to={href}
                  className="text-sm text-v2-fg-secondary line-clamp-2 transition-colors duration-v2-fast ease-v2-standard hover:text-v2-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none"
                >
                  {body}
                </Link>
              ) : (
                <p className="text-sm text-v2-fg-secondary line-clamp-2">{body}</p>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function HomeFeedBlock({
  feed,
  timeZone,
  onRetry,
}: {
  feed: HomeFeedState;
  timeZone: string;
  onRetry: () => void;
}) {
  return (
    <HomeSection id="home-feed" title="최근 피드" className="md:[&_h2]:text-lg">
      <div className="overflow-hidden rounded-lg bg-v2-surface">
        {feed.status === "error" ? (
          <div className="flex flex-col gap-v2-block-gap p-v2-block-p">
            <p className="text-sm font-medium text-v2-fg">최근 피드를 불러오지 못했어요</p>
            <p className="text-xs text-v2-fg-tertiary">일시적인 문제일 수 있어요.</p>
            <div>
              <HomeRetryButton onClick={onRetry} />
            </div>
          </div>
        ) : feed.posts.length === 0 ? (
          <div className="p-v2-block-p">
            <HomeEmpty className="p-0">최근 피드가 없어요</HomeEmpty>
          </div>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-v2-divider/60 px-v2-block-p">
              {feed.posts.map((post) => (
                <FeedItem key={post.uid} post={post} timeZone={timeZone} />
              ))}
            </ul>
            <Link
              to="/community"
              className="relative flex min-h-11 items-center justify-center gap-0.5 text-sm text-v2-fg-secondary before:absolute before:inset-x-v2-block-p before:top-0 before:border-t before:border-v2-divider/60 before:content-[''] transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover hover:text-v2-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none"
            >
              더 보기
              <ChevronRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </>
        )}
      </div>
    </HomeSection>
  );
}

export function HomeYoutubeBlock({
  youtube,
  timeZone,
  onRetry,
}: {
  youtube: HomeYoutubeState;
  timeZone: string;
  onRetry: () => void;
}) {
  const videos =
    youtube.status === "success"
      ? youtube.sections
          .flatMap((section) => section.videos.map((video) => ({ ...video, channelKey: section.channelKey })))
          .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
          .slice(0, 3)
      : [];
  return (
    <HomeSection id="home-youtube" title="공식 유튜브 최근 영상" className="md:[&_h2]:text-lg">
      <div className="overflow-hidden rounded-lg bg-v2-surface">
        {youtube.status === "error" ? (
          <div className="flex flex-col gap-v2-block-gap p-v2-block-p">
            <p className="text-sm font-medium text-v2-fg">최근 영상을 불러오지 못했어요</p>
            <div>
              <HomeRetryButton onClick={onRetry} />
            </div>
          </div>
        ) : videos.length === 0 ? (
          <div className="p-v2-block-p">
            <HomeEmpty className="p-0">최근 영상이 없어요</HomeEmpty>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-v2-divider/60 px-v2-block-p">
            {videos.map((video) => (
              <li key={`${video.channelKey}-${video.id}`}>
                <a
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 gap-3 py-3 transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none"
                >
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-28 shrink-0 rounded-md bg-v2-inset object-cover"
                  />
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-sm font-semibold text-v2-fg line-clamp-2">{video.title}</p>
                    <p className="text-xs text-v2-fg-tertiary tabular-nums">
                      {formatInstant(video.publishedAt as UtcIsoString, { timeZone, format: "YYYY/MM/DD" })}
                      {" · "}
                      {video.channelKey === "jp" ? "일본 서버" : "한국 서버"}
                      {video.isShorts ? " · Shorts" : null}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </HomeSection>
  );
}

// The official channel links are always shown: they come from the static channel configuration, not from the videos. Each
// opens in a new window, which the hidden 새 창 text tells screen reader users.
export function HomeChannelLinks({ channels }: { channels: HomeYoutubeChannelLink[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-2 px-1 text-xs text-v2-fg-tertiary">
      {channels.map((channel) => (
        <li key={channel.key}>
          <a
            href={channel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="-my-3 inline-flex min-h-11 items-center gap-0.5 rounded-sm transition-colors duration-v2-fast ease-v2-standard hover:text-v2-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none"
          >
            <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-3" />
            {CHANNEL_TITLES[channel.key]}
            <span className="sr-only">새 창</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
