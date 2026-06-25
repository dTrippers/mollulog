import { getIoWatchdogContext, watchIo } from "~/lib/io-watchdog";
import { isTimeoutError, TimeoutError, withTimeout } from "~/lib/with-timeout";

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string,
  context: Record<string, unknown> = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new TimeoutError(label, timeoutMs)), timeoutMs);
  const signal = mergeAbortSignals(init.signal, controller.signal);

  try {
    return await watchIo(label, fetch(input, { ...init, signal }), context);
  } catch (error) {
    if (isTimeoutError(error) || controller.signal.aborted) {
      console.error("[io-watchdog] timeout", getIoWatchdogContext({ label, timeoutMs, ...context }));
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readBodyWithTimeout<T>(
  read: () => Promise<T>,
  timeoutMs: number,
  label: string,
  context: Record<string, unknown> = {},
): Promise<T> {
  try {
    return await watchIo(label, withTimeout(read(), timeoutMs, label), context);
  } catch (error) {
    if (isTimeoutError(error)) {
      console.error("[io-watchdog] timeout", getIoWatchdogContext({ label, timeoutMs, ...context }));
    }
    throw error;
  }
}

function mergeAbortSignals(left: AbortSignal | null | undefined, right: AbortSignal): AbortSignal {
  if (!left) {
    return right;
  }

  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    controller.abort(signal.reason);
  };

  if (left.aborted) {
    abort(left);
  } else if (right.aborted) {
    abort(right);
  } else {
    left.addEventListener("abort", () => abort(left), { once: true });
    right.addEventListener("abort", () => abort(right), { once: true });
  }

  return controller.signal;
}
