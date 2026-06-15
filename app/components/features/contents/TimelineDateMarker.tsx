import type { ReactNode } from "react";

type TimelineDateMarkerProps = {
  children: ReactNode;
  current?: boolean;
  compact?: boolean;
};

export function TimelineDateMarker({ children, current = false, compact = false }: TimelineDateMarkerProps) {
  const dotClassName = current ? "bg-red-600 animate-pulse" : "bg-neutral-500 dark:bg-neutral-400";
  const textClassName = current
    ? "text-red-600"
    : `${compact ? "text-xs" : "text-sm"} text-neutral-500 dark:text-neutral-400`;

  return (
    <div className="flex items-stretch py-3 md:py-4">
      <div className="relative flex w-3 shrink-0 justify-center">
        <div className={`relative z-10 self-center size-3 rounded-full ${dotClassName}`} />
      </div>
      <span className={`ml-3 self-center font-bold md:ml-5 ${textClassName}`}>{children}</span>
    </div>
  );
}
