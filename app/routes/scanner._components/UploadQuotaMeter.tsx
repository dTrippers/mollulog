// The quota shape the scanner reads from `/api/ocr/jobs`. The meter is rendered by features/scanner/ScannerQuota.
export type ScannerUploadQuota = {
  limit: number;
  used: number;
  remaining: number;
  nextAvailableAt: string | null;
};
