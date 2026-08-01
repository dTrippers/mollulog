import { data } from "react-router";
import { COMMUNITY_WRITE_FREEZE_KEY, COMMUNITY_WRITE_MAINTENANCE_RESULT } from "~/domain/community-write-freeze";
import { getLogger } from "~/lib/observability.server";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { withTimeout } from "~/lib/with-timeout";

type CommunityWriteFreezeLogger = Pick<ReturnType<typeof getLogger>, "error">;

export type CommunityWriteFreezeOptions = {
  ctx?: ExecutionContext;
  logger?: CommunityWriteFreezeLogger;
  operation?: string;
};

export type CommunityWriteFreezeDecision = {
  frozen: boolean;
  readFailed: boolean;
};

/**
 * Reads the operational freeze switch once at a write boundary.
 *
 * A missing key keeps the existing write path unchanged. A KV failure is
 * deliberately fail-closed so a maintenance window cannot accidentally leak
 * writes while the switch is unavailable.
 */
export async function getCommunityWriteFreezeDecision(
  env: Env,
  options: CommunityWriteFreezeOptions = {},
): Promise<CommunityWriteFreezeDecision> {
  try {
    const value = await withTimeout(
      env.KV_CACHE.get(COMMUNITY_WRITE_FREEZE_KEY),
      RUNTIME_TIMEOUTS.kv.operation,
      "community-write-freeze.kv.get",
    );
    return { frozen: value !== null, readFailed: false };
  } catch (error) {
    const logger =
      options.logger ??
      getLogger(env, options.ctx, {
        operation: options.operation ?? "community-write-freeze",
      });
    logger.error("Community write freeze KV read failed; failing closed", error, {
      key: COMMUNITY_WRITE_FREEZE_KEY,
      operation: options.operation ?? "community-write-freeze",
    });
    return { frozen: true, readFailed: true };
  }
}

export async function isCommunityWriteFrozen(env: Env, options: CommunityWriteFreezeOptions = {}): Promise<boolean> {
  return (await getCommunityWriteFreezeDecision(env, options)).frozen;
}

export function communityWriteMaintenanceResponse() {
  return data(COMMUNITY_WRITE_MAINTENANCE_RESULT, { status: 503 });
}
