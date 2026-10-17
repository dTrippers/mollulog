import type { ScannerPhase } from "./scanner-client";

export type ScannerStepBody = "upload" | "waiting" | "review" | "unavailable" | "completion" | "terminal";

export type ScannerStepBodyInput = {
  // The `?job=` param selects a job, so the upload step gives way to the job's body.
  hasSelectedJob: boolean;
  hasJob: boolean;
  phase: ScannerPhase;
  isApplied: boolean;
  isTerminal: boolean;
  // The body for a reviewable job. Null when the job is not reviewable yet, so no review body is shown.
  reviewBody: "review" | "unavailable" | null;
};

// Exactly one step body per job state. The rules run in order and the first match wins, so no two bodies render together.
export function getScannerStepBody(input: ScannerStepBodyInput): ScannerStepBody | null {
  if (!input.hasSelectedJob) return "upload";
  if (!input.hasJob) return null;
  if (input.isApplied) return "completion";
  if (input.isTerminal) return "terminal";
  if (input.phase === "waiting") return "waiting";
  return input.reviewBody;
}
