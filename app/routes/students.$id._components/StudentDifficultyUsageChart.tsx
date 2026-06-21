import { difficultyLocale } from "~/locales/ko";
import type { StudentDifficultyUsage } from "./StudentDifficultyUsageModel";
import { UsageBarList, UsageChartCard } from "./UsageBarChart";
import { formatUsagePercent } from "./formatUsagePercent";

type StudentDifficultyUsageChartProps = {
  rows: StudentDifficultyUsage[];
  loading: boolean;
};

export default function StudentDifficultyUsageChart({ rows, loading }: StudentDifficultyUsageChartProps) {
  return (
    <UsageChartCard
      title="난이도별 출전 비율"
      loading={loading}
      empty={rows.length === 0}
      emptyText="출전 기록이 부족해요"
    >
      <UsageBarList
        rows={rows}
        getKey={(row) => row.difficulty}
        getRatio={(row) => row.usageRate}
        labelClassName="w-20"
        renderLabel={(row) => difficultyLocale[row.difficulty] ?? row.difficulty}
        renderValue={(row) => `${row.sampleSize.toLocaleString()}회 중 ${formatUsagePercent(row.usageRate)} 사용`}
        getBarClassName={() => "bg-blue-500"}
      />
    </UsageChartCard>
  );
}
