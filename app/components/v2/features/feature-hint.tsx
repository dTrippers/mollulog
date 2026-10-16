import { type InformationCircleIcon, XMarkIcon } from "@heroicons/react/16/solid";
import type { RefObject } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

// One-line hint with one action and a dismiss control. It has no box. The controls are small on fine pointers, and on
// coarse pointers the row grows to 44px while the visible controls stay 28px with 44px hit areas. The timeline banner and
// the sheet tutorial both use it. The sheet's version is full width, so its text takes the free space.
export function FeatureHint({
  Icon,
  message,
  actionLabel,
  onAction,
  closeLabel,
  onClose,
  closeRef,
  fullWidth = false,
}: {
  Icon: typeof InformationCircleIcon;
  message: string;
  actionLabel: string;
  onAction: () => void;
  closeLabel: string;
  onClose: () => void;
  closeRef?: RefObject<HTMLButtonElement | null>;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs leading-4 text-v2-fg-secondary pointer-coarse:min-h-11",
        fullWidth ? "w-full" : "w-fit max-w-[40rem]",
      )}
    >
      <Icon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
      <p className={cn("min-w-0", fullWidth && "flex-1")}>{message}</p>
      <div className="ml-0.5 flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onAction}
          className={cn(
            "relative inline-flex h-6 cursor-pointer items-center rounded-md bg-v2-inset px-2 text-xs font-medium whitespace-nowrap text-v2-fg hover:bg-v2-filled-hover pointer-coarse:h-7 pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-2 before:content-['']",
            v2FocusRing,
          )}
        >
          {actionLabel}
        </button>
        <button
          ref={closeRef}
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className={cn(
            "relative inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-v2-fg-tertiary hover:bg-v2-hover hover:text-v2-fg pointer-coarse:size-7 pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-2 before:content-['']",
            v2FocusRing,
          )}
        >
          <XMarkIcon className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
