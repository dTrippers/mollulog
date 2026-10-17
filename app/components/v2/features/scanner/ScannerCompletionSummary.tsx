import type { ReactNode } from "react";

export type ScannerCompletionSummaryProps = {
  title: string;
  meta: string;
  summary: string;
  actions: ReactNode;
  children: ReactNode;
};

// Completion uses the same order for both kinds: the summary line, then the actions, then the list of applied items.
export function ScannerCompletionSummary({ title, meta, summary, actions, children }: ScannerCompletionSummaryProps) {
  return (
    <section className="flex flex-col gap-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p">
      <p className="text-base font-semibold text-v2-fg">
        {title}
        <span className="ml-2 text-sm font-normal text-v2-fg-secondary tabular-nums">{meta}</span>
      </p>
      <div className="flex flex-col gap-v2-block-gap">
        <p className="text-sm text-v2-fg-secondary tabular-nums">{summary}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{actions}</div>
      </div>
      {children}
    </section>
  );
}
