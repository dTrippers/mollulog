import { data } from "react-router";
import {
  PYROXENE_CUTOVER_MAINTENANCE_KEY,
  PYROXENE_MAINTENANCE_RETRY_AFTER_SECONDS,
  pyroxeneMaintenanceResult,
} from "~/domain/pyroxene-cutover";
import { getLogger } from "~/lib/observability.server";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { withTimeout } from "~/lib/with-timeout";

export type { PyroxeneMaintenanceResult } from "~/domain/pyroxene-cutover";
export {
  isPyroxeneMaintenanceResult,
  pyroxeneMaintenanceMessage,
  pyroxeneMaintenanceResult,
} from "~/domain/pyroxene-cutover";

type PyroxeneMaintenanceLogger = Pick<ReturnType<typeof getLogger>, "error">;

export type PyroxeneMaintenanceOptions = {
  ctx?: ExecutionContext;
  logger?: PyroxeneMaintenanceLogger;
  operation?: string;
};

async function isPyroxeneWriteFrozen(
  env: Pick<Env, "KV_CACHE">,
  options: PyroxeneMaintenanceOptions = {},
): Promise<boolean> {
  try {
    const value = await withTimeout(
      env.KV_CACHE.get(PYROXENE_CUTOVER_MAINTENANCE_KEY),
      RUNTIME_TIMEOUTS.kv.operation,
      "pyroxene-cutover.kv.get",
    );
    return value !== null;
  } catch (error) {
    const operation = options.operation ?? "pyroxene-cutover";
    const logger = options.logger ?? getLogger(env as Env, options.ctx, { operation });
    logger.error("Pyroxene maintenance KV read failed; failing closed", error, {
      key: PYROXENE_CUTOVER_MAINTENANCE_KEY,
      operation,
    });
    return true;
  }
}

/** Returns a typed 503 response only for Pyroxene mutations during maintenance. */
export async function pyroxeneMaintenanceActionResult(env: Env, options: PyroxeneMaintenanceOptions = {}) {
  if (!(await isPyroxeneWriteFrozen(env, options))) return null;
  return data(pyroxeneMaintenanceResult, {
    status: 503,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(PYROXENE_MAINTENANCE_RETRY_AFTER_SECONDS),
      "Cache-Control": "no-store",
    },
  });
}
