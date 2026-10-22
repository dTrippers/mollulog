import { difficultyLocale } from "~/locales/ko";
import { formatUsagePercent } from "./formatUsagePercent";
import type { StudentDifficultyUsage } from "./StudentDifficultyUsageModel";
import { UsageBarList, UsageChartCard } from "./UsageBarChart";

export default function StudentDifficultyUsageChart({
  rows,
  loading,
  failed = false,
  onRetry,
}: {
  rows: StudentDifficultyUsage[];
  loading: boolean;
  failed?: boolean;
  onRetry?: () => void;
}) {
  return (
    <UsageChartCard title="난이도별 출전 비율" loading={loading} failed={failed} onRetry={onRetry} empty={rows.length === 0} emptyText="출전 기록이 부족해요">
      <UsageBarList
        variant="difficulty"
        rows={rows}
        getKey={(row) => row.difficulty}
        getRatio={(row) => row.usageRate}
        renderLabel={(row) => difficultyLocale[row.difficulty] ?? row.difficulty}
        renderValue={(row) => <>{row.sampleSize.toLocaleString()}회 중 <strong className="font-medium text-v2-fg">{formatUsagePercent(row.usageRate)}</strong> 사용</>}
      />
    </UsageChartCard>
  );
}
