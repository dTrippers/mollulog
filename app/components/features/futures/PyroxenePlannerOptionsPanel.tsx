import { cn } from "~/lib/utils";
import type { PyroxenePlannerOptions } from "~/models/pyroxene-planner";

const pickupChanceOptions = [
  { label: "평균 (140회)", value: "average" as const, fallback: "ceil" as const },
  { label: "천장 (200회)", value: "ceil" as const, fallback: "average" as const },
];

type PyroxenePlannerOptionsPanelProps = {
  options: PyroxenePlannerOptions;
  onOptionsChange: (options: PyroxenePlannerOptions) => void;
};

export default function PyroxenePlannerOptionsPanel({ options, onOptionsChange }: PyroxenePlannerOptionsPanelProps) {
  return (
    <div className="space-y-1 rounded-lg border border-neutral-200/80 p-1 dark:border-neutral-700/80">
      <div className="rounded-md px-3 py-2 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-700/70 lg:px-2.5 lg:py-1.5">
        <div className="min-h-8 lg:min-h-7">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">★3 학생 모집 목표</p>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              학생 한 명당 목표 모집 횟수 (이벤트 별 설정 가능)
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {pickupChanceOptions.map(({ label, value, fallback }) => (
              <PickupChanceChip
                key={value}
                label={label}
                active={options.event.pickupChance === value}
                onClick={() =>
                  onOptionsChange({
                    ...options,
                    event: { ...options.event, pickupChance: options.event.pickupChance === value ? fallback : value },
                  })
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PickupChanceChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 cursor-pointer items-center rounded-sm border px-2 text-xs font-medium transition lg:h-7 lg:px-1.5",
        active
          ? "border-blue-500/20 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
          : "border-neutral-200 bg-neutral-100/70 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700",
      )}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
