/**
 * Per-query timeout wrapper for the D1 binding.
 *
 * D1 occasionally stops responding to a query without ever rejecting. Because
 * the underlying promise never settles, the worker keeps the request (or a
 * deferred response stream) open until CloudFront cuts it at its 30s origin
 * response timeout (`outcome: canceled`, `wallTimeMs ≈ 30000`).
 *
 * Wrapping `env.DB` here bounds every D1 query in one place — without touching
 * the ~247 `drizzle(env.DB)` call sites. A timed-out query throws instead of
 * hanging, which lets existing fallbacks run (stale cache in `fetchCached`,
 * `.catch` rails in loaders, or the route error boundary) and frees the worker
 * well before the CloudFront deadline.
 *
 * Note: D1 has no cancellation API, so the underlying query keeps running in the
 * background after a timeout; we only stop awaiting it. Applied to the user-facing
 * `fetch` path only — the `scheduled` (cron) path keeps the raw binding.
 */

import { getIoWatchdogContext } from "~/lib/io-watchdog";

export const DEFAULT_D1_TIMEOUT_MS = 2000;

export class D1TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`D1 query timed out after ${timeoutMs}ms`);
    this.name = "D1TimeoutError";
  }
}

/** Retrieves the underlying (unwrapped) statement from a wrapped proxy. */
const UNWRAP = Symbol("d1-timeout-unwrap");

// Slow (but not yet timed-out) D1 queries are logged below this threshold so a
// query that hovers under the timeout is still visible while diagnosing hangs.
const D1_SLOW_WARN_MS = 1000;

function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const startedAt = Date.now();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new D1TimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs >= D1_SLOW_WARN_MS) {
          console.warn("[io-watchdog] settled", getIoWatchdogContext({ label: "d1", elapsedMs }));
        }
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Statement methods that return a result promise to bound.
const STATEMENT_AWAITABLES = new Set(["first", "run", "all", "raw"]);

function wrapStatement(statement: D1PreparedStatement, timeoutMs: number): D1PreparedStatement {
  return new Proxy(statement, {
    get(target, prop, receiver) {
      if (prop === UNWRAP) {
        return target;
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }

      // `bind` returns a new, chainable statement — re-wrap so its terminal call is bounded too.
      if (prop === "bind") {
        return (...args: unknown[]) =>
          wrapStatement((value as (...a: unknown[]) => D1PreparedStatement).apply(target, args), timeoutMs);
      }

      if (typeof prop === "string" && STATEMENT_AWAITABLES.has(prop)) {
        return (...args: unknown[]) =>
          withDeadline((value as (...a: unknown[]) => Promise<unknown>).apply(target, args), timeoutMs);
      }

      return (value as (...a: unknown[]) => unknown).bind(target);
    },
  });
}

function unwrapStatement(statement: D1PreparedStatement): D1PreparedStatement {
  return (statement as { [UNWRAP]?: D1PreparedStatement })[UNWRAP] ?? statement;
}

/**
 * Wraps a D1 binding so every query rejects after `timeoutMs` instead of hanging.
 */
export function withD1Timeout(db: D1Database, timeoutMs: number = DEFAULT_D1_TIMEOUT_MS): D1Database {
  return new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }

      if (prop === "prepare") {
        return (query: string) =>
          wrapStatement((value as (q: string) => D1PreparedStatement).call(target, query), timeoutMs);
      }

      // Batch receives the wrapped statements built via the proxied `prepare`/`bind`;
      // unwrap them before handing back to the native runtime.
      if (prop === "batch") {
        return (statements: D1PreparedStatement[]) =>
          withDeadline(
            (value as (s: D1PreparedStatement[]) => Promise<unknown>).call(target, statements.map(unwrapStatement)),
            timeoutMs,
          );
      }

      if (prop === "exec") {
        return (query: string) =>
          withDeadline((value as (q: string) => Promise<unknown>).call(target, query), timeoutMs);
      }

      return (value as (...a: unknown[]) => unknown).bind(target);
    },
  });
}
