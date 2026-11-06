import type { ReactNode } from "react";
import { useV2Page } from "./V2Page";

// A page-level notice on its own full-width row between the toolbar and the content. Use it inside a
// V2Page with toolbarSpan="full"; elsewhere the grid has no notice area.
export function PageNotice({ children }: { children: ReactNode }) {
  useV2Page();
  return <div className="v2-notice min-w-0">{children}</div>;
}
