import { CACHE_REFRESH_ACTIVE_SLOT_INDEX_NAME } from "~/db/postgres/schema";
import type { CacheRefreshJob, CacheRefreshWorkflowOutput, CacheRefreshWorkflowParams } from "~/domain/cache-refresh";
import { isCacheRefreshJobActive } from "~/domain/cache-refresh";
import { postgresUniqueConstraintName } from "~/lib/db";
import { getLogger } from "~/lib/observability.server";
import {
  completeCacheRefreshJob,
  createCacheRefreshJob,
  failCacheRefreshJob,
  failStaleCacheRefreshJob,
  getActiveCacheRefreshJob,
  getCacheRefreshJob,
  getLatestCacheRefreshJob,
} from "~/models/cache-refresh-job";

const CACHE_REFRESH_JOB_STALE_AFTER_HOURS = 24;

export type StartCacheRefreshResult = {
  job: CacheRefreshJob;
  created: boolean;
};

function isWorkflowOutput(value: unknown): value is CacheRefreshWorkflowOutput {
  if (!value || typeof value !== "object") {
    return false;
  }
  const output = value as Partial<CacheRefreshWorkflowOutput>;
  return (
    (output.status === "completed" || output.status === "partial_failure") &&
    Boolean(output.taskResults) &&
    typeof output.taskResults === "object"
  );
}

async function recoverStaleCacheRefreshJob(
  env: Env,
  job: CacheRefreshJob,
  logger: ReturnType<typeof getLogger>,
): Promise<CacheRefreshJob> {
  try {
    const released = await failStaleCacheRefreshJob(env, job.uid, CACHE_REFRESH_JOB_STALE_AFTER_HOURS);
    if (released) {
      logger.warn("Released stale cache refresh job after reconciliation repeatedly failed", {
        staleAfterHours: CACHE_REFRESH_JOB_STALE_AFTER_HOURS,
      });
      return (await getCacheRefreshJob(env, job.uid)) ?? job;
    }
  } catch (error) {
    logger.error("Failed to release stale cache refresh job", error, {
      staleAfterHours: CACHE_REFRESH_JOB_STALE_AFTER_HOURS,
    });
  }

  return job;
}

async function reconcileCacheRefreshJob(
  env: Env,
  ctx: ExecutionContext,
  job: CacheRefreshJob,
): Promise<CacheRefreshJob> {
  if (!isCacheRefreshJobActive(job.status)) {
    return job;
  }

  const logger = getLogger(env, ctx, { job: "cache-refresh", jobUid: job.uid });
  try {
    const workflowInstance = await env.CACHE_REFRESH_WORKFLOW.get(job.uid);
    const workflowStatus = await workflowInstance.status();
    if (workflowStatus.status === "complete") {
      if (isWorkflowOutput(workflowStatus.output)) {
        await completeCacheRefreshJob(env, job.uid, workflowStatus.output.status, workflowStatus.output.taskResults);
      } else {
        logger.error("Cache refresh workflow completed without a valid output");
        await failCacheRefreshJob(env, job.uid);
      }
    } else if (workflowStatus.status === "errored" || workflowStatus.status === "terminated") {
      logger.error("Cache refresh workflow stopped", workflowStatus.error, { workflowStatus: workflowStatus.status });
      await failCacheRefreshJob(env, job.uid);
    } else if (workflowStatus.status === "unknown") {
      return recoverStaleCacheRefreshJob(env, job, logger);
    }
  } catch (error) {
    logger.error("Failed to reconcile cache refresh workflow status", error);
    return recoverStaleCacheRefreshJob(env, job, logger);
  }

  return (await getCacheRefreshJob(env, job.uid)) ?? job;
}

export async function startCacheRefresh(
  env: Env,
  ctx: ExecutionContext,
  requestedBy: number,
): Promise<StartCacheRefreshResult> {
  const active = await getActiveCacheRefreshJob(env);
  if (active) {
    const reconciled = await reconcileCacheRefreshJob(env, ctx, active);
    if (isCacheRefreshJobActive(reconciled.status)) {
      return { job: reconciled, created: false };
    }
  }

  const uid = crypto.randomUUID();
  let job: CacheRefreshJob;
  try {
    job = await createCacheRefreshJob(env, { uid, requestedBy });
  } catch (error) {
    if (postgresUniqueConstraintName(error) === CACHE_REFRESH_ACTIVE_SLOT_INDEX_NAME) {
      const racedJob = await getActiveCacheRefreshJob(env);
      if (racedJob) {
        return { job: racedJob, created: false };
      }
    }
    throw error;
  }

  try {
    await env.CACHE_REFRESH_WORKFLOW.create({
      id: uid,
      params: { requestedBy } satisfies CacheRefreshWorkflowParams,
      retention: { successRetention: "7 days", errorRetention: "7 days" },
    });
  } catch (error) {
    await failCacheRefreshJob(env, uid);
    getLogger(env, ctx, { job: "cache-refresh", jobUid: uid }).error("Failed to create cache refresh workflow", error);
    throw error;
  }

  return { job, created: true };
}

export async function getCacheRefreshStatus(
  env: Env,
  ctx: ExecutionContext,
  uid?: string | null,
): Promise<CacheRefreshJob | null> {
  const job = uid ? await getCacheRefreshJob(env, uid) : await getLatestCacheRefreshJob(env);
  return job ? reconcileCacheRefreshJob(env, ctx, job) : null;
}
