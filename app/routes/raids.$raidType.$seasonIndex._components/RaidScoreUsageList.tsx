import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { StudentCard } from "~/components/features/students";
import { FilterButtons } from "~/components/primitives";
import type { Attack, Defense } from "~/graphql/graphql";
import type { RangeStatsStudentUsage } from "~/lib/ranks/range-stats";
import { cn } from "~/lib/utils";
import type { Role } from "~/models/content.d";

type StudentInfo = {
  name: string;
  role: Role;
  attackType: Attack;
  defenseType: Defense;
};

type UsageRow = RangeStatsStudentUsage & {
  name: string;
  role: Role;
};

type TierCount = { tier: number; count: number };
type UsageMode = "total" | "own" | "assist";
type TierBucket = {
  key: string;
  tiers: number[];
  colorClassName: string;
};

type RaidScoreUsageListProps = {
  usage: RangeStatsStudentUsage[];
  sampleSize: number;
  allStudents: Record<string, StudentInfo>;
  recruitedStudentTiers: Record<string, number>;
};

const MIN_USAGE_RATIO = 0.01;
const TIER_USAGE_BAR_MAX_COUNT = 20_000;
const TIER_BUCKETS: TierBucket[] = [
  { key: "weapon4", tiers: [9], colorClassName: "bg-pink-500/80 dark:bg-pink-400/75" },
  { key: "weapon3", tiers: [8], colorClassName: "bg-violet-500/80 dark:bg-violet-400/75" },
  { key: "weapon2", tiers: [7], colorClassName: "bg-blue-500/80 dark:bg-blue-400/75" },
  { key: "weapon1-star5", tiers: [6, 5], colorClassName: "bg-teal-500/75 dark:bg-teal-400/70" },
  { key: "star4", tiers: [4], colorClassName: "bg-amber-500/75 dark:bg-amber-400/70" },
  { key: "star3-under", tiers: [3, 2, 1], colorClassName: "bg-rose-700/65 dark:bg-rose-500/60" },
];

export default function RaidScoreUsageList({
  usage,
  sampleSize,
  allStudents,
  recruitedStudentTiers,
}: RaidScoreUsageListProps) {
  const [usageMode, setUsageMode] = useState<UsageMode>("total");
  const hasRecruitedStudentTiers = Object.keys(recruitedStudentTiers).length > 0;
  const rows = useMemo(
    () =>
      usage.flatMap((item) => {
        if (!meetsMinimumUsageRatio(item, sampleSize)) {
          return [];
        }
        const student = allStudents[item.studentUid];
        if (!student) {
          return [];
        }
        return [{ ...item, name: student.name, role: student.role }];
      }),
    [usage, sampleSize, allStudents],
  );
  const sortedRows = useMemo(() => [...rows].sort((a, b) => compareUsageRows(a, b, usageMode)), [rows, usageMode]);

  if (rows.length === 0) {
    return <p className="py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">학생 출전 데이터가 없어요</p>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterButtons
          buttonProps={[
            { text: "전체", active: usageMode === "total", onToggle: () => setUsageMode("total") },
            { text: "모집", active: usageMode === "own", onToggle: () => setUsageMode("own") },
            { text: "조력", active: usageMode === "assist", onToggle: () => setUsageMode("assist") },
          ]}
          exclusive
          atLeastOne
          size="sm"
        />
        {hasRecruitedStudentTiers && <MyTierLegend />}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <UsageGroup
          title="스트라이커"
          rows={sortedRows.filter((row) => row.role === "striker")}
          sampleSize={sampleSize}
          usageMode={usageMode}
          recruitedStudentTiers={recruitedStudentTiers}
        />
        <UsageGroup
          title="스페셜"
          rows={sortedRows.filter((row) => row.role === "special")}
          sampleSize={sampleSize}
          usageMode={usageMode}
          recruitedStudentTiers={recruitedStudentTiers}
        />
      </div>
    </div>
  );
}

function UsageGroup({
  title,
  rows,
  sampleSize,
  usageMode,
  recruitedStudentTiers,
}: {
  title: string;
  rows: UsageRow[];
  sampleSize: number;
  usageMode: UsageMode;
  recruitedStudentTiers: Record<string, number>;
}) {
  const [showMore, setShowMore] = useState(false);
  const visibleRows = showMore ? rows : rows.slice(0, 5);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</p>
      <div className="rounded-md border border-neutral-200 p-2 dark:border-neutral-700">
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {visibleRows.map((row) => (
            <UsageListItem
              key={row.studentUid}
              row={row}
              sampleSize={sampleSize}
              usageMode={usageMode}
              recruitedTier={recruitedStudentTiers[row.studentUid]}
            />
          ))}
        </div>
        {rows.length > 5 && (
          <div className={cn("mt-2 flex justify-center", showMore && "sticky bottom-3 z-10")}>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center justify-center rounded-full bg-background/80 px-4 py-1.5 text-sm font-medium text-foreground shadow-sm shadow-neutral-950/10 backdrop-blur-sm transition hover:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:shadow-neutral-950/25"
              onClick={() => setShowMore((current) => !current)}
            >
              {showMore ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
              <span className="ml-1">{showMore ? "접기" : "더 보기"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UsageListItem({
  row,
  sampleSize,
  usageMode,
  recruitedTier,
}: {
  row: UsageRow;
  sampleSize: number;
  usageMode: UsageMode;
  recruitedTier?: number;
}) {
  const usageCount = getUsageCount(row, usageMode);
  const usageRatio = sampleSize > 0 ? usageCount / sampleSize : 0;
  const tierCounts = getTierCounts(row, usageMode);

  return (
    <Link
      to={`/students/${row.studentUid}`}
      className="group relative flex items-start gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none dark:hover:bg-neutral-800/60 dark:focus-visible:bg-neutral-800/60"
    >
      <span className="mt-0.5 w-8 shrink-0">
        <StudentCard uid={row.studentUid} circular />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 pt-0.5">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-sm font-medium text-neutral-900 group-hover:underline dark:text-neutral-100">
              {row.name}
            </span>
            <ChevronRightIcon className="size-3.5 shrink-0 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-600 dark:text-neutral-500 dark:group-hover:text-neutral-300" />
          </span>
          <p className="shrink-0 whitespace-nowrap text-right text-xs font-normal tabular-nums text-neutral-500 dark:text-neutral-400">
            {formatPercent(usageRatio)} · {usageCount.toLocaleString()}회
          </p>
        </div>
        <TierUsageRows tierCounts={tierCounts} recruitedTier={recruitedTier} />
      </div>
    </Link>
  );
}

function getUsageCount(row: UsageRow, usageMode: UsageMode): number {
  if (usageMode === "own") {
    return row.ownCount;
  }
  if (usageMode === "assist") {
    return row.assistCount;
  }
  return row.ownCount + row.assistCount;
}

function meetsMinimumUsageRatio(row: RangeStatsStudentUsage, sampleSize: number): boolean {
  if (sampleSize <= 0) {
    return false;
  }
  return (row.ownCount + row.assistCount) / sampleSize >= MIN_USAGE_RATIO;
}

function compareUsageRows(a: UsageRow, b: UsageRow, usageMode: UsageMode): number {
  return (
    getUsageCount(b, usageMode) - getUsageCount(a, usageMode) ||
    getUsageCount(b, "total") - getUsageCount(a, "total") ||
    b.ownCount - a.ownCount ||
    a.name.localeCompare(b.name, "ko")
  );
}

function getTierCounts(row: UsageRow, usageMode: UsageMode): TierCount[] {
  if (usageMode === "own") {
    return row.slotsByTier;
  }
  if (usageMode === "assist") {
    return row.assistsByTier;
  }
  return mergeTierCounts(row.slotsByTier, row.assistsByTier);
}

function TierUsageRows({ tierCounts, recruitedTier }: { tierCounts: TierCount[]; recruitedTier?: number }) {
  const bucketCounts = buildTierBucketCounts(tierCounts);

  return (
    <div role="img" className="mt-1.5 space-y-0.5" aria-label="성장도별 출전 횟수">
      {bucketCounts.map(({ bucket, count }) => {
        const ratio = getTierUsageBarRatio(count);
        const isRecruitedTier = recruitedTier != null && bucket.tiers.includes(recruitedTier);

        return (
          <div key={bucket.key} className="flex items-center gap-1.5 text-xs leading-4">
            <span
              className={cn(
                "-ml-1 flex shrink-0 items-center gap-1.5 rounded-sm px-1",
                isRecruitedTier &&
                  "bg-neutral-500/10 ring-1 ring-neutral-500/20 dark:bg-neutral-100/10 dark:ring-neutral-300/20",
              )}
            >
              <span className="w-9 shrink-0 text-neutral-600 dark:text-neutral-300">
                <TierBucketLabel bucket={bucket} />
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                {count.toLocaleString()}
              </span>
            </span>
            <span className="h-1.5 min-w-0 flex-1">
              {count > 0 ? (
                <span
                  className={cn("block h-1.5 min-w-1 rounded-full transition-all duration-300", bucket.colorClassName)}
                  style={{ width: `${ratio * 100}%` }}
                />
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function getTierUsageBarRatio(count: number): number {
  return Math.min(count / TIER_USAGE_BAR_MAX_COUNT, 1);
}

function MyTierLegend() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
      <span className="size-3 rounded-sm bg-neutral-500/10 ring-1 ring-neutral-500/20 dark:bg-neutral-100/10 dark:ring-neutral-300/20" />
      <span className="ml-0.5">내 학생 성장도</span>
    </span>
  );
}

function mergeTierCounts(slotsByTier: TierCount[], assistsByTier: TierCount[]): TierCount[] {
  const tierCounts = new Map<number, number>();

  for (const { tier, count } of slotsByTier) {
    tierCounts.set(tier, (tierCounts.get(tier) || 0) + count);
  }
  for (const { tier, count } of assistsByTier) {
    tierCounts.set(tier, (tierCounts.get(tier) || 0) + count);
  }

  return Array.from(tierCounts.entries())
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.tier - a.tier);
}

function buildTierBucketCounts(tierCounts: TierCount[]): { bucket: TierBucket; count: number }[] {
  const tierCountMap = new Map(tierCounts.map(({ tier, count }) => [tier, count]));

  return TIER_BUCKETS.map((bucket) => ({
    bucket,
    count: bucket.tiers.reduce((sum, tier) => sum + (tierCountMap.get(tier) ?? 0), 0),
  }));
}

function TierBucketLabel({ bucket }: { bucket: TierBucket }) {
  switch (bucket.key) {
    case "weapon4":
      return <WeaponTierLabel tier={4} />;
    case "weapon3":
      return <WeaponTierLabel tier={3} />;
    case "weapon2":
      return <WeaponTierLabel tier={2} />;
    case "weapon1-star5":
      return <WeaponTierLabel tier={1} />;
    case "star4":
      return <StarTierLabel tier={4} />;
    case "star3-under":
      return <span className="tabular-nums">★3↓</span>;
    default:
      return null;
  }
}

function WeaponTierLabel({ tier }: { tier: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <img className="size-3.5 shrink-0 opacity-80" src="/icons/exclusive_weapon.png" alt="고유 장비" />
      <span className="tabular-nums">{tier}</span>
    </span>
  );
}

function StarTierLabel({ tier }: { tier: number }) {
  return <span className="tabular-nums">★{tier}</span>;
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(ratio >= 1 ? 0 : 1)}%`;
}
