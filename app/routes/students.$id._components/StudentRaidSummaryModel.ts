import { getInstantTime, type UtcIsoString } from "~/lib/date-time";

export type StudentRaidSummaryStat = {
  raid: {
    startAt: UtcIsoString;
  };
  slotsCount: number;
  slotsByTier: { tier: number; count: number }[];
  assistsCount: number;
};

export type StudentRaidTierDistributionItem = {
  tier: number;
  count: number;
  ratio: number;
};

export type StudentRaidSummary = {
  window: {
    since: UtcIsoString;
    until: UtcIsoString;
  };
  ownCount: number;
  assistCount: number;
  totalCount: number;
  assistRatio: number | null;
  sampleInsufficient: boolean;
  sampleMessage: string | null;
  verdict: string | null;
  medianTier: number | null;
  distribution: StudentRaidTierDistributionItem[];
  myTier: number | null;
  myTierPercentile: number | null;
  myTierVerdict: string | null;
};

const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
// Recent two-year aggregates can be noisy for niche students. 100 slots is a small but useful floor,
// and mirrors the existing season detail threshold so weak samples do not produce confident advice.
const MIN_TOTAL_SAMPLE_SIZE = 100;

export function buildStudentRaidSummary({
  statistics,
  myStudentTier,
  asOf = new Date(),
}: {
  statistics: StudentRaidSummaryStat[];
  myStudentTier: number | null;
  asOf?: Date;
}): StudentRaidSummary {
  const since = getTwoYearsAgo(asOf);
  const until = asOf;
  const recentStatistics = statistics.filter((stat) => {
    const startAt = getInstantTime(stat.raid.startAt);
    return !Number.isNaN(startAt) && startAt >= since.getTime() && startAt <= until.getTime();
  });

  const tierCounts = new Map<number, number>();
  let ownCount = 0;
  let assistCount = 0;

  for (const stat of recentStatistics) {
    ownCount += stat.slotsCount;
    assistCount += stat.assistsCount;
    for (const { tier, count } of stat.slotsByTier) {
      if (!TIERS.includes(tier as (typeof TIERS)[number])) {
        continue;
      }
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + count);
    }
  }

  const totalCount = ownCount + assistCount;
  const assistRatio = totalCount > 0 ? assistCount / totalCount : null;
  const sampleInsufficient = totalCount < MIN_TOTAL_SAMPLE_SIZE;
  const medianTier = ownCount > 0 ? getWeightedMedianTier(tierCounts, ownCount) : null;
  const distribution = TIERS.map((tier) => {
    const count = tierCounts.get(tier) ?? 0;
    return {
      tier,
      count,
      ratio: ownCount > 0 ? count / ownCount : 0,
    };
  });
  const myTierPercentile =
    myStudentTier != null && ownCount > 0
      ? distribution
          .filter(({ tier }) => tier <= myStudentTier)
          .reduce((sum, { count }) => sum + count, 0) / ownCount
      : null;

  return {
    window: {
      since: since.toISOString() as UtcIsoString,
      until: until.toISOString() as UtcIsoString,
    },
    ownCount,
    assistCount,
    totalCount,
    assistRatio,
    sampleInsufficient,
    sampleMessage: sampleInsufficient ? getSampleMessage(totalCount) : null,
    verdict: sampleInsufficient ? null : getAssistRatioVerdict(assistRatio),
    medianTier,
    distribution,
    myTier: myStudentTier,
    myTierPercentile,
    myTierVerdict: getMyTierVerdict({ myStudentTier, ownCount, percentile: myTierPercentile }),
  };
}

function getTwoYearsAgo(asOf: Date) {
  const since = new Date(asOf.getTime());
  since.setUTCFullYear(since.getUTCFullYear() - 2);
  return since;
}

function getWeightedMedianTier(tierCounts: Map<number, number>, totalCount: number) {
  const midpoint = Math.ceil(totalCount / 2);
  let accumulated = 0;
  for (const tier of TIERS) {
    accumulated += tierCounts.get(tier) ?? 0;
    if (accumulated >= midpoint) {
      return tier;
    }
  }
  return null;
}

function getSampleMessage(totalCount: number) {
  if (totalCount === 0) {
    return "최근 2년 표본이 없어 판단을 보류하는 편이 좋아요.";
  }
  return "최근 2년 표본이 적어 판단은 참고용으로만 봐주세요.";
}

function getAssistRatioVerdict(assistRatio: number | null) {
  if (assistRatio == null) {
    return null;
  }
  if (assistRatio >= 0.6) {
    return "조력 비중이 높아 대여로 해결된 사례가 많은 편이에요.";
  }
  if (assistRatio >= 0.35) {
    return "본대와 조력이 함께 쓰여 보유와 대여를 같이 고려할 만해요.";
  }
  return "본대 비중이 높아 직접 보유 가치가 큰 편이에요.";
}

function getMyTierVerdict({
  myStudentTier,
  ownCount,
  percentile,
}: {
  myStudentTier: number | null;
  ownCount: number;
  percentile: number | null;
}) {
  if (myStudentTier == null) {
    return "미보유 상태예요.";
  }
  if (ownCount === 0 || percentile == null) {
    return "본대 투자 표본이 적어 내 티어 비교는 생략했어요.";
  }
  if (percentile >= 0.8) {
    return "본대 분포 기준 충분히 높은 편이에요.";
  }
  if (percentile >= 0.5) {
    return "본대 분포의 중간권에 가까워요.";
  }
  return "본대 분포보다 낮은 편이라 추가 투자가 필요할 수 있어요.";
}
