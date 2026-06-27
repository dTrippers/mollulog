import { getIoWatchdogContext, watchIo } from "~/lib/io-watchdog";
import { getLogger } from "~/lib/observability.server";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { isTimeoutError, withTimeout } from "~/lib/with-timeout";
import { getMainStories } from "~/models/main-story";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import { getAllStudents, getStudentSkillItemsBatch, syncRawStudents } from "~/models/student";
import { syncAllTimelineContentsMeta } from "~/models/timeline-content";
import { syncYoutubeCommunityPosts } from "~/models/youtube";
import { getItemCatalogResources } from "~/repositories/item-catalog";
import { GrowthResourceRepository, RecruitmentRepository } from "~/repositories";
import { getCampaignFarmingStages } from "~/repositories/stage";
import { syncEventContentsList, warmActiveUpcomingEventContent } from "~/models/event-content";
import { cacheKey, cacheQuery, claimKvCacheWindow } from "~/lib/cache";
import { warmRaidCache } from "~/models/raid";

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
const SOURCE_WARM_WINDOW_SECONDS = 60 * 60;
const SOURCE_WARM_MARKER_KEY = cacheKey("source", "cron-source-warm", 1, cacheQuery({ name: "students-events" }));

async function warmStudentSourceCaches(env: Env, forceRefresh = false): Promise<void> {
  const studentUids = (await getAllStudents(env, true)).map((student) => student.uid);
  const growthResourceRepository = new GrowthResourceRepository(env);
  await Promise.all([
    getStudentSkillItemsBatch(env, studentUids, forceRefresh),
    growthResourceRepository.getStudentGearData(studentUids, forceRefresh),
  ]);
}

async function warmPeriodicLazySourceCaches(env: Env): Promise<void> {
  const shouldWarm = await claimKvCacheWindow(env, SOURCE_WARM_MARKER_KEY, SOURCE_WARM_WINDOW_SECONDS);
  if (!shouldWarm) {
    return;
  }

  await Promise.all([warmStudentSourceCaches(env, false), warmActiveUpcomingEventContent(env, false)]);
}

async function refreshSourceCaches(env: Env): Promise<void> {
  const recruitmentRepository = new RecruitmentRepository(env);
  await Promise.all([
    syncRawStudents(env),
    recruitmentRepository.refresh(),
    warmRaidCache(env),
    getMainStories(env, true),
    getAllStudentsFavoriteItems(env, true),
    syncAllTimelineContentsMeta(env),
    syncEventContentsList(env),
    warmPeriodicLazySourceCaches(env),
    getItemCatalogResources(env, true),
    getCampaignFarmingStages(env, true),
  ]);
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
