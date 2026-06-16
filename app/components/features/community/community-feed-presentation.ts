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
  const borderClass = firstInFeed || groupedWithPrevious ? "" : "border-t border-neutral-200 dark:border-neutral-700";
  const spacingClass = groupedWithPrevious
    ? preview
      ? "pt-1 pb-3"
      : "px-4 pt-1 pb-4"
    : preview
      ? "py-3"
      : "px-4 py-4 sm:px-4";

  return `transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-700/40 ${borderClass} ${spacingClass}`;
}

export function getCommentToggleClassName({ active }: { active: boolean }) {
  const base = "group inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition";

  if (active) {
    return `${base} border-neutral-300 bg-neutral-200 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100`;
  }

  return `${base} border-neutral-200 bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100`;
}

export function getCommentEditorPanelClassName({
  groupedWithPrevious = false,
}: { groupedWithPrevious?: boolean } = {}) {
  return `mt-3 rounded-lg border border-neutral-200 bg-white px-3 py-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 ${
    groupedWithPrevious ? "" : "sm:ml-[52px]"
  }`;
}

export function getSubjectMetaClassName(postType: CommunityPostType) {
  if (postType === "event_opinion" || postType === "recruitment_result") {
    return "space-y-1 text-xs text-neutral-500 dark:text-neutral-400";
  }

  return "flex min-w-0 items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400";
}

export function getPickupStudentNameClassName() {
  return "sr-only";
}

export function getGroupedAvatarPlaceholderClassName() {
  return "size-10 shrink-0";
}
