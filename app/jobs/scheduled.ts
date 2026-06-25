import { getIoWatchdogContext, watchIo } from "~/lib/io-watchdog";
import { getLogger } from "~/lib/observability.server";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { isTimeoutError, withTimeout } from "~/lib/with-timeout";
import { syncAllTimelineContentsMeta } from "~/models/timeline-content";
import { syncYoutubeCommunityPosts } from "~/models/youtube";

type ScheduledJobName = "syncYoutubeCommunityPosts" | "syncAllTimelineContentsMeta";

type ScheduledJob = {
  name: ScheduledJobName;
  run: () => Promise<unknown>;
};

type ScheduledRunContext = {
  cron?: string;
  scheduledTime?: number;
};

const SCHEDULED_JOB_TIMEOUT_MS = RUNTIME_TIMEOUTS.scheduled.job;

export async function runScheduledJobs(env: Env, ctx?: ExecutionContext, runContext: ScheduledRunContext = {}): Promise<void> {
  const logger = getLogger(env, ctx, { job: "scheduled" });
  const jobs: ScheduledJob[] = [
    { name: "syncYoutubeCommunityPosts", run: () => syncYoutubeCommunityPosts(env) },
    { name: "syncAllTimelineContentsMeta", run: () => syncAllTimelineContentsMeta(env) },
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
