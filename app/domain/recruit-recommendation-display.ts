// How the 모집 추천 screens write a recommendation's values as text.
import { formatInstant } from "~/lib/date-time";
import { raidTypeLocale } from "~/locales/ko";
import type { RecruitBossUsage, RecruitCommunityTag } from "~/models/recruit-recommendation-contract";

/** When a usage was counted: the KR date of this window's raid ("12/01 대결전"), or the month of a past JP season. */
export function formatUsageSeason(boss: Pick<RecruitBossUsage, "source" | "raidType" | "startAt">, timeZone: string) {
  const format = boss.source === "window" ? "MM/DD" : "YYYY.MM";
  return `${formatInstant(boss.startAt, { timeZone, format })} ${raidTypeLocale[boss.raidType]}`;
}

/** The text of one community tag. A 대체 tag names its substitute; null when the name is not known. */
export function formatCommunityTag(
  tag: RecruitCommunityTag,
  substituteNames: ReadonlyMap<string, string>,
): string | null {
  let text = tag.value;
  if (tag.substituteStudentUid !== undefined) {
    const name = substituteNames.get(tag.substituteStudentUid);
    if (name === undefined) return null;
    text = `${tag.value}: ${name}`;
  }
  return tag.sourceCount === 1 ? `${text} (커뮤니티 평가 1건)` : text;
}

/**
 * The tags as lines joined by "·": the tags several sources agree on, then the tags from one source alone. Empty when
 * the student has none.
 */
export function formatCommunityTagLines(
  tags: RecruitCommunityTag[],
  substituteNames: ReadonlyMap<string, string>,
): string[] {
  const line = (sourceCount: (count: number) => boolean) =>
    tags
      .filter((tag) => sourceCount(tag.sourceCount))
      .map((tag) => formatCommunityTag(tag, substituteNames))
      .filter((text): text is string => text !== null)
      .join(" · ");
  return [line((count) => count > 1), line((count) => count <= 1)].filter((text) => text.length > 0);
}
