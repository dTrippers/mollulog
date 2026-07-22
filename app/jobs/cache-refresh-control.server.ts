import type { CacheRefreshJob, CacheRefreshWorkflowOutput, CacheRefreshWorkflowParams } from "~/domain/cache-refresh";
import { isCacheRefreshJobActive } from "~/domain/cache-refresh";
import { isUniqueConstraintError } from "~/lib/db";
import { getLogger } from "~/lib/observability.server";
import {
  completeCacheRefreshJob,
  createCacheRefreshJob,
  failCacheRefreshJob,
  getActiveCacheRefreshJob,
  getCacheRefreshJob,
  getLatestCacheRefreshJob,
} from "~/models/cache-refresh-job";

type CacheRefreshControlEnv = Pick<Env, "CACHE_REFRESH_WORKFLOW" | "DB"> & Env;

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

async function reconcileCacheRefreshJob(
  env: CacheRefreshControlEnv,
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
    }
  } catch (error) {
    logger.error("Failed to reconcile cache refresh workflow status", error);
    return job;
  }

  return (await getCacheRefreshJob(env, job.uid)) ?? job;
}

export async function startCacheRefresh(
  env: CacheRefreshControlEnv,
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
    const unique = error instanceof Error ? isUniqueConstraintError(error) : null;
    if (unique?.table === "cache_refresh_jobs" && unique.column === "activeSlot") {
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
  env: CacheRefreshControlEnv,
  ctx: ExecutionContext,
  uid?: string | null,
): Promise<CacheRefreshJob | null> {
  const job = uid ? await getCacheRefreshJob(env, uid) : await getLatestCacheRefreshJob(env);
  return job ? reconcileCacheRefreshJob(env, ctx, job) : null;
}
