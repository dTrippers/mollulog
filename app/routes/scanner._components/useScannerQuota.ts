import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type { OcrJobKind } from "~/domain/ocr";
import { requestScannerJson, toScannerErrorMessage } from "./scanner-client";
import type { ScannerUploadQuota } from "./UploadQuotaMeter";

export type ScannerQuotaKind = "image" | "video";

export function isScannerQuotaEnabled(pathname: string, kind: ScannerQuotaKind): boolean {
  return kind === "image" || pathname.startsWith("/scanner/student");
}

export function getScannerQuotaError({
  imageError,
  videoError,
  showVideoQuota,
}: {
  imageError: string | null;
  videoError: string | null;
  showVideoQuota: boolean;
}): string | null {
  return imageError ?? (showVideoQuota ? videoError : null);
}

export function useScannerQuota(
  jobKind: OcrJobKind,
  setError: Dispatch<SetStateAction<string | null>>,
  enabled = true,
): [ScannerUploadQuota | null, Dispatch<SetStateAction<ScannerUploadQuota | null>>] {
  const [quota, setQuota] = useState<ScannerUploadQuota | null>(null);

  useEffect(() => {
    if (!enabled) {
      setQuota(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    requestScannerJson<{ quota: ScannerUploadQuota }>(`/api/ocr/jobs?jobKind=${jobKind}`)
      .then((response) => {
        if (!cancelled) setQuota(response.quota);
      })
      .catch((error) => {
        if (!cancelled) setError(toScannerErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, jobKind, setError]);

  useEffect(() => {
    if (!enabled || quota?.remaining !== 0 || !quota.nextAvailableAt) return;
    let cancelled = false;
    const delay = Math.max(1000, new Date(quota.nextAvailableAt).getTime() - Date.now() + 1000);
    const timer = window.setTimeout(() => {
      requestScannerJson<{ quota: ScannerUploadQuota }>(`/api/ocr/jobs?jobKind=${jobKind}`)
        .then((response) => {
          if (!cancelled) setQuota(response.quota);
        })
        .catch((error) => {
          if (!cancelled) setError(toScannerErrorMessage(error));
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, jobKind, quota, setError]);

  return [quota, setQuota];
}
