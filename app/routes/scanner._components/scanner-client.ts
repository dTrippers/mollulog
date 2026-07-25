import type { ScannerUploadQuota } from "./UploadQuotaMeter";

export type ScannerPhase = "idle" | "uploading" | "waiting" | "review" | "applying" | "applied";

export async function requestScannerJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as ({ error?: string; quota?: ScannerUploadQuota } & T) | null;
  if (!response.ok) {
    throw new ScannerApiRequestError(body?.error ?? "요청을 처리하지 못했어요", body?.quota);
  }
  return body as T;
}

export class ScannerApiRequestError extends Error {
  constructor(
    message: string,
    readonly quota?: ScannerUploadQuota,
  ) {
    super(message);
    this.name = "ScannerApiRequestError";
  }
}

export function toScannerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했어요";
}

export function formatScannerBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
