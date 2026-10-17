import { ClockIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { ProgressBar } from "../../primitives/ProgressBar";
import { Skeleton } from "../../primitives/Skeleton";

export type ScannerQuotaMeterState =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | { kind: "exhausted"; remaining: number; limit: number; availableAt: string | null }
  | { kind: "low"; remaining: number; limit: number }
  | { kind: "normal"; remaining: number; limit: number };

export type ScannerQuotaMeterProps = {
  subject: string;
  state: ScannerQuotaMeterState;
};

export function formatScannerQuotaAvailability(value: string): string {
  return dayjs(value).format("MM/DD HH:mm");
}

// One kind of quota: the remaining amount beside the limit, a bar of the remaining share, and the next available time when used up.
export function ScannerQuotaMeter({ subject, state }: ScannerQuotaMeterProps) {
  if (state.kind === "loading") {
    return (
      <div className="flex min-w-0 flex-1 basis-0 flex-col gap-1.5" aria-busy="true">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="whitespace-nowrap text-v2-fg-tertiary">{subject}</span>
          <span className="whitespace-nowrap text-v2-fg-tertiary">불러오는 중</span>
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex min-w-0 flex-1 basis-0 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="whitespace-nowrap text-v2-fg-tertiary">{subject}</span>
          <span className="text-v2-danger">불러오지 못했어요</span>
        </div>
        <button
          type="button"
          onClick={state.onRetry}
          className={cn(
            "w-fit cursor-pointer rounded-md text-xs font-medium text-v2-fg-secondary underline underline-offset-2 hover:text-v2-fg",
            v2FocusRing,
          )}
        >
          다시 시도
        </button>
      </div>
    );
  }

  const isExhausted = state.kind === "exhausted";
  const isLow = state.kind === "low";
  const numberClassName = isExhausted ? "text-v2-danger" : isLow ? "text-v2-warning" : "text-v2-fg";
  const barTone = isExhausted ? "danger" : isLow ? "warning" : "default";
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="whitespace-nowrap text-v2-fg-tertiary">{subject}</span>
        <span className={cn("whitespace-nowrap font-semibold tabular-nums", numberClassName)}>
          {state.remaining} / {state.limit}
        </span>
      </div>
      <ProgressBar
        value={state.remaining}
        max={state.limit}
        label={`${subject} 업로드 가능 횟수, ${state.remaining} / ${state.limit}`}
        tone={barTone}
        track={isExhausted ? "danger" : "default"}
      />
      {isExhausted && state.availableAt ? (
        <p className="flex items-center gap-1 text-xs font-semibold tabular-nums text-v2-danger">
          <ClockIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{formatScannerQuotaAvailability(state.availableAt)}부터 가능</span>
        </p>
      ) : null}
    </div>
  );
}

// The quota block: one label, then the image and video meters. It is shown on both tabs.
export function ScannerQuota({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="남은 업로드 횟수 (7일간)"
      className="flex w-full max-w-[26rem] flex-col gap-2 rounded-lg bg-v2-surface p-v2-block-p"
    >
      <p className="text-xs font-medium text-v2-fg-tertiary">남은 업로드 횟수 (7일간)</p>
      <div className="flex gap-x-v2-column-gap">{children}</div>
    </section>
  );
}
