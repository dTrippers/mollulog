import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";

/**
 * Async I/O watchdog for surfacing request hangs before the platform cuts them.
 *
 * When a request blocks on an awaited operation that never settles (observed
 * symptom: `wallTime > 30000ms` while `cpuTime < 100ms`, then a CloudFront 30s
 * `canceled` cut), the normal `Server-Timing` header is useless — it is only
 * emitted once the response completes, which never happens. So instead of timing
 * *after* completion, this logs *while the operation is still pending*: a
 * `setTimeout` fires a `console.warn` once the promise has been unsettled past
 * `warnMs`, surfacing the stuck operation in the Workers logs before the cut.
 *
 * Direct console logging (not `getLogger`) is intentional: it must fire reliably
 * mid-hang without a logger/ctx threaded through every cache call site, and it
 * lands in the Workers runtime log where these hangs are being investigated.
 * Pending/settled observations stay at warn level; confirmed timeout/failure
 * callers should log at error level so alert metrics can key off them.
 *
 * Keep this low-volume: prefer operation-level timeouts for expected failures
 * and use watchdog pending/settled logs only around boundaries that can still
 * explain a future whole-request hang.
 */

const DEFAULT_WARN_MS = RUNTIME_TIMEOUTS.watchdogWarnMs.default;
const WATCHDOG_PREFIX = "[io-watchdog]";

let watchdogSequence = 0;
let workerIsolateId: string | undefined;
let workerIsolateStartedAt: number | undefined;

function getWorkerIsolateId() {
  if (workerIsolateId) {
    return workerIsolateId;
  }

  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    workerIsolateId = crypto.randomUUID();
    return workerIsolateId;
  }

  workerIsolateId = `fallback-${Date.now()}-${watchdogSequence}`;
  return workerIsolateId;
}

function getWorkerIsolateStartedAt() {
  workerIsolateStartedAt ??= Date.now();
  return workerIsolateStartedAt;
}

export function getIoWatchdogContext(context: Record<string, unknown> = {}, watchdogId = ++watchdogSequence) {
  return {
    ...context,
    isolateId: getWorkerIsolateId(),
    isolateAgeMs: Date.now() - getWorkerIsolateStartedAt(),
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
