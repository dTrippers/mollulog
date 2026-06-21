import { difficultyLocale } from "~/locales/ko";
import type { StudentDifficultyUsage } from "./StudentDifficultyUsageModel";
import { UsageBarList, UsageChartCard } from "./UsageBarChart";

type StudentDifficultyUsageChartProps = {
  rows: StudentDifficultyUsage[];
  loading: boolean;
};

const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export default function StudentDifficultyUsageChart({ rows, loading }: StudentDifficultyUsageChartProps) {
  return (
    <UsageChartCard
      title="난이도별 출전"
      description="학생의 총력전/대결전 난이도별 출전 비율"
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

function formatUsagePercent(value: number) {
  if (value > 0 && value < 0.001) {
    return "<0.1%";
  }
  return percentFormatter.format(value);
}
