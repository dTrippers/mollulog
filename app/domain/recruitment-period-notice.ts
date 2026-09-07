import { getInstantTime, type UtcIsoString } from "~/lib/date-time";

export type RecruitmentPeriod = {
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
};

export type RecruitmentPeriodNoticeContent = {
  recruitmentGroupUid?: string | null;
  contentType: string;
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  endless: boolean;
};

/**
 * Returns the static period notice for a timeline content, or null when the
 * content should not show one. `now` stays outside route-cache payloads so the
 * ended/current wording is evaluated for each request or render.
 */
export function getRecruitmentPeriodNotice(
  content: RecruitmentPeriodNoticeContent,
  recruitmentPeriod: RecruitmentPeriod | null | undefined,
  now: UtcIsoString,
): string | null {
  if (!content.recruitmentGroupUid || !recruitmentPeriod || content.endless || content.endAt === null) {
    return null;
  }

  const periodDiffers =
    getInstantTime(content.startAt) !== getInstantTime(recruitmentPeriod.startAt) ||
    getInstantTime(content.endAt) !==
      (recruitmentPeriod.endAt === null ? null : getInstantTime(recruitmentPeriod.endAt));

  if (!periodDiffers) {
    return null;
  }

  if (recruitmentPeriod.endAt !== null && getInstantTime(now) >= getInstantTime(recruitmentPeriod.endAt)) {
    return "학생 모집은 종료되었어요";
  }

  return content.contentType === "event"
    ? "이벤트 기간과 모집 개최 기간이 달라요"
    : "컨텐츠 기간과 모집 개최 기간이 달라요";
}
