import {
  CACHE_REFRESH_TASK_LABELS,
  CACHE_REFRESH_TASK_NAMES,
  type CacheRefreshJob,
  type CacheRefreshJobStatus,
  type CacheRefreshTaskName,
  type CacheRefreshTaskStatus,
} from "~/domain/cache-refresh";
import { getLogger } from "~/lib/observability.server";
import { getCacheRefreshStatus, startCacheRefresh } from "./cache-refresh-control.server";

// The admin worker has no MolluLog account, so its requests are recorded with this reserved requester.
export const ADMIN_CACHE_REFRESH_REQUESTER_ID = 0;

const SAFE_SERVICE_ERROR = "Cache refresh service request failed";

/** Plain view of a cache refresh job returned to the admin worker over RPC. */
export type CacheRefreshJobSnapshot = {
  uid: string;
  status: CacheRefreshJobStatus;
  completedCount: number;
  totalCount: number;
  tasks: Array<{
    name: CacheRefreshTaskName;
    label: string;
    status: CacheRefreshTaskStatus;
    durationMs: number | null;
  }>;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type StartCacheRefreshSnapshot = {
  job: CacheRefreshJobSnapshot;
  created: boolean;
};

export function toCacheRefreshJobSnapshot(job: CacheRefreshJob): CacheRefreshJobSnapshot {
  return {
    uid: job.uid,
    status: job.status,
    completedCount: job.completedCount,
    totalCount: job.totalCount,
    tasks: CACHE_REFRESH_TASK_NAMES.map((name) => ({
      name,
      label: CACHE_REFRESH_TASK_LABELS[name],
      status: job.taskResults[name].status,
      durationMs: job.taskResults[name].durationMs,
    })),
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
  };
}

export async function startAdminCacheRefresh(env: Env, ctx: ExecutionContext): Promise<StartCacheRefreshSnapshot> {
  try {
    const result = await startCacheRefresh(env, ctx, ADMIN_CACHE_REFRESH_REQUESTER_ID);
    return { job: toCacheRefreshJobSnapshot(result.job), created: result.created };
  } catch (error) {
    getLogger(env, ctx, { job: "cache-refresh", operation: "admin-start" }).error(
      "Failed to start cache refresh",
      error,
    );
    throw new Error(SAFE_SERVICE_ERROR);
  }
}

export async function getAdminCacheRefreshStatus(
  env: Env,
  ctx: ExecutionContext,
  uid: string | null,
): Promise<CacheRefreshJobSnapshot | null> {
  try {
    const job = await getCacheRefreshStatus(env, ctx, uid);
    return job ? toCacheRefreshJobSnapshot(job) : null;
  } catch (error) {
    getLogger(env, ctx, { job: "cache-refresh", operation: "admin-status", jobUid: uid }).error(
      "Failed to load cache refresh status",
      error,
    );
    throw new Error(SAFE_SERVICE_ERROR);
  }
}
