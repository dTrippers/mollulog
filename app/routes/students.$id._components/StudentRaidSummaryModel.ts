export type StudentRaidSummaryStat = {
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
  ownCount: number;
  assistCount: number;
  totalCount: number;
  assistRatio: number | null;
  sampleInsufficient: boolean;
  decision: StudentRaidDecision;
};

export type StudentRaidInvestment = {
  ownCount: number;
  medianTier: number | null;
  distribution: StudentRaidTierDistributionItem[];
  myTier: number | null;
};

export type StudentRaidDecision = {
  value: string;
  description: string;
};

const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
// 100 slots is a small but useful floor, and mirrors the existing season detail threshold
// so weak samples do not produce confident advice.
const MIN_TOTAL_SAMPLE_SIZE = 100;

export function buildStudentRaidSummary({
  statistics,
}: {
  statistics: StudentRaidSummaryStat[];
}): StudentRaidSummary {
  let ownCount = 0;
  let assistCount = 0;

  for (const stat of statistics) {
    ownCount += stat.slotsCount;
    assistCount += stat.assistsCount;
  }

  const totalCount = ownCount + assistCount;
  const assistRatio = totalCount > 0 ? assistCount / totalCount : null;
  const sampleInsufficient = totalCount < MIN_TOTAL_SAMPLE_SIZE;

  return {
    ownCount,
    assistCount,
    totalCount,
    assistRatio,
    sampleInsufficient,
    decision: getRaidDecision({ assistRatio, sampleInsufficient }),
  };
}

export function buildStudentRaidInvestment({
  statistics,
  myStudentTier,
}: {
  statistics: StudentRaidSummaryStat[];
  myStudentTier: number | null;
}): StudentRaidInvestment {
  const tierCounts = new Map<number, number>();
  let ownCount = 0;

  for (const stat of statistics) {
    ownCount += stat.slotsCount;
    for (const { tier, count } of stat.slotsByTier) {
      if (!TIERS.includes(tier as (typeof TIERS)[number])) {
        continue;
      }
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + count);
    }
  }

  return buildInvestmentFromCounts({ tierCounts, ownCount, myStudentTier });
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

function buildInvestmentFromCounts({
  tierCounts,
  ownCount,
  myStudentTier,
}: {
  tierCounts: Map<number, number>;
  ownCount: number;
  myStudentTier: number | null;
}): StudentRaidInvestment {
  return {
    ownCount,
    medianTier: ownCount > 0 ? getWeightedMedianTier(tierCounts, ownCount) : null,
    distribution: TIERS.map((tier) => {
      const count = tierCounts.get(tier) ?? 0;
      return {
        tier,
        count,
        ratio: ownCount > 0 ? count / ownCount : 0,
      };
    }),
    myTier: myStudentTier,
  };
}

function getRaidDecision({
  assistRatio,
  sampleInsufficient,
}: {
  assistRatio: number | null;
  sampleInsufficient: boolean;
}): StudentRaidDecision {
  if (sampleInsufficient || assistRatio == null) {
    return {
      value: "지표 부족",
      description: "판단을 위한 정보가 부족해요",
    };
  }

  if (assistRatio >= 0.65) {
    return {
      value: "조력 학생 위주",
      description: "조력 학생으로 클리어 한 비율이 높아요",
    };
  }

  if (assistRatio >= 0.35) {
    return {
      value: "모집/조력 비슷",
      description: "모집 학생과 조력 학생이 비슷하게 쓰였어요",
    };
  }

  return {
    value: "모집 학생 위주",
    description: "직접 모집한 학생의 출전 비율이 높아요",
  };
}
