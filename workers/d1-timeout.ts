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
 * background after a timeout; we only stop awaiting it. Applied to both the
 * user-facing `fetch` path and scheduled jobs so background work cannot hold a
 * raw D1 promise indefinitely.
 */

import { getIoWatchdogContext } from "~/lib/io-watchdog";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";

export const DEFAULT_D1_TIMEOUT_MS = RUNTIME_TIMEOUTS.d1.query;

export class D1TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`D1 query timed out after ${timeoutMs}ms`);
    this.name = "D1TimeoutError";
  }
}

type D1DeadlineContext = {
  operation: string;
  queryHash?: string;
  queryPreview?: string;
  batchSize?: number;
};

/** Retrieves the underlying (unwrapped) statement from a wrapped proxy. */
const UNWRAP = Symbol("d1-timeout-unwrap");

// Slow (but not yet timed-out) D1 queries are logged below this threshold so a
// query that hovers under the timeout is still visible while diagnosing hangs.
const D1_SLOW_WARN_MS = RUNTIME_TIMEOUTS.d1.slowWarn;

function normalizeQueryPreview(query: string): string {
  return query
    .replace(/'([^']|'')*'/g, "?")
    .replace(/"([^"]|"")*"/g, "?")
    .replace(/\b\d+(\.\d+)?\b/g, "?")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function hashQuery(query: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < query.length; index += 1) {
    hash ^= query.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createQueryContext(operation: string, query: string): D1DeadlineContext {
  return {
    operation,
    queryHash: hashQuery(query),
    queryPreview: normalizeQueryPreview(query),
  };
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number, context: D1DeadlineContext): Promise<T> {
  const startedAt = Date.now();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.error(
        "[io-watchdog] timeout",
        getIoWatchdogContext({ label: "d1", timeoutMs, elapsedMs: Date.now() - startedAt, ...context }),
      );
      reject(new D1TimeoutError(timeoutMs));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs >= D1_SLOW_WARN_MS) {
          console.warn("[io-watchdog] settled", getIoWatchdogContext({ label: "d1", elapsedMs, ...context }));
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

function wrapStatement(
  statement: D1PreparedStatement,
  timeoutMs: number,
  statementContext: D1DeadlineContext,
): D1PreparedStatement {
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
          wrapStatement((value as (...a: unknown[]) => D1PreparedStatement).apply(target, args), timeoutMs, {
            ...statementContext,
            operation: "prepare.bind",
          });
      }

      if (typeof prop === "string" && STATEMENT_AWAITABLES.has(prop)) {
        return (...args: unknown[]) =>
          withDeadline((value as (...a: unknown[]) => Promise<unknown>).apply(target, args), timeoutMs, {
            ...statementContext,
            operation: `statement.${prop}`,
          });
      }

      return (value as (...a: unknown[]) => unknown).bind(target);
    },
  });
}

function unwrapStatement(statement: D1PreparedStatement): D1PreparedStatement {
  return (statement as { [UNWRAP]?: D1PreparedStatement })[UNWRAP] ?? statement;
}

function wrapSession(session: D1DatabaseSession, timeoutMs: number): D1DatabaseSession {
  return new Proxy(session, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }

      if (prop === "prepare") {
        return (query: string) =>
          wrapStatement(
            (value as (q: string) => D1PreparedStatement).call(target, query),
            timeoutMs,
            createQueryContext("session.prepare", query),
          );
      }

      if (prop === "batch") {
        return (statements: D1PreparedStatement[]) =>
          withDeadline(
            (value as (s: D1PreparedStatement[]) => Promise<unknown>).call(target, statements.map(unwrapStatement)),
            timeoutMs,
            { operation: "session.batch", batchSize: statements.length },
          );
      }

      return (value as (...a: unknown[]) => unknown).bind(target);
    },
  });
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
          wrapStatement(
            (value as (q: string) => D1PreparedStatement).call(target, query),
            timeoutMs,
            createQueryContext("prepare", query),
          );
      }

      // Batch receives the wrapped statements built via the proxied `prepare`/`bind`;
      // unwrap them before handing back to the native runtime.
      if (prop === "batch") {
        return (statements: D1PreparedStatement[]) =>
          withDeadline(
            (value as (s: D1PreparedStatement[]) => Promise<unknown>).call(target, statements.map(unwrapStatement)),
            timeoutMs,
            { operation: "batch", batchSize: statements.length },
          );
      }

      if (prop === "exec") {
        return (query: string) =>
          withDeadline(
            (value as (q: string) => Promise<unknown>).call(target, query),
            timeoutMs,
            createQueryContext("exec", query),
          );
      }

      if (prop === "withSession") {
        return (constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint) =>
          wrapSession(
            (value as (c?: D1SessionBookmark | D1SessionConstraint) => D1DatabaseSession).call(
              target,
              constraintOrBookmark,
            ),
            timeoutMs,
          );
      }

      return (value as (...a: unknown[]) => unknown).bind(target);
    },
  });
}
