import { CheckIcon, Square2StackIcon } from "@heroicons/react/16/solid";
import { useEffect, useRef, useState } from "react";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { sanitizeErrorForLogging } from "~/lib/privacy-scrub";
import { cn } from "~/lib/utils";
import { Button } from "../../primitives/Button";

type CopyState = "idle" | "copied" | "failed";

// A coupon or member code with its copy button. When the clipboard cannot be used, the code is selected so the
// user can copy it by hand, and a line below says so.
export function CouponCodeField({
  code,
  codeType,
  className,
}: {
  code: string;
  codeType: "coupon" | "member_code";
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const codeRef = useRef<HTMLSpanElement>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const selectCode = () => {
    const node = codeRef.current;
    const selection = typeof window === "undefined" ? null : window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleCopy = async () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    try {
      if (!navigator?.clipboard?.writeText) throw new Error("Clipboard API is not available.");
      await navigator.clipboard.writeText(code);
      setState("copied");
      trackGoogleAnalyticsEvent("coupon_code_copied", { code_type: codeType });
      resetTimer.current = window.setTimeout(() => setState("idle"), 2000);
    } catch (error) {
      console.error("Failed to copy text to clipboard.", sanitizeErrorForLogging(error));
      setState("failed");
      selectCode();
    }
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex min-h-[2.375rem] items-center gap-2 rounded-md border border-v2-control-border py-0.5 pr-0.5 pl-3">
        <span
          ref={codeRef}
          className="min-w-0 flex-1 font-mono text-[0.9375rem] leading-snug font-medium tracking-wide break-all text-v2-fg select-all"
        >
          {code}
        </span>
        <Button
          size="sm"
          onClick={handleCopy}
          className={cn("min-w-16 shrink-0", state === "copied" && "text-v2-success")}
        >
          {state === "copied" ? (
            <CheckIcon className="size-3.5" aria-hidden="true" />
          ) : (
            <Square2StackIcon className="size-3.5" aria-hidden="true" />
          )}
          {state === "copied" ? "복사됨" : "복사"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className={cn("text-xs text-v2-danger", state !== "failed" && "sr-only")}>
        {state === "failed" ? "복사하지 못했어요. 코드를 직접 선택해서 복사해주세요" : ""}
      </p>
    </div>
  );
}
