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

export async function uploadScannerFile({
  url,
  file,
  contentType,
  onProgress,
  retries = 1,
}: {
  url: string;
  file: File;
  contentType: string;
  onProgress?: (uploadedBytes: number) => void;
  retries?: number;
}): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await uploadScannerFileOnce(url, file, contentType, onProgress);
      return;
    } catch (error) {
      if (!(error instanceof ScannerUploadError) || !error.retryable || attempt === retries) throw error;
      onProgress?.(0);
    }
  }
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

function uploadScannerFileOnce(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (uploadedBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(file.size);
        resolve();
        return;
      }
      reject(new ScannerUploadError(request.status >= 500 || request.status === 429));
    };
    request.onerror = () => reject(new ScannerUploadError(true));
    request.onabort = () => reject(new ScannerUploadError(false));
    request.send(file);
  });
}

class ScannerUploadError extends Error {
  constructor(readonly retryable: boolean) {
    super("파일 업로드에 실패했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    this.name = "ScannerUploadError";
  }
}
