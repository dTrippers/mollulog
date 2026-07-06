import { cacheKey, cacheQuery, isKvCacheWindowFresh, markKvCacheWindow } from "~/lib/cache";
import { mapWithConcurrencyLimit } from "~/lib/concurrency";
import { getIoWatchdogContext, watchIo } from "~/lib/io-watchdog";
import { getLogger } from "~/lib/observability.server";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { isTimeoutError, withTimeout } from "~/lib/with-timeout";
import { syncEventContentsList } from "~/models/event-content";
import { getStudentGearData } from "~/models/growth-resource";
import { getItemCatalogResources } from "~/models/item-catalog";
import { getMainStories } from "~/models/main-story";
import { warmRaidCache } from "~/models/raid";
import { warmRecruitmentCache } from "~/models/recruitment";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import { getCampaignFarmingStages } from "~/models/stage";
import { getAllStudents, getStudentSkillItemsBatch, syncRawStudents } from "~/models/student";
import { syncAllTimelineContentsMeta } from "~/models/timeline-content";
import { syncYoutubeCommunityPosts } from "~/models/youtube";
import { warmActiveUpcomingEventContent } from "~/views/events";

type ScheduledJobName = "syncYoutubeCommunityPosts" | "refreshSourceCaches";

type ScheduledJob = {
  name: ScheduledJobName;
  run: () => Promise<unknown>;
};

type ScheduledRunContext = {
  cron?: string;
  scheduledTime?: number;
};

const SCHEDULED_JOB_TIMEOUT_MS = RUNTIME_TIMEOUTS.scheduled.job;
const SOURCE_REFRESH_CONCURRENCY = 1;
const SOURCE_WARM_WINDOW_SECONDS = 60 * 60;
const SOURCE_WARM_MARKER_KEY = cacheKey("source", "cron-source-warm", 1, cacheQuery({ name: "students-events" }));
const SOURCE_FORCED_REFRESH_WINDOW_SECONDS = 60 * 60;
const SOURCE_FORCED_REFRESH_MARKER_KEY = cacheKey(
  "source",
  "cron-source-refresh",
  1,
  cacheQuery({ name: "baql-sources" }),
);

async function runSourceRefreshTasks(tasks: Array<() => Promise<unknown>>, errorMessage: string): Promise<void> {
  const errors: unknown[] = [];
  await mapWithConcurrencyLimit(tasks, SOURCE_REFRESH_CONCURRENCY, async (run) => {
    try {
      await run();
    } catch (error) {
      errors.push(error);
    }
  });

  if (errors.length > 0) {
    throw new AggregateError(errors, errorMessage);
  }
}

async function warmStudentSourceCaches(env: Env, forceRefresh = false): Promise<void> {
  const studentUids = (await getAllStudents(env, true)).map((student) => student.uid);
  await runSourceRefreshTasks(
    [
      () => getStudentSkillItemsBatch(env, studentUids, forceRefresh),
      () => getStudentGearData(env, studentUids, forceRefresh),
    ],
    "One or more student source cache warm tasks failed",
  );
}

async function warmPeriodicLazySourceCaches(env: Env): Promise<void> {
  if (await isKvCacheWindowFresh(env, SOURCE_WARM_MARKER_KEY, SOURCE_WARM_WINDOW_SECONDS)) {
    return;
  }

  // Record the window only after a successful warm. A failed/partial warm leaves
  // no marker so the next cron (10 min later) retries instead of skipping for the
  // full hour. Cron runs are ~60s-capped and 10 min apart, so they never overlap
  // and there is no concurrency window to protect against by claiming first.
  await runSourceRefreshTasks(
    [() => warmStudentSourceCaches(env, false), () => warmActiveUpcomingEventContent(env, false)],
    "One or more periodic lazy source cache warm tasks failed",
  );
  await markKvCacheWindow(env, SOURCE_WARM_MARKER_KEY);
}

async function refreshForcedSourceCaches(env: Env): Promise<void> {
  // These BAQL-sourced snapshots change at most a few times a day. Read paths use
  // fetchSourceCached (long freshness window) so a normal request never blocks on
  // them; this hourly gate is what lets cron force a refresh instead, without
  // forcing on every 10-minute tick.
  if (await isKvCacheWindowFresh(env, SOURCE_FORCED_REFRESH_MARKER_KEY, SOURCE_FORCED_REFRESH_WINDOW_SECONDS)) {
    return;
  }

  const tasks: Array<() => Promise<unknown>> = [
    () => syncRawStudents(env, true),
    () => warmRecruitmentCache(env, true),
    () => warmRaidCache(env, true),
    () => getMainStories(env, true),
    () => getAllStudentsFavoriteItems(env, true),
    () => syncAllTimelineContentsMeta(env, true),
    () => syncEventContentsList(env, true),
    () => getItemCatalogResources(env, true),
    () => getCampaignFarmingStages(env, true),
  ];

  await runSourceRefreshTasks(tasks, "One or more hourly forced source refresh tasks failed");
  await markKvCacheWindow(env, SOURCE_FORCED_REFRESH_MARKER_KEY);
}

async function refreshSourceCaches(env: Env): Promise<void> {
  const tasks: Array<() => Promise<unknown>> = [
    () => refreshForcedSourceCaches(env),
    () => warmPeriodicLazySourceCaches(env),
  ];

  await runSourceRefreshTasks(tasks, "One or more source cache refresh tasks failed");
}

export async function runScheduledJobs(
  env: Env,
  ctx?: ExecutionContext,
  runContext: ScheduledRunContext = {},
): Promise<void> {
  const logger = getLogger(env, ctx, { job: "scheduled" });
  const jobs: ScheduledJob[] = [
    { name: "syncYoutubeCommunityPosts", run: () => syncYoutubeCommunityPosts(env) },
    { name: "refreshSourceCaches", run: () => refreshSourceCaches(env) },
  ];

  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      const startedAt = Date.now();
      const context = {
        eventType: "scheduled",
        phase: "job",
        jobName: job.name,
        cron: runContext.cron,
        scheduledTime: runContext.scheduledTime,
      };

      try {
        await watchIo(
          "scheduled.job",
          withTimeout(job.run(), SCHEDULED_JOB_TIMEOUT_MS, `scheduled.${job.name}`),
          context,
          RUNTIME_TIMEOUTS.watchdogWarnMs.scheduled,
        );
      } catch (error) {
        if (isTimeoutError(error)) {
          console.error(
            "[io-watchdog] timeout",
            getIoWatchdogContext({ label: "scheduled.job", timeoutMs: SCHEDULED_JOB_TIMEOUT_MS, ...context }),
          );
        }
        throw error;
      }

      logger.info("Scheduled job completed", {
        scheduledJob: job.name,
        durationMs: Date.now() - startedAt,
        cron: runContext.cron,
        scheduledTime: runContext.scheduledTime,
      });
    }),
  );

  const failedJobs = results
    .map((result, index) => ({ result, job: jobs[index] }))
    .filter(
      (entry): entry is { result: PromiseRejectedResult; job: ScheduledJob } => entry.result.status === "rejected",
    );

  for (const failed of failedJobs) {
    logger.error("Scheduled job failed", failed.result.reason, {
      scheduledJob: failed.job.name,
    });
  }

  if (failedJobs.length > 0) {
    throw new AggregateError(
      failedJobs.map((failed) => failed.result.reason),
      "One or more scheduled jobs failed",
    );
  }
}
