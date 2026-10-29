import { useEffect, useMemo, useRef } from "react";
import type { StudentDirectoryFilterState } from "~/domain/student-directory";
import {
  clearStudentDirectoryFilters,
  getStudentDirectoryAppliedFilters,
  hasStudentDirectoryFilters,
} from "~/domain/student-directory";
import { terrainAdaptationIconUrl } from "~/models/assets";
import type { StudentDirectoryStudent } from "~/models/student-directory";
import { Button } from "../../primitives/Button";
import { RemovableChip } from "../../primitives/RemovableChip";
import { StarTierLabel } from "./StarTierLabel";

export function ResultSummary({
  students,
  state,
  count,
  onChange,
}: {
  students: StudentDirectoryStudent[];
  state: StudentDirectoryFilterState;
  count: number;
  onChange: React.Dispatch<React.SetStateAction<StudentDirectoryFilterState>>;
}) {
  const chips = useMemo(() => getStudentDirectoryAppliedFilters(students, state), [students, state]);
  const summaryRef = useRef<HTMLSpanElement>(null);
  const nextFocusIndex = useRef<number | null>(null);
  useEffect(() => {
    if (nextFocusIndex.current === null) return;
    const index = nextFocusIndex.current;
    nextFocusIndex.current = null;
    const summary = summaryRef.current?.parentElement;
    const buttons = summary?.querySelectorAll<HTMLButtonElement>("[data-removable-chip]") ?? [];
    const target =
      buttons[Math.min(index, chips.length - 1)] ??
      summary?.querySelector<HTMLButtonElement>("[data-filter-reset]") ??
      summaryRef.current;
    target?.focus();
  }, [chips]);

  const reset = () => {
    onChange(clearStudentDirectoryFilters);
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  return (
    <div className="flex min-h-v2-row-min flex-wrap items-center gap-1.5">
      <span
        ref={summaryRef}
        tabIndex={-1}
        aria-live="polite"
        className="mr-1 text-sm tabular-nums text-v2-fg-secondary"
      >
        {count}명
      </span>
      {chips.map((chip, index) => (
        <RemovableChip
          key={chip.key}
          label={
            chip.terrainRank ? (
              <span className="inline-flex items-center gap-1">
                <span>{chip.label}</span>
                <img
                  src={terrainAdaptationIconUrl(chip.terrainRank)}
                  alt=""
                  aria-hidden="true"
                  className="size-3.5 shrink-0 object-contain"
                />
              </span>
            ) : chip.tier !== undefined ? (
              <StarTierLabel tier={chip.tier} />
            ) : (
              chip.label
            )
          }
          ariaLabel={chip.ariaLabel ? `${chip.ariaLabel} 해제` : undefined}
          onRemove={() => {
            nextFocusIndex.current = index;
            onChange((current) => chip.remove(current));
          }}
        />
      ))}
      {hasStudentDirectoryFilters(state) ? (
        <Button
          variant="danger-subtle"
          data-filter-reset
          onClick={reset}
          className="min-h-8 shrink-0 px-0 bg-transparent hover:bg-transparent active:bg-transparent sm:min-h-7"
        >
          <span className="inline-flex min-h-8 items-center rounded-md bg-v2-danger-subtle px-3 text-xs text-v2-danger sm:min-h-7">
            초기화
          </span>
        </Button>
      ) : null}
    </div>
  );
}
