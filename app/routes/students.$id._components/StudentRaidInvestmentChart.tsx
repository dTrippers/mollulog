import { formatTierKey, formatTierLabel, TIER_COLORS } from "./raidTierVisual";
import type { StudentRaidInvestment } from "./StudentRaidSummaryModel";
import { UsageBarLegendHighlight, UsageBarList, UsageChartCard } from "./UsageBarChart";

type InvestmentChartRow = { id: string; tier: number; includedTiers: number[]; count: number; ratio: number };

export default function StudentRaidInvestmentChart({ investment, signedIn }: { investment: StudentRaidInvestment; signedIn: boolean }) {
  const rows = buildInvestmentRows(investment);
  const insight = getInvestmentInsight(rows);
  const myTier = signedIn ? investment.myTier : null;
  const isMyTierRow = (row: InvestmentChartRow) => myTier !== null && row.includedTiers.includes(myTier);
  return (
    <UsageChartCard title="성장도별 출전 비율" empty={investment.ownCount === 0} emptyText="모집 편성 기록이 없어요.">
      <UsageBarList
        variant="investment"
        rows={rows}
        getKey={(row) => row.id}
        getRatio={(row) => row.ratio}
        renderLabel={(row) => <TierBadge tier={row.tier} />}
        renderDescription={(row) => row.id === "tier-5-and-unique-1" ? "5성 포함" : row.id === "tier-3-or-lower" ? "이하" : null}
        isHighlighted={isMyTierRow}
        highlightLabel="내 학생"
        renderValue={(row) => <><strong className="font-medium text-v2-fg">{formatPercent(row.ratio)}</strong> · {row.count.toLocaleString()}회</>}
        getBarStyle={(row) => ({ backgroundColor: TIER_COLORS[formatTierKey(row.tier)] })}
      />
      {rows.some(isMyTierRow) ? <UsageBarLegendHighlight>내 학생 성장도</UsageBarLegendHighlight> : null}
      {insight ? <p className="mt-3 border-t border-v2-divider pt-[10px] text-[13px] leading-[1.43] text-v2-fg-secondary"><span className="font-semibold text-v2-fg">{insight.label}</span> · {insight.description}</p> : null}
    </UsageChartCard>
  );
}

function buildInvestmentRows(investment: StudentRaidInvestment): InvestmentChartRow[] {
  const tier5AndUnique1 = investment.distribution.filter(({ tier }) => tier === 5 || tier === 6);
  const tier3OrLower = investment.distribution.filter(({ tier }) => tier <= 3);
  return [
    ...investment.distribution.filter(({ tier }) => tier > 6).sort((a, b) => b.tier - a.tier).map(({ tier, count, ratio }) => ({ id: `tier-${tier}`, tier, includedTiers: [tier], count, ratio })),
    { id: "tier-5-and-unique-1", tier: 6, includedTiers: [5, 6], count: tier5AndUnique1.reduce((sum, row) => sum + row.count, 0), ratio: tier5AndUnique1.reduce((sum, row) => sum + row.ratio, 0) },
    ...investment.distribution.filter(({ tier }) => tier === 4).map(({ tier, count, ratio }) => ({ id: `tier-${tier}`, tier, includedTiers: [tier], count, ratio })),
    { id: "tier-3-or-lower", tier: 3, includedTiers: [1, 2, 3], count: tier3OrLower.reduce((sum, row) => sum + row.count, 0), ratio: tier3OrLower.reduce((sum, row) => sum + row.ratio, 0) },
  ];
}

function TierBadge({ tier }: { tier: number }) {
  return tier > 5
    ? <span className="inline-flex items-center gap-1"><img className="size-3.5 shrink-0" src="/icons/exclusive_weapon.png" alt="고유무기" /><span className="tabular-nums">{tier - 5}</span></span>
    : <span className="inline-flex items-center gap-0"><span aria-hidden="true">★</span><span className="tabular-nums">{tier}</span></span>;
}

function formatPercent(value: number) { return `${Math.round(value * 100)}%`; }

function getInvestmentInsight(rows: InvestmentChartRow[]) {
  const topRow = rows.filter((row) => row.count > 0).sort((a, b) => b.count - a.count || b.tier - a.tier)[0];
  if (!topRow) return null;
  return { label: `${formatInvestmentRowLabel(topRow)}로 가장 많이 출전`, description: getInvestmentDescription(topRow.tier) };
}

function formatInvestmentRowLabel(row: InvestmentChartRow) {
  if (row.id === "tier-5-and-unique-1") return "고유 ★1";
  if (row.id === "tier-3-or-lower") return "★3 이하";
  return formatTierLabel(row.tier);
}

function getInvestmentDescription(tier: number) {
  if (tier >= 7) return "높은 성장이 필요해요";
  if (tier >= 5) return "적당한 성장이 필요해요";
  return "성장도가 낮아도 충분해요";
}
