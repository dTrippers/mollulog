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
  type SourceCacheRefreshTaskName,
} from "~/domain/cache-refresh";
import { type CacheRefreshScope, createCacheRefreshScope } from "~/lib/cache/refresh-scope";
import { mapWithConcurrencyLimit } from "~/lib/concurrency";
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

/** Tasks running at once within a phase; bounds the concurrent load on BAQL and PostgreSQL. */
const TASK_CONCURRENCY = 4;

/**
 * Source tasks grouped into phases that run one after another. Tasks in a phase are independent;
 * the second phase reads the student roster and the event/timeline sources refreshed by the first.
 */
export const SOURCE_CACHE_REFRESH_TASK_PHASES: readonly (readonly SourceCacheRefreshTaskName[])[] = [
  [
    "syncYoutubeCommunityPosts",
    "syncRawStudents",
    "warmRecruitmentCache",
    "warmRaidCache",
    "getMainStories",
    "getAllStudentsFavoriteItems",
    "syncAllTimelineContentsMeta",
    "syncEventContentsList",
    "getItemCatalogResources",
    "getFurnitureCatalogSource",
    "getCampaignFarmingStages",
  ],
  ["warmStudentSkillItems", "warmStudentGearData", "warmActiveUpcomingEventContent"],
];

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
  scope: CacheRefreshScope,
  logger: ReturnType<typeof getLogger>,
): Promise<CacheRefreshTaskResult> {
  await runStatusStep(step, `status running ${taskName}`, logger, () =>
    markCacheRefreshTaskRunning(env, jobUid, taskName),
  );

  let result: CacheRefreshTaskResult;
  try {
    result = await step.do(`refresh ${taskName}`, TASK_STEP_CONFIG, () =>
      runCacheRefreshTask(env, ctx, jobUid, taskName, scope),
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

async function runTaskSteps(
  env: Env,
  ctx: ExecutionContext,
  step: WorkflowStep,
  jobUid: string,
  taskNames: readonly CacheRefreshTaskName[],
  scope: CacheRefreshScope,
  logger: ReturnType<typeof getLogger>,
): Promise<Partial<CacheRefreshTaskResults>> {
  const results = await mapWithConcurrencyLimit(taskNames, TASK_CONCURRENCY, (taskName) =>
    runTaskStep(env, ctx, step, jobUid, taskName, scope, logger),
  );
  return Object.fromEntries(taskNames.map((taskName, index) => [taskName, results[index]]));
}

export async function runCacheRefreshWorkflow(
  env: Env,
  ctx: ExecutionContext,
  event: Readonly<WorkflowEvent<CacheRefreshWorkflowParams>>,
  step: WorkflowStep,
): Promise<CacheRefreshWorkflowOutput> {
  const jobUid = event.instanceId;
  const logger = getLogger(env, ctx, { job: "cache-refresh", jobUid, requestedBy: event.payload.requestedBy });
  // Shared by every task of this run; a restarted run starts a fresh scope and only re-runs unfinished steps.
  const scope = createCacheRefreshScope();
  let taskResults: CacheRefreshTaskResults = createPendingCacheRefreshTaskResults();

  await runStatusStep(step, "status job running", logger, () => markCacheRefreshJobRunning(env, jobUid));

  for (const phase of SOURCE_CACHE_REFRESH_TASK_PHASES) {
    taskResults = { ...taskResults, ...(await runTaskSteps(env, ctx, step, jobUid, phase, scope, logger)) };
  }
  const sourceFailed = Object.values(taskResults).some((result) => result.status === "failed");

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
    taskResults = {
      ...taskResults,
      ...(await runTaskSteps(env, ctx, step, jobUid, ROUTE_CACHE_REFRESH_TASK_NAMES, scope, logger)),
    };
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
