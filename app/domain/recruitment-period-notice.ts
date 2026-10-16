import type { RecruitmentTypeEnum } from "~/graphql/graphql";
import { formatInstant, getInstantTime, type UtcIsoString } from "~/lib/date-time";

export type RecruitmentPeriod = {
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  recruitmentType?: RecruitmentTypeEnum;
};

export type RecruitmentPeriodNoticeContent = {
  recruitmentGroupUid?: string | null;
  contentType: string;
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  endless: boolean;
};

function formatPremiumDashPeriod(startAt: UtcIsoString): string {
  const date = formatInstant(startAt, { timeZone: "Asia/Seoul", format: "YYYY년 M월 D일 HH:mm" });
  return `${date} 또는 블루 아카이브 최초 가입일 중 늦은 때부터 28일간`;
}

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
  if (!content.recruitmentGroupUid || !recruitmentPeriod) {
    return null;
  }

  if (recruitmentPeriod.recruitmentType === "premium_dash") {
    return `프리미엄 모집은 ${formatPremiumDashPeriod(content.startAt)} 진행돼요.`;
  }

  if (recruitmentPeriod.endAt === null || content.endless || content.endAt === null) {
    return null;
  }

  const periodDiffers =
    getInstantTime(content.startAt) !== getInstantTime(recruitmentPeriod.startAt) ||
    getInstantTime(content.endAt) !==
      (recruitmentPeriod.endAt === null ? null : getInstantTime(recruitmentPeriod.endAt));

  if (!periodDiffers) {
    return null;
  }

  if (getInstantTime(now) >= getInstantTime(recruitmentPeriod.endAt)) {
    return "학생 모집은 종료되었어요";
  }

  return content.contentType === "event"
    ? "이벤트 기간과 모집 개최 기간이 달라요"
    : "컨텐츠 기간과 모집 개최 기간이 달라요";
}
