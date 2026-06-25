/**
 * Async I/O watchdog for diagnosing request hangs.
 *
 * When a request blocks on an awaited operation that never settles (observed
 * symptom: `wallTime > 30000ms` while `cpuTime < 100ms`, then a CloudFront 30s
 * `canceled` cut), the normal `Server-Timing` header is useless — it is only
 * emitted once the response completes, which never happens. So instead of timing
 * *after* completion, this logs *while the operation is still pending*: a
 * `setTimeout` fires a `console.warn` once the promise has been unsettled past
 * `warnMs`, surfacing the stuck operation in the Workers logs before the cut.
 *
 * `console.warn` (not `getLogger`) is intentional: it must fire reliably mid-hang
 * without a logger/ctx threaded through every cache call site, and it lands in the
 * Workers runtime log where these hangs are being investigated. Same `setTimeout`
 * mechanism the D1 timeout wrapper already relies on in production.
 *
 * This is diagnostic instrumentation — safe to remove once the culprit is found.
 */

const DEFAULT_WARN_MS = 3000;
const WATCHDOG_PREFIX = "[io-watchdog]";
const WORKER_ISOLATE_ID = getWorkerIsolateId();
const WORKER_ISOLATE_STARTED_AT = Date.now();

let watchdogSequence = 0;

function getWorkerIsolateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getIoWatchdogContext(context: Record<string, unknown> = {}, watchdogId = ++watchdogSequence) {
  return {
    ...context,
    isolateId: WORKER_ISOLATE_ID,
    isolateAgeMs: Date.now() - WORKER_ISOLATE_STARTED_AT,
    watchdogId,
  };
}

/**
 * Passes `promise` through unchanged while logging if it stays pending past
 * `warnMs`, and again with the final duration if it eventually settles after
 * having warned. A `pending` log with no matching `settled` log means the
 * operation never resolved — that is the hang.
 */
export function watchIo<T>(
  label: string,
  promise: Promise<T>,
  context: Record<string, unknown> = {},
  warnMs: number = DEFAULT_WARN_MS,
): Promise<T> {
  const startedAt = Date.now();
  const watchdogId = ++watchdogSequence;
  let warned = false;

  const timer = setTimeout(() => {
    warned = true;
    console.warn(`${WATCHDOG_PREFIX} pending`, getIoWatchdogContext({ label, pendingMs: warnMs, ...context }, watchdogId));
  }, warnMs);

  const finalize = () => {
    clearTimeout(timer);
    if (warned) {
      console.warn(
        `${WATCHDOG_PREFIX} settled`,
        getIoWatchdogContext({ label, elapsedMs: Date.now() - startedAt, ...context }, watchdogId),
      );
    }
  };

  return promise.then(
    (value) => {
      finalize();
      return value;
    },
    (error) => {
      finalize();
      throw error;
    },
  );
}
