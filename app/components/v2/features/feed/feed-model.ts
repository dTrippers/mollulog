import { formatInstant, parseUtcTimestamp } from "~/lib/date-time";
import type { CommunityPostType } from "~/models/community";

export function getFeedPostTypeLabel(postType: CommunityPostType): string {
  switch (postType) {
    case "student_review":
      return "학생 평가";
    case "event_opinion":
      return "이벤트 의견";
    case "youtube_video":
      return "영상";
    case "recruitment_result":
      return "모집 결과";
    case "walkthrough_timeline":
      return "공략 타임라인";
    default:
      return "공략";
  }
}

// The date of a post and whether it was edited after it was published. A post by a curated source is never "edited".
export function getFeedPostTimestamp(
  post: { origin: "user" | "curated"; displayAt: string; updatedAt: string },
  timeZone: string,
) {
  const displayAt = parseUtcTimestamp(post.displayAt);
  return {
    dateTime: displayAt.toISOString(),
    text: formatInstant(post.displayAt, { timeZone }),
    edited: post.origin === "user" && parseUtcTimestamp(post.updatedAt).isAfter(displayAt),
  };
}

// Pickup students show as avatars only. Up to three show in full; from four, two avatars and the rest as "외 N명".
export function getPickupAvatarSummary<T>(students: T[]): { visible: T[]; remainingCount: number } {
  if (students.length <= 3) {
    return { visible: students, remainingCount: 0 };
  }
  return { visible: students.slice(0, 2), remainingCount: students.length - 2 };
}
