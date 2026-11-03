import { StarIcon } from "@heroicons/react/16/solid";

// A star tier shown as a star icon and the number ("★1"); screen readers hear "1성".
export function StarTierLabel({ tier }: { tier: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <StarIcon className="size-3 shrink-0" aria-hidden="true" />
      <span className="tabular-nums" aria-hidden="true">{tier}</span>
      <span className="sr-only">{tier}성</span>
    </span>
  );
}
