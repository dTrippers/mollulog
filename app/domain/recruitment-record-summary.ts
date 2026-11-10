import {
  getRecruitmentResultCountStats,
  isRecordedRecruitmentResult,
  type StudentLookup,
} from "~/domain/recruitment-result";
import type { RecruitmentResult } from "~/models/recruitment-result";

// The totals shown on the profile's recruitment record summary. They use the same counting as the recruitment record
// screen: a record without a recorded trial count adds its ★3 and pickup counts, but not to the rates.
export type RecruitmentRecordSummary = {
  recordCount: number;
  // Trials of the records that have a trial count. `0` with records present means no record has one.
  totalTrial: number;
  tier3Count: number;
  tier3RateCount: number;
  pickupCount: number;
  pickupRateCount: number;
};

type SummarizedRecruitmentResult = Pick<
  RecruitmentResult,
  "completedAt" | "recruitedStudents" | "exchangedStudents" | "tier3Count" | "trial"
>;

export function summarizeRecruitmentRecords<T extends SummarizedRecruitmentResult>(
  results: T[],
  getLookup: (result: T) => StudentLookup,
): RecruitmentRecordSummary {
  const summary: RecruitmentRecordSummary = {
    recordCount: 0,
    totalTrial: 0,
    tier3Count: 0,
    tier3RateCount: 0,
    pickupCount: 0,
    pickupRateCount: 0,
  };

  for (const result of results) {
    if (!isRecordedRecruitmentResult(result)) {
      continue;
    }
    const stats = getRecruitmentResultCountStats(result, getLookup(result));
    summary.recordCount += 1;
    summary.tier3Count += stats.tier3Count;
    summary.pickupCount += stats.pickupCount;
    if (result.trial !== null) {
      summary.totalTrial += result.trial;
      summary.tier3RateCount += stats.tier3RateCount;
      summary.pickupRateCount += stats.pickupRateCount;
    }
  }

  return summary;
}

// "3.00%". `null` when there is no trial count to divide by, so a rate is never shown as 0.00%.
export function formatRecruitmentRate(rateCount: number, totalTrial: number): string | null {
  if (totalTrial <= 0) {
    return null;
  }
  return `${((rateCount / totalTrial) * 100).toFixed(2)}%`;
}

export type RecruitmentTierBar = {
  key: string;
  // 1-9 for a tier, `null` for the students not recruited yet.
  tier: number | null;
  count: number;
  // 0-100, relative to the largest bar.
  heightPercent: number;
};

// Nine growth tiers (★1-★5 and exclusive weapon 1-4) and the unrecruited students, as bars scaled to the largest one.
export function buildRecruitmentTierBars(
  tierCounts: Record<number, number>,
  recruitedCount: number,
  totalCount: number,
): RecruitmentTierBar[] {
  const counts = [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((tier) => ({
      key: `tier-${tier}`,
      tier: tier as number | null,
      count: tierCounts[tier] ?? 0,
    })),
    { key: "unrecruited", tier: null as number | null, count: Math.max(0, totalCount - recruitedCount) },
  ];
  const max = Math.max(...counts.map(({ count }) => count), 0);
  return counts.map((bar) => ({ ...bar, heightPercent: max === 0 ? 0 : (bar.count / max) * 100 }));
}
