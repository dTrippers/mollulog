import { formatInstant, parseUtcTimestamp } from "~/lib/date-time";
import type { CommunityPostType } from "~/models/community";

export type CommunityPostBodySection = "subject" | "content";

type GroupableCommunityPost = {
  origin: "user" | "curated";
  author: {
    username: string;
  } | null;
  sourceName: string | null;
  postType: CommunityPostType;
};

type TimestampCommunityPost = {
  origin: "user" | "curated";
  displayAt: string;
  updatedAt: string;
};

export function getCommunityPostBodyOrder(postType: CommunityPostType): CommunityPostBodySection[] {
  void postType;

  return ["subject", "content"];
}

export function getCommunityPostTimestampMeta(post: TimestampCommunityPost, timeZone: string) {
  const displayAt = parseUtcTimestamp(post.displayAt);
  if (post.origin === "curated") {
    return { dateTime: displayAt.toISOString(), text: formatInstant(post.displayAt, { timeZone }), edited: false };
  }

  const updated = parseUtcTimestamp(post.updatedAt);
  return {
    dateTime: displayAt.toISOString(),
    text: formatInstant(post.displayAt, { timeZone }),
    edited: updated.isAfter(displayAt),
  };
}

export function getCommunityFeedClassName({ preview }: { preview: boolean }) {
  return preview ? "" : "-mx-4 sm:mx-0";
}

export function shouldGroupPostWithPrevious(
  post: GroupableCommunityPost,
  previousPost: GroupableCommunityPost | undefined,
) {
  if (!previousPost || post.postType !== previousPost.postType || post.origin !== previousPost.origin) {
    return false;
  }

  if (post.origin === "curated") {
    return post.sourceName === previousPost.sourceName;
  }

  return Boolean(post.author && previousPost.author && post.author.username === previousPost.author.username);
}

export function getCommunityPostCardClassName({
  preview,
  firstInFeed = false,
  groupedWithPrevious = false,
}: {
  preview: boolean;
  firstInFeed?: boolean;
  groupedWithPrevious?: boolean;
}) {
  const borderClass = firstInFeed || groupedWithPrevious ? "" : "border-t border-border/60";
  const spacingClass = groupedWithPrevious
    ? preview
      ? "pt-1 pb-3"
      : "px-4 pt-1 pb-4"
    : preview
      ? "py-3"
      : "px-4 py-4 sm:px-4";

  return `transition-colors hover:bg-muted/50 ${borderClass} ${spacingClass}`;
}

export function getCommentToggleClassName({ active }: { active: boolean }) {
  const base = "group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors";

  if (active) {
    return `${base} bg-secondary text-secondary-foreground`;
  }

  return `${base} bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground`;
}

export function getCommentEditorPanelClassName({
  groupedWithPrevious = false,
}: {
  groupedWithPrevious?: boolean;
} = {}) {
  return `mt-3 rounded-lg bg-muted/40 px-3 py-3 ${groupedWithPrevious ? "" : "sm:ml-[52px]"}`;
}

export function getSubjectMetaClassName(postType: CommunityPostType) {
  if (postType === "event_opinion" || postType === "recruitment_result") {
    return "space-y-1 text-xs text-muted-foreground";
  }

  return "flex min-w-0 items-center gap-2 text-xs text-muted-foreground";
}

export function getPickupStudentNameClassName() {
  return "sr-only";
}

export function getPickupStudentSummary<T>(students: T[]) {
  const visibleCount = students.length > 7 ? 5 : students.length;

  return {
    visibleStudents: students.slice(0, visibleCount),
    remainingCount: students.length - visibleCount,
  };
}

export function getGroupedAvatarPlaceholderClassName() {
  return "size-10 shrink-0";
}
