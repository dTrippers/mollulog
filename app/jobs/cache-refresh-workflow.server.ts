import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from "cloudflare:workers";
import {
  type CacheRefreshJobStatus,
  type CacheRefreshTaskName,
  type CacheRefreshTaskResult,
  type CacheRefreshTaskResults,
  type CacheRefreshWorkflowOutput,
  type CacheRefreshWorkflowParams,
  createPendingCacheRefreshTaskResults,
  ROUTE_CACHE_REFRESH_TASK_NAMES,
  SOURCE_CACHE_REFRESH_TASK_NAMES,
} from "~/domain/cache-refresh";
import { getLogger } from "~/lib/observability.server";
import {
  completeCacheRefreshJob,
  markCacheRefreshJobRunning,
  markCacheRefreshTaskRunning,
  recordCacheRefreshTaskResult,
  recordSkippedCacheRefreshTasks,
} from "~/models/cache-refresh-job";
import { runCacheRefreshTask } from "./cache-refresh";

const STATUS_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 3, delay: "1 second", backoff: "linear" },
  timeout: "30 seconds",
};

const TASK_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 0, delay: 0 },
  timeout: "5 minutes",
};

const SAFE_TASK_ERROR = "작업을 완료하지 못했어요. 로그에서 job ID를 확인해주세요.";

async function runStatusStep(
  step: WorkflowStep,
  name: string,
  logger: ReturnType<typeof getLogger>,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await step.do(name, STATUS_STEP_CONFIG, async () => {
      await operation();
      return true;
    });
  } catch (error) {
    logger.error("Failed to persist cache refresh progress", error, { workflowStep: name });
  }
}

async function runTaskStep(
  env: Env,
  ctx: ExecutionContext,
  step: WorkflowStep,
  jobUid: string,
  taskName: CacheRefreshTaskName,
  logger: ReturnType<typeof getLogger>,
): Promise<CacheRefreshTaskResult> {
  await runStatusStep(step, `status running ${taskName}`, logger, () =>
    markCacheRefreshTaskRunning(env, jobUid, taskName),
  );

  let result: CacheRefreshTaskResult;
  try {
    result = await step.do(`refresh ${taskName}`, TASK_STEP_CONFIG, () =>
      runCacheRefreshTask(env, ctx, jobUid, taskName),
    );
  } catch (error) {
    logger.error("Cache refresh workflow task step failed", error, { taskName });
    result = { status: "failed", durationMs: null, error: SAFE_TASK_ERROR };
  }

  await runStatusStep(step, `status result ${taskName}`, logger, () =>
    recordCacheRefreshTaskResult(env, jobUid, taskName, result).then(() => undefined),
  );
  return result;
}

export async function runCacheRefreshWorkflow(
  env: Env,
  ctx: ExecutionContext,
  event: Readonly<WorkflowEvent<CacheRefreshWorkflowParams>>,
  step: WorkflowStep,
): Promise<CacheRefreshWorkflowOutput> {
  const jobUid = event.instanceId;
  const logger = getLogger(env, ctx, { job: "cache-refresh", jobUid, requestedBy: event.payload.requestedBy });
  let taskResults: CacheRefreshTaskResults = createPendingCacheRefreshTaskResults();

  await runStatusStep(step, "status job running", logger, () => markCacheRefreshJobRunning(env, jobUid));

  let sourceFailed = false;
  for (const taskName of SOURCE_CACHE_REFRESH_TASK_NAMES) {
    const result = await runTaskStep(env, ctx, step, jobUid, taskName, logger);
    taskResults = { ...taskResults, [taskName]: result };
    sourceFailed ||= result.status === "failed";
  }

  if (sourceFailed) {
    for (const taskName of ROUTE_CACHE_REFRESH_TASK_NAMES) {
      taskResults = {
        ...taskResults,
        [taskName]: { status: "skipped", durationMs: null, error: null },
      };
    }
    await runStatusStep(step, "status route tasks skipped", logger, () =>
      recordSkippedCacheRefreshTasks(env, jobUid, ROUTE_CACHE_REFRESH_TASK_NAMES).then(() => undefined),
    );
  } else {
    for (const taskName of ROUTE_CACHE_REFRESH_TASK_NAMES) {
      const result = await runTaskStep(env, ctx, step, jobUid, taskName, logger);
      taskResults = { ...taskResults, [taskName]: result };
    }
  }

  const status: Extract<CacheRefreshJobStatus, "completed" | "partial_failure"> = Object.values(taskResults).some(
    (result) => result.status === "failed",
  )
    ? "partial_failure"
    : "completed";

  await runStatusStep(step, "status job complete", logger, () =>
    completeCacheRefreshJob(env, jobUid, status, taskResults),
  );
  logger.info("Cache refresh workflow completed", { status });
  return { status, taskResults };
}
