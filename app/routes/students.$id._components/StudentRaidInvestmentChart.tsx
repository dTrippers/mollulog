import type { StudentRaidInvestment } from "./StudentRaidSummaryModel";
import { UsageBarList, UsageChartCard } from "./UsageBarChart";
import { TIER_COLORS, formatTierKey, formatTierLabel } from "./raidTierVisual";

type InvestmentChartRow = {
  id: string;
  tier: number;
  includedTiers: number[];
  count: number;
  ratio: number;
};

type StudentRaidInvestmentChartProps = {
  investment: StudentRaidInvestment;
  signedIn: boolean;
};

export default function StudentRaidInvestmentChart({ investment, signedIn }: StudentRaidInvestmentChartProps) {
  const rows = buildInvestmentRows(investment);
  const insight = getInvestmentInsight(rows);

  return (
    <UsageChartCard title="성장도별 출전 비율" description="학생 성장도에 따른 역대 출전 횟수와 비율">
      {investment.ownCount === 0 ? (
        <div className="rounded-md bg-neutral-100 px-3 py-4 text-center text-sm text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          모집 편성 기록이 없어요.
        </div>
      ) : (
        <>
          <UsageBarList
            rows={rows}
            getKey={(row) => row.id}
            getRatio={(row) => row.ratio}
            labelClassName="w-12"
            renderLabel={(row) => (
              <div className="flex items-center gap-0.5">
                <TierBadge tier={row.tier} />
              </div>
            )}
            renderDescription={(row) => {
              if (row.id === "tier-5-and-unique-1") {
                return "5성 포함";
              }
              if (row.id === "tier-3-or-lower") {
                return "이하";
              }
              return null;
            }}
            renderSubLabel={(row) => {
              const isMyTier = signedIn && investment.myTier != null && row.includedTiers.includes(investment.myTier);
              return (
                <span className="font-medium text-blue-600 dark:text-blue-400">{isMyTier ? "내 학생" : null}</span>
              );
            }}
            renderValue={(row) => `${formatPercent(row.ratio)} · ${formatCount(row.count)}회`}
            getBarStyle={(row) => ({ backgroundColor: TIER_COLORS[formatTierKey(row.tier)] })}
          />
          {insight ? (
            <p className="mt-3 border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">{insight.label}</span> ·{" "}
              {insight.description}
            </p>
          ) : null}
        </>
      )}
    </UsageChartCard>
  );
}

function buildInvestmentRows(investment: StudentRaidInvestment): InvestmentChartRow[] {
  const tier5AndUnique1 = investment.distribution.filter(({ tier }) => tier === 5 || tier === 6);
  const tier5AndUnique1Count = tier5AndUnique1.reduce((sum, { count }) => sum + count, 0);
  const tier5AndUnique1Ratio = tier5AndUnique1.reduce((sum, { ratio }) => sum + ratio, 0);
  const tier3OrLower = investment.distribution.filter(({ tier }) => tier <= 3);
  const tier3OrLowerCount = tier3OrLower.reduce((sum, { count }) => sum + count, 0);
  const tier3OrLowerRatio = tier3OrLower.reduce((sum, { ratio }) => sum + ratio, 0);

  return [
    ...investment.distribution
      .filter(({ tier }) => tier > 6)
      .sort((a, b) => b.tier - a.tier)
      .map(({ tier, count, ratio }) => ({
        id: `tier-${tier}`,
        tier,
        includedTiers: [tier],
        count,
        ratio,
      })),
    {
      id: "tier-5-and-unique-1",
      tier: 6,
      includedTiers: [5, 6],
      count: tier5AndUnique1Count,
      ratio: tier5AndUnique1Ratio,
    },
    ...investment.distribution
      .filter(({ tier }) => tier === 4)
      .map(({ tier, count, ratio }) => ({
        id: `tier-${tier}`,
        tier,
        includedTiers: [tier],
        count,
        ratio,
      })),
    {
      id: "tier-3-or-lower",
      tier: 3,
      includedTiers: [1, 2, 3],
      count: tier3OrLowerCount,
      ratio: tier3OrLowerRatio,
    },
  ];
}

function TierBadge({ tier }: { tier: number }) {
  if (tier > 5) {
    return (
      <>
        <img className="size-4 shrink-0" src="/icons/exclusive_weapon.png" alt="고유무기" />
        <span className="tabular-nums">{tier - 5}</span>
      </>
    );
  }

  return (
    <>
      <span aria-hidden="true">★</span>
      <span className="tabular-nums">{tier}</span>
    </>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function getInvestmentInsight(rows: InvestmentChartRow[]) {
  const topRow = rows
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || b.tier - a.tier)[0];
  if (!topRow) {
    return null;
  }

  return {
    label: `${formatInvestmentRowLabel(topRow)}로 가장 많이 출전`,
    description: getInvestmentDescription(topRow.tier),
  };
}

function formatInvestmentRowLabel(row: InvestmentChartRow) {
  if (row.id === "tier-5-and-unique-1") {
    return "고유 ★1";
  }
  if (row.id === "tier-3-or-lower") {
    return "★3 이하";
  }
  return formatTierLabel(row.tier);
}

function getInvestmentDescription(tier: number) {
  if (tier >= 7) {
    return "높은 성장이 필요해요";
  }
  if (tier >= 5) {
    return "적당한 성장이 필요해요";
  }
  return "성장도가 낮아도 충분해요";
}
