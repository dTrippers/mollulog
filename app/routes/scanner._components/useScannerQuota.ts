import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import type { OcrJobKind } from "~/domain/ocr";
import { requestScannerJson } from "./scanner-client";
import type { ScannerUploadQuota } from "./UploadQuotaMeter";

export type ScannerQuotaDisplayState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "exhausted"; quota: ScannerUploadQuota }
  | { kind: "low"; quota: ScannerUploadQuota }
  | { kind: "normal"; quota: ScannerUploadQuota };

// Low means the remaining amount is at most a sixth of the limit, and at least one.
export function getScannerQuotaLowThreshold(limit: number): number {
  return Math.max(1, Math.floor(limit / 6));
}

// The quota is shown for both tabs and both kinds. Loading and failure are separate states, so neither looks like an empty quota.
// A failed read wins over an older quota: a stale "0 left" would keep uploads blocked with no way to retry.
export function getScannerQuotaDisplayState(
  quota: ScannerUploadQuota | null,
  hasError: boolean,
): ScannerQuotaDisplayState {
  if (hasError) return { kind: "error" };
  if (!quota) return { kind: "loading" };
  if (quota.remaining === 0) return { kind: "exhausted", quota };
  if (quota.remaining <= getScannerQuotaLowThreshold(quota.limit)) return { kind: "low", quota };
  return { kind: "normal", quota };
}

export function useScannerQuota(jobKind: OcrJobKind): {
  quota: ScannerUploadQuota | null;
  setQuota: Dispatch<SetStateAction<ScannerUploadQuota | null>>;
  hasError: boolean;
  retry: () => void;
} {
  const [quota, setQuota] = useState<ScannerUploadQuota | null>(null);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt restarts the read after a retry.
  useEffect(() => {
    let cancelled = false;
    setHasError(false);
    requestScannerJson<{ quota: ScannerUploadQuota }>(`/api/ocr/jobs?jobKind=${jobKind}`)
      .then((response) => {
        if (!cancelled) setQuota(response.quota);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [jobKind, attempt]);

  // When the quota is exhausted, re-read it at the next available time.
  useEffect(() => {
    if (quota?.remaining !== 0 || !quota.nextAvailableAt) return;
    let cancelled = false;
    const delay = Math.max(1000, new Date(quota.nextAvailableAt).getTime() - Date.now() + 1000);
    const timer = window.setTimeout(() => {
      requestScannerJson<{ quota: ScannerUploadQuota }>(`/api/ocr/jobs?jobKind=${jobKind}`)
        .then((response) => {
          if (cancelled) return;
          setQuota(response.quota);
          setHasError(false);
        })
        .catch(() => {
          if (!cancelled) setHasError(true);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [jobKind, quota]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  return { quota, setQuota, hasError, retry };
}
