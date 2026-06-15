import { getLogger } from "~/lib/observability.server";
import { syncAllTimelineContentsMeta } from "~/models/timeline-content";
import { syncYoutubeCommunityPosts } from "~/models/youtube";

type ScheduledJobName = "syncYoutubeCommunityPosts" | "syncAllTimelineContentsMeta";

type ScheduledJob = {
  name: ScheduledJobName;
  run: () => Promise<unknown>;
};

export async function runScheduledJobs(env: Env, ctx?: ExecutionContext): Promise<void> {
  const logger = getLogger(env, ctx, { job: "scheduled" });
  const jobs: ScheduledJob[] = [
    { name: "syncYoutubeCommunityPosts", run: () => syncYoutubeCommunityPosts(env) },
    { name: "syncAllTimelineContentsMeta", run: () => syncAllTimelineContentsMeta(env) },
  ];

  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      const startedAt = Date.now();
      await job.run();
      logger.info("Scheduled job completed", {
        scheduledJob: job.name,
        durationMs: Date.now() - startedAt,
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
