import type { ReactNode } from "react";

// A compact profile block between the header and tabs on stacked layouts. The same facts live in PageAside on desktop.
export function PageStackedSummary({ children }: { children: ReactNode }) {
  return <div className="v2-stacked-summary min-w-0 pb-v2-group-gap">{children}</div>;
}
