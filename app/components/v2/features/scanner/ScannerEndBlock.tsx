import type { ReactNode } from "react";

// The end block for a terminal job: the reason in plain words, and the next action when there is one.
export function ScannerEndBlock({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p">
      <div className="text-sm text-v2-fg-secondary">{children}</div>
      {action ? <div>{action}</div> : null}
    </section>
  );
}
