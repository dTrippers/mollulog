import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { notifyScannerJobsChanged } from "./ScannerJobsPanel";
import { requestScannerJson, type ScannerPhase, toScannerErrorMessage } from "./scanner-client";
import { getScannerCancelConfirmation, getScannerNewUploadConfirmation } from "./scanner-messages";

export type ScannerJobLike = {
  uid: string;
  status: string;
  updatedAt: string;
  application?: { status?: string } | null;
};

export type ScannerJobTransition = { phase: ScannerPhase; error?: string | null };

export type ScannerJobUpdate<T extends ScannerJobLike> = T | ((current: T | null) => T | null);

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
  getTransition,
  onJob,
  onReset,
}: {
  getTransition: (job: T) => ScannerJobTransition;
  onJob?: (job: T) => void;
  onReset?: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedJobUid = searchParams.get("job");
  const [job, setJob] = useState<T | null>(null);
  const [phase, setPhase] = useState<ScannerPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  const pollAttemptRef = useRef(0);
  const pendingLoadErrorRef = useRef<string | null>(null);
  const getTransitionRef = useRef(getTransition);
  const onJobRef = useRef(onJob);
  const onResetRef = useRef(onReset);
  getTransitionRef.current = getTransition;
  onJobRef.current = onJob;
  onResetRef.current = onReset;

  const acceptJob = useCallback((next: T) => {
    const transition = getTransitionRef.current(next);
    setJob(next);
    setPhase(transition.phase);
    setError(transition.error ?? null);
    onJobRef.current?.(next);
    notifyScannerJobsChanged({ uid: next.uid, status: next.status, updatedAt: next.updatedAt });
  }, []);

  const updateJob = useCallback((next: ScannerJobUpdate<T>) => {
    setJob((current) => (typeof next === "function" ? next(current) : next));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedJobUid) {
      pollAttemptRef.current = 0;
      setJob(null);
      setPhase("idle");
      setError(pendingLoadErrorRef.current);
      pendingLoadErrorRef.current = null;
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
        const message = toScannerErrorMessage(loadError);
        pendingLoadErrorRef.current = message;
        setSearchParams(removeScannerJobParam, { replace: true });
        setError(message);
      });
    return () => {
      cancelled = true;
    };
  }, [acceptJob, job, selectedJobUid, setSearchParams]);

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
          setError(toScannerErrorMessage(pollError));
          setPollTick((current) => current + 1);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [acceptJob, job, phase, pollTick]);

  const resetForNewUpload = useCallback(
    (confirmUnapplied = true) => {
      if (confirmUnapplied && shouldConfirmScannerReset(job)) {
        if (!window.confirm(getScannerNewUploadConfirmation())) return false;
      }
      setSearchParams(removeScannerJobParam, { replace: true });
      setJob(null);
      setPhase("idle");
      setError(null);
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
      resetForNewUpload(false);
      notifyScannerJobsChanged();
      return true;
    } catch (cancelError) {
      setError(toScannerErrorMessage(cancelError));
      return false;
    } finally {
      setIsCancelling(false);
    }
  }, [isCancelling, job, resetForNewUpload]);

  return {
    job,
    phase,
    setPhase,
    error,
    setError,
    isCancelling,
    selectedJobUid,
    setSearchParams,
    acceptJob,
    updateJob,
    resetForNewUpload,
    cancelResult,
  };
}
