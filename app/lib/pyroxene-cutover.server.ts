import { data } from "react-router";
import {
  D1_CUTOVER_MAINTENANCE_KEY,
  D1_MAINTENANCE_RETRY_AFTER_SECONDS,
  d1MaintenanceResult,
} from "~/domain/pyroxene-cutover";
import { getLogger } from "~/lib/observability.server";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { withTimeout } from "~/lib/with-timeout";

export type { D1MaintenanceResult } from "~/domain/pyroxene-cutover";
export {
  d1MaintenanceMessage,
  d1MaintenanceResult,
  isD1MaintenanceResult,
} from "~/domain/pyroxene-cutover";

type D1MaintenanceLogger = Pick<ReturnType<typeof getLogger>, "error">;

export type D1MaintenanceOptions = {
  ctx?: ExecutionContext;
  logger?: D1MaintenanceLogger;
  operation?: string;
};

function isMaintenanceValueActive(value: string | null): boolean {
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

async function isD1WriteFrozen(
  env: Pick<Env, "KV_CACHE">,
  options: D1MaintenanceOptions = {},
): Promise<boolean> {
  try {
    const value = await withTimeout(
      env.KV_CACHE.get(D1_CUTOVER_MAINTENANCE_KEY),
      RUNTIME_TIMEOUTS.kv.operation,
      "d1-cutover.kv.get",
    );
    return isMaintenanceValueActive(value);
  } catch (error) {
    const operation = options.operation ?? "d1-cutover";
    const logger = options.logger ?? getLogger(env as Env, options.ctx, { operation });
    logger.error("D1 maintenance KV read failed; failing closed", error, {
      key: D1_CUTOVER_MAINTENANCE_KEY,
      operation,
    });
    return true;
  }
}

/** Returns a typed 503 response for guarded D1 mutations during maintenance. */
export async function d1MaintenanceActionResult(env: Env, options: D1MaintenanceOptions = {}) {
  if (!(await isD1WriteFrozen(env, options))) return null;
  return data(d1MaintenanceResult, {
    status: 503,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(D1_MAINTENANCE_RETRY_AFTER_SECONDS),
      "Cache-Control": "no-store",
    },
  });
}
