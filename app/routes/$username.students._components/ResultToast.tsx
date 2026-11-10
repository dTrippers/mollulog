import { CheckIcon, ExclamationCircleIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect } from "react";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { cn } from "~/lib/utils";

export type ResultToastState = { id: number; tone: "success" | "failure"; message: string };

const SUCCESS_DURATION_MS = 4000;

// The result of a quick action, in the bottom-right corner like the save toast. A success fades on its own; a failure
// stays until it is dismissed, so it cannot be missed.
export function ResultToast({
  toast,
  onClose,
  aboveActionBar = false,
}: {
  toast: ResultToastState | null;
  onClose: () => void;
  aboveActionBar?: boolean;
}) {
  const id = toast?.id;
  const tone = toast?.tone;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new toast id restarts the timer
  useEffect(() => {
    if (id === undefined || tone !== "success") return;
    const timer = window.setTimeout(onClose, SUCCESS_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [id, tone]);
  if (!toast) return null;
  const Icon = toast.tone === "success" ? CheckIcon : ExclamationCircleIcon;
  return (
    <div
      role={toast.tone === "failure" ? "alert" : "status"}
      className={cn(
        "fixed right-4 z-layer-toast inline-flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg bg-v2-selected px-4 py-2 text-sm font-medium text-v2-on-selected shadow-lg md:right-8 lg:bottom-4",
        aboveActionBar ? "bottom-[calc(var(--mobile-bottom-offset)+5.5rem)]" : "bottom-[var(--mobile-bottom-offset)]",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{toast.message}</span>
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className={cn("inline-flex shrink-0 cursor-pointer rounded-sm opacity-60 hover:opacity-100", v2FocusRing)}
      >
        <XMarkIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
