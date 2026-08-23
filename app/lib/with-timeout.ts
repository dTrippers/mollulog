/**
 * Rejects if `promise` does not settle within `timeoutMs`.
 *
 * Cloudflare bindings such as KV occasionally stop responding without ever
 * rejecting. Because the underlying promise never settles, awaiting it keeps a
 * request (or a cached in-flight promise) hung until CloudFront cuts the origin
 * at its 30s response timeout. Bounding the await turns an indefinite hang into a
 * fast rejection that callers can recover from (treat as a cache miss, serve
 * stale, skip the write, etc.).
 *
 * Note: this only stops awaiting — there is no cancellation, so the underlying
 * operation may still complete in the background.
 */

export class TimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = "operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
