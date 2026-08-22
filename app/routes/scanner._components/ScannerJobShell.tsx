import type { ReactNode } from "react";
import type { ScannerPhase } from "./scanner-client";

export default function ScannerJobShell({
  phase,
  upload,
  progress,
  review,
  completion,
}: {
  phase: ScannerPhase;
  upload: ReactNode;
  progress: ReactNode;
  review: ReactNode;
  completion: ReactNode;
}) {
  return (
    <>
      {phase === "idle" || phase === "uploading" ? upload : null}
      {phase === "waiting" ? progress : null}
      {phase === "review" || phase === "applying" ? review : null}
      {completion}
    </>
  );
}
