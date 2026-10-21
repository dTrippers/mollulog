import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { runV2StateTransition } from "~/components/v2/layout/screen-transition";
import { notifyScannerJobsChanged } from "./ScannerJobsPanel";
import {
  classifyScannerJobStatusError,
  requestScannerJson,
  type ScannerJobStatusErrorKind,
  type ScannerPhase,
} from "./scanner-client";
import { getScannerCancelConfirmation, getScannerNewUploadConfirmation } from "./scanner-messages";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";

export type ScannerJobLike = {
  uid: string;
  status: string;
  updatedAt: string;
  jobKind?: "item_inventory_images_v1" | "student_detail_images_v1" | "student_detail_video_v1";
  application?: { status?: string } | null;
};

export type ScannerJobTransition = { phase: ScannerPhase; error?: string | null };

export type ScannerJobUpdate<T extends ScannerJobLike> = T | ((current: T | null) => T | null);

// A failed status read. A transient failure keeps the job uid, so a retry can request the same job again.
export type ScannerJobStatusError = { kind: ScannerJobStatusErrorKind; uid: string | null };

export function getScannerPollDelay(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return Math.min(10_000, Math.round(2000 * 1.5 ** safeAttempt));
}

export function removeScannerJobParam(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete("job");
  return next;
}

export function shouldConfirmScannerReset(job: Pick<ScannerJobLike, "status" | "application"> | null): boolean {
  return job?.status === "review_ready" && job.application?.status !== "applied";
}

export function useScannerJob<T extends ScannerJobLike>({
  analyticsKind,
  getTransition,
  onJob,
  onReset,
}: {
  analyticsKind?: "student" | "resource";
  getTransition: (job: T) => ScannerJobTransition;
  onJob?: (job: T) => void;
  onReset?: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedJobUid = searchParams.get("job");
  const [job, setJob] = useState<T | null>(null);
  const [phase, setPhaseState] = useState<ScannerPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<ScannerJobStatusError | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  const pollAttemptRef = useRef(0);
  const getTransitionRef = useRef(getTransition);
  const onJobRef = useRef(onJob);
  const onResetRef = useRef(onReset);
  getTransitionRef.current = getTransition;
  onJobRef.current = onJob;
  onResetRef.current = onReset;
  // Each selection change or reset starts a new generation. A manual re-request that finishes after the user moved
  // to another job (or started a new upload) belongs to an old generation and is dropped, so it cannot replace the view.
  const selectionGenerationRef = useRef(0);
  const lastSelectedJobUidRef = useRef(selectedJobUid);
  if (lastSelectedJobUidRef.current !== selectedJobUid) {
    lastSelectedJobUidRef.current = selectedJobUid;
    selectionGenerationRef.current += 1;
  }

  // Every step change crosses the v2 helper, so a screen never writes a transition of its own.
  const setPhase = useCallback((next: ScannerPhase) => {
    runV2StateTransition("crossfade", () => setPhaseState(next));
  }, []);

  const acceptJob = useCallback((next: T) => {
    const transition = getTransitionRef.current(next);
    runV2StateTransition("crossfade", () => {
      setJob(next);
      setPhaseState(transition.phase);
      setError(transition.error ?? null);
      setStatusError(null);
    });
    onJobRef.current?.(next);
    notifyScannerJobsChanged({ uid: next.uid, status: next.status, updatedAt: next.updatedAt });
  }, []);

  const clearJob = useCallback(() => {
    runV2StateTransition("crossfade", () => {
      setJob(null);
      setPhaseState("idle");
      setError(null);
    });
  }, []);

  const updateJob = useCallback((next: ScannerJobUpdate<T>) => {
    setJob((current) => (typeof next === "function" ? next(current) : next));
  }, []);

  // A missing job (purged, or no longer readable) ends the job view: the param is removed and only a new upload is offered.
  const dropMissingJob = useCallback(() => {
    setSearchParams(removeScannerJobParam, { replace: true });
    clearJob();
    setStatusError({ kind: "not_found", uid: null });
    onResetRef.current?.();
  }, [clearJob, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedJobUid) {
      pollAttemptRef.current = 0;
      clearJob();
      onResetRef.current?.();
      return () => {
        cancelled = true;
      };
    }

    if (job?.uid === selectedJobUid) {
      return;
    }

    pollAttemptRef.current = 0;
    void requestScannerJson<T>(`/api/ocr/jobs/${encodeURIComponent(selectedJobUid)}`)
      .then((next) => {
        if (!cancelled) acceptJob(next);
      })
      .catch((loadError) => {
        if (cancelled) return;
        const kind = classifyScannerJobStatusError(loadError);
        // The param is stripped on failure, as before. A transient failure keeps the uid in memory for the retry.
        setSearchParams(removeScannerJobParam, { replace: true });
        setStatusError({ kind, uid: kind === "transient" ? selectedJobUid : null });
      });
    return () => {
      cancelled = true;
    };
  }, [acceptJob, clearJob, job, selectedJobUid, setSearchParams]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pollTick restarts the backoff timer after a transient poll failure.
  useEffect(() => {
    if (!job || phase !== "waiting") return;
    let cancelled = false;
    const delay = getScannerPollDelay(pollAttemptRef.current);
    const timer = window.setTimeout(() => {
      void requestScannerJson<T>(`/api/ocr/jobs/${encodeURIComponent(job.uid)}`)
        .then((next) => {
          if (cancelled) return;
          pollAttemptRef.current += 1;
          acceptJob(next);
        })
        .catch((pollError) => {
          if (cancelled) return;
          pollAttemptRef.current += 1;
          const kind = classifyScannerJobStatusError(pollError);
          if (kind === "not_found") {
            dropMissingJob();
            return;
          }
          setStatusError({ kind, uid: job.uid });
          setPollTick((current) => current + 1);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [acceptJob, dropMissingJob, job, phase, pollTick]);

  // Re-requests the same job after a failed status read. A success restores `?job=` and shows the job again.
  // "stale" means the selection changed while the request ran, so the caller must not touch the current job.
  const refreshJob = useCallback(async (): Promise<"ok" | "failed" | "stale"> => {
    const uid = job?.uid ?? statusError?.uid ?? null;
    if (!uid) return "stale";
    const generation = selectionGenerationRef.current;
    try {
      const next = await requestScannerJson<T>(`/api/ocr/jobs/${encodeURIComponent(uid)}`);
      if (generation !== selectionGenerationRef.current) return "stale";
      if (!job) setSearchParams({ job: uid }, { replace: true });
      acceptJob(next);
      return "ok";
    } catch (refreshError) {
      if (generation !== selectionGenerationRef.current) return "stale";
      const kind = classifyScannerJobStatusError(refreshError);
      if (kind === "not_found") {
        dropMissingJob();
        return "failed";
      }
      // The status notice explains the failure; the raw request error is never shown.
      setStatusError({ kind, uid });
      return "failed";
    }
  }, [acceptJob, dropMissingJob, job, setSearchParams, statusError?.uid]);

  // A new upload starts a new generation and drops the retry state of an earlier job, so a late re-request of that
  // job cannot replace the upload in progress. The selected files are the caller's and stay as they are.
  const beginNewUpload = useCallback(() => {
    selectionGenerationRef.current += 1;
    setStatusError(null);
  }, []);

  const resetForNewUpload = useCallback(
    (confirmUnapplied = true) => {
      if (confirmUnapplied && shouldConfirmScannerReset(job)) {
        if (!window.confirm(getScannerNewUploadConfirmation())) return false;
      }
      setSearchParams(removeScannerJobParam, { replace: true });
      selectionGenerationRef.current += 1;
      runV2StateTransition("crossfade", () => {
        setJob(null);
        setPhaseState("idle");
        setError(null);
      });
      setStatusError(null);
      setIsCancelling(false);
      pollAttemptRef.current = 0;
      onResetRef.current?.();
      return true;
    },
    [job, setSearchParams],
  );

  const cancelResult = useCallback(async () => {
    if (job?.status !== "review_ready" || isCancelling) return false;
    if (!window.confirm(getScannerCancelConfirmation())) return false;
    setIsCancelling(true);
    setError(null);
    try {
      await requestScannerJson<{ uid: string; status: "cancelled" }>(
        `/api/ocr/jobs/${encodeURIComponent(job.uid)}/cancel`,
        { method: "POST" },
      );
      const kind = job.jobKind === "item_inventory_images_v1" ? "resource" : job.jobKind ? "student" : analyticsKind;
      if (kind) {
        trackGoogleAnalyticsEvent("ocr_job_cancelled", {
          kind,
        });
      }
      resetForNewUpload(false);
      notifyScannerJobsChanged();
      return true;
    } catch {
      setError("결과를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return false;
    } finally {
      setIsCancelling(false);
    }
  }, [analyticsKind, isCancelling, job, resetForNewUpload]);

  return {
    job,
    phase,
    setPhase,
    error,
    setError,
    statusError,
    isCancelling,
    selectedJobUid,
    setSearchParams,
    acceptJob,
    updateJob,
    resetForNewUpload,
    refreshJob,
    beginNewUpload,
    cancelResult,
  };
}
