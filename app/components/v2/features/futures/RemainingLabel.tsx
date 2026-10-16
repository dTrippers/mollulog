import { ClockIcon } from "@heroicons/react/24/outline";
import type { RemainingTime } from "~/domain/futures/futures-view-model";

// Time left in an ongoing content: a day count, hours, or tomorrow. The timeline and the list rows share it.
export function RemainingLabel({ remaining }: { remaining: RemainingTime }) {
  if (remaining.kind === "tomorrow") {
    return <span className="text-v2-fg-tertiary">내일 종료</span>;
  }
  if (remaining.kind === "days") {
    return (
      <span className="inline-flex items-center gap-1 text-v2-fg-tertiary tabular-nums">
        <ClockIcon className="size-3.5" aria-hidden="true" />
        {remaining.days}일 남음
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-v2-warning tabular-nums">
      <ClockIcon className="size-3.5" aria-hidden="true" />
      {remaining.hours}시간 남음
    </span>
  );
}
