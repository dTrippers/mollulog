import { CheckIcon, XMarkIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export type ScannerStepState = "done" | "active" | "pending" | "failed";

export const SCANNER_STEP_LABELS = ["업로드", "인식", "검토", "반영"] as const;

export type ScannerStepStates = [ScannerStepState, ScannerStepState, ScannerStepState, ScannerStepState];

// The four-step indicator. Each step is a marker and a label. Failure uses the danger color and an ✕ marker, so color is not the only signal.
export function ScannerSteps({ states }: { states: ScannerStepStates }) {
  return (
    <ol
      aria-label="진행 단계"
      className="flex min-w-0 flex-nowrap items-center gap-x-1.5 text-xs sm:gap-x-2 sm:text-sm"
    >
      {SCANNER_STEP_LABELS.map((label, index) => {
        const state = states[index];
        const isLast = index === SCANNER_STEP_LABELS.length - 1;
        return (
          <li
            key={label}
            aria-current={state === "active" ? "step" : undefined}
            className="flex shrink-0 items-center gap-1.5 sm:gap-2"
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
                state === "active" && "bg-v2-fg text-v2-canvas",
                state === "done" && "bg-v2-success-subtle text-v2-success",
                state === "failed" && "text-v2-danger",
                state === "pending" && "bg-v2-inset text-v2-fg-tertiary",
              )}
            >
              {state === "done" ? <CheckIcon className="size-4" aria-hidden="true" /> : null}
              {state === "failed" ? <XMarkIcon className="size-4" aria-hidden="true" /> : null}
              {state === "active" || state === "pending" ? index + 1 : null}
              <span className="sr-only">{state === "done" ? " 완료" : state === "failed" ? " 실패" : ""}</span>
            </span>
            <span
              className={cn(
                "font-medium",
                state === "pending" && "text-v2-fg-tertiary",
                state === "active" && "text-v2-fg",
                state === "done" && "text-v2-fg-secondary",
                state === "failed" && "text-v2-danger",
              )}
            >
              {label}
            </span>
            {isLast ? null : <span aria-hidden="true" className="h-px w-3 bg-v2-divider sm:w-6" />}
          </li>
        );
      })}
    </ol>
  );
}

// Every step state uses this block. The title and its status line are the live region, so a step change is announced once.
export function ScannerStepHeader({
  states,
  action,
  children,
}: {
  states: ScannerStepStates;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p">
      <div className="flex flex-wrap items-center justify-between gap-x-v2-block-gap gap-y-2">
        <ScannerSteps states={states} />
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div aria-live="polite" className="flex flex-col gap-v2-group-gap">
        {children}
      </div>
    </section>
  );
}

// Keep the title and any secondary detail on separate lines so long status text does not crowd the heading.
export function ScannerStepTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="flex flex-col text-base font-semibold text-v2-fg">
        <span>{title}</span>
        {meta ? <span className="text-sm font-normal text-v2-fg-secondary tabular-nums">{meta}</span> : null}
      </p>
    </div>
  );
}
