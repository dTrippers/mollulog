import { data } from "react-router";
import {
  IDENTITY_CUTOVER_MAINTENANCE_KEY,
  IDENTITY_MAINTENANCE_RETRY_AFTER_SECONDS,
  identityMaintenanceResult,
} from "~/domain/identity-cutover";
import { getLogger } from "~/lib/observability.server";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { withTimeout } from "~/lib/with-timeout";

export type { IdentityMaintenanceResult } from "~/domain/identity-cutover";
export {
  identityMaintenanceMessage,
  identityMaintenanceResult,
  isIdentityMaintenanceResult,
} from "~/domain/identity-cutover";

type IdentityMaintenanceLogger = Pick<ReturnType<typeof getLogger>, "error">;

export type IdentityMaintenanceOptions = {
  ctx?: ExecutionContext;
  logger?: IdentityMaintenanceLogger;
  operation?: string;
};

async function isIdentityWriteFrozen(
  env: Pick<Env, "KV_CACHE">,
  options: IdentityMaintenanceOptions = {},
): Promise<boolean> {
  try {
    const value = await withTimeout(
      env.KV_CACHE.get(IDENTITY_CUTOVER_MAINTENANCE_KEY),
      RUNTIME_TIMEOUTS.kv.operation,
      "identity-cutover.kv.get",
    );
    return value !== null;
  } catch (error) {
    const operation = options.operation ?? "identity-cutover";
    const logger = options.logger ?? getLogger(env as Env, options.ctx, { operation });
    logger.error("Identity maintenance KV read failed; failing closed", error, {
      key: IDENTITY_CUTOVER_MAINTENANCE_KEY,
      operation,
    });
    return true;
  }
}

/** Returns a typed 503 response only for identity mutations during maintenance. */
export async function identityMaintenanceActionResult(env: Env, options: IdentityMaintenanceOptions = {}) {
  if (!(await isIdentityWriteFrozen(env, options))) return null;
  return data(identityMaintenanceResult, {
    status: 503,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(IDENTITY_MAINTENANCE_RETRY_AFTER_SECONDS),
      "Cache-Control": "no-store",
    },
  });
}
