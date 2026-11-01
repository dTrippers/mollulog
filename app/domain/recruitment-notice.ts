import { isInstantAfter, type UtcIsoString } from "~/lib/date-time";

export const FREE_RECRUITMENT_NOTICE = {
  label: "이월 불가",
  description: "100회 무료 모집은 픽업 기간 종료 시 소멸되며 이월되지 않아요. 기간 내 사용해주세요.",
} as const;

export const PICKUP_UNAVAILABLE_NOTICE = {
  label: "픽업 불가",
  description: "아래 학생은 픽업이 불가하며 다른 학생의 픽업에서 ‘픽뚫’로만 모집할 수 있어요.",
} as const;

// The free recruits last only while every recruitment of the content is still open.
export function isFreeRecruitmentAvailable({
  tags,
  recruitments,
  now,
}: {
  tags: readonly string[];
  recruitments: readonly { until: UtcIsoString | null }[];
  now: UtcIsoString;
}): boolean {
  return (
    tags.includes("recruit_free_100") &&
    recruitments.every((recruitment) => recruitment.until !== null && isInstantAfter(recruitment.until, now))
  );
}

// A given student is handed out rather than recruited, so the pickup restriction does not apply to it.
export function isPickupUnavailableRecruitment({
  pickup,
  recruitmentType,
}: {
  pickup: boolean;
  recruitmentType: string;
}): boolean {
  return !pickup && recruitmentType !== "given";
}
