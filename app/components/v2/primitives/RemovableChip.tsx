import { XMarkIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export function RemovableChip({
  label,
  ariaLabel,
  onRemove,
  className,
}: {
  label: ReactNode;
  ariaLabel?: string;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-removable-chip
      aria-label={ariaLabel ?? `${typeof label === "string" ? label : "조건"} 해제`}
      onClick={onRemove}
      className={cn("group inline-flex min-h-8 cursor-pointer items-center justify-center rounded-full px-0 text-xs text-v2-fg-secondary sm:min-h-7", v2FocusRing, className)}
    >
      <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-v2-inset px-3 text-xs group-hover:bg-v2-filled-hover group-active:bg-v2-filled-hover sm:min-h-7">
        <span className="max-w-56 truncate">{label}</span>
        <XMarkIcon className="size-3.5 shrink-0" aria-hidden="true" />
      </span>
    </button>
  );
}
