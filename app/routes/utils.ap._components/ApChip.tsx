import { BoltIcon } from "@heroicons/react/16/solid";
import { cn } from "~/lib/utils";

export default function ApChip({ value, className }: { value?: string | number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-sm bg-green-700/10 px-1.5 py-1 text-xs font-semibold tabular-nums text-green-800 dark:bg-green-400/15 dark:text-green-300",
        className,
      )}
    >
      <BoltIcon aria-hidden="true" className="size-3 shrink-0" />
      {value === undefined ? "AP" : value}
    </span>
  );
}
