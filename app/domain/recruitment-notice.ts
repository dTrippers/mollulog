import { isInstantAfter, type UtcIsoString } from "~/lib/date-time";

// Timeline tags that grant free recruits, mapped to the number of free recruits each grants.
// Every rule other than the count is the same for all of them.
export const FREE_RECRUITMENT_TAG_PULLS = {
  recruit_free_100: 100,
  recruit_free_200: 200,
} as const;

type FreeRecruitmentTag = keyof typeof FREE_RECRUITMENT_TAG_PULLS;

const FREE_RECRUITMENT_TAGS = Object.keys(FREE_RECRUITMENT_TAG_PULLS) as FreeRecruitmentTag[];

function isFreeRecruitmentTag(tag: string): tag is FreeRecruitmentTag {
  return Object.hasOwn(FREE_RECRUITMENT_TAG_PULLS, tag);
}

export function getFreeRecruitmentNotice(freePulls: number) {
  return {
    label: "이월 불가",
    description: `${freePulls}회 무료 모집은 픽업 기간 종료 시 소멸되며 이월되지 않아요. 기간 내 사용해주세요.`,
  } as const;
}

// The free recruit count granted by the tags, or 0 when no free recruitment tag is set.
// When several free recruitment tags are set, the largest grant applies.
export function getTaggedFreeRecruitmentPulls(tags: readonly string[]): number {
  return FREE_RECRUITMENT_TAGS.reduce(
    (max, tag) => (tags.includes(tag) ? Math.max(max, FREE_RECRUITMENT_TAG_PULLS[tag]) : max),
    0,
  );
}

export function withoutFreeRecruitmentTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => !isFreeRecruitmentTag(tag));
}

// The 2026-11-10 recruitment revamp turned recruitment points into stacks, and this event's pickup came with 200 free
// recruits. Players mixed up the free recruits, which expire, with the stack they build, which carries over to the next
// fes recruitment. The event overview explains the difference for this event only, and the futures timeline links to it
// while the free recruits can still be used.
export const RECRUITMENT_STACK_GUIDE_EVENT_UID = "pandemonium-cruise";
export const RECRUITMENT_STACK_GUIDE_ANCHOR = "recruit-stack-guide";

export const PICKUP_UNAVAILABLE_NOTICE = {
  label: "픽업 불가",
  description: "아래 학생은 픽업이 불가하며 다른 학생의 픽업에서 ‘픽뚫’로만 모집할 수 있어요.",
} as const;

// The free recruits last only while every recruitment of the content is still open.
// Returns the free recruit count still available, or 0 when there is none.
export function getAvailableFreeRecruitmentPulls({
  tags,
  recruitments,
  now,
}: {
  tags: readonly string[];
  recruitments: readonly { until: UtcIsoString | null }[];
  now: UtcIsoString;
}): number {
  const freePulls = getTaggedFreeRecruitmentPulls(tags);
  const open = recruitments.every(
    (recruitment) => recruitment.until !== null && isInstantAfter(recruitment.until, now),
  );
  return open ? freePulls : 0;
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
