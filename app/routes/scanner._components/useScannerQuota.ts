import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type { OcrJobKind } from "~/domain/ocr";
import { requestScannerJson, toScannerErrorMessage } from "./scanner-client";
import type { ScannerUploadQuota } from "./UploadQuotaMeter";

export function useScannerQuota(
  jobKind: OcrJobKind,
  setError: Dispatch<SetStateAction<string | null>>,
): [ScannerUploadQuota | null, Dispatch<SetStateAction<ScannerUploadQuota | null>>] {
  const [quota, setQuota] = useState<ScannerUploadQuota | null>(null);

  useEffect(() => {
    requestScannerJson<{ quota: ScannerUploadQuota }>(`/api/ocr/jobs?jobKind=${jobKind}`)
      .then((response) => setQuota(response.quota))
      .catch((error) => setError(toScannerErrorMessage(error)));
  }, [jobKind, setError]);

  useEffect(() => {
    if (quota?.remaining !== 0 || !quota.nextAvailableAt) return;
    const delay = Math.max(1000, new Date(quota.nextAvailableAt).getTime() - Date.now() + 1000);
    const timer = window.setTimeout(() => {
      requestScannerJson<{ quota: ScannerUploadQuota }>(`/api/ocr/jobs?jobKind=${jobKind}`)
        .then((response) => setQuota(response.quota))
        .catch((error) => setError(toScannerErrorMessage(error)));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [jobKind, quota, setError]);

  return [quota, setQuota];
}
