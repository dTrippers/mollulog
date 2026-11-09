import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

// Autosave status in the bottom-right corner. Saving shows briefly; a failure stays until it is dismissed or retried,
// and the edited values stay on screen meanwhile.
export function SaveToast({
  saving,
  failed,
  onRetry,
  aboveActionBar = false,
}: {
  saving: boolean;
  failed: boolean;
  onRetry?: () => void;
  // Stacked layouts float a result bar at the bottom; the toast sits above it.
  aboveActionBar?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!failed) setDismissed(false);
  }, [failed]);
  const showFailure = failed && !dismissed;
  if (!saving && !showFailure) return null;

  return (
    <div
      role={showFailure ? "alert" : "status"}
      className={cn(
        "fixed right-4 z-layer-toast inline-flex items-center gap-2 rounded-lg bg-v2-selected px-4 py-2 text-sm font-medium whitespace-nowrap text-v2-on-selected shadow-lg md:right-8 lg:bottom-4",
        aboveActionBar ? "bottom-[calc(var(--mobile-bottom-offset)+5.5rem)]" : "bottom-[var(--mobile-bottom-offset)]",
      )}
    >
      {showFailure ? (
        <>
          저장하지 못했어요
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn("cursor-pointer rounded-sm font-semibold underline underline-offset-2", v2FocusRing)}
            >
              다시 시도
            </button>
          ) : null}
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setDismissed(true)}
            className={cn("inline-flex cursor-pointer rounded-sm opacity-60 hover:opacity-100", v2FocusRing)}
          >
            <XMarkIcon className="size-4" aria-hidden="true" />
          </button>
        </>
      ) : (
        <>
          <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          저장 중...
        </>
      )}
    </div>
  );
}
