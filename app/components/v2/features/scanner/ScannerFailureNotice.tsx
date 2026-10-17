import { XCircleIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";

// A failure during recognition, as a row below the progress: a danger icon and secondary text, with a divider above.
export function ScannerFailureNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-t border-v2-divider pt-3 text-sm text-v2-fg-secondary">
      <XCircleIcon className="mt-0.5 size-4 shrink-0 text-v2-danger" aria-hidden="true" />
      <p className="min-w-0">{children}</p>
    </div>
  );
}
