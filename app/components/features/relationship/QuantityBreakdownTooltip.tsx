export type ItemQuantityBreakdownEntry = {
  studentUid: string;
  name: string;
  quantity: number;
};

export function QuantityBreakdownTooltipContent({ breakdown }: { breakdown: ItemQuantityBreakdownEntry[] }) {
  return (
    <div className="min-w-32 max-w-xs">
      <p className="mb-1 font-semibold">필요한 학생</p>
      <div className="space-y-0.5">
        {breakdown.map((entry) => (
          <div key={entry.studentUid} className="flex items-center justify-between gap-4">
            <span className="min-w-0 truncate">{entry.name}</span>
            <span className="shrink-0 tabular-nums">{entry.quantity.toLocaleString()}개</span>
          </div>
        ))}
      </div>
    </div>
  );
}
