import * as Sentry from "@sentry/cloudflare";
import { createRequestHandler } from "react-router";
import { getLogger } from "~/lib/observability.server";
import { getFutureContents, getIndexContents, getNavigationBarContents } from "~/models/content";
import { warmUpNameCaches } from "~/models/content-name";
import { getMainStories } from "~/models/main-story";
import { getPyroxenePlannerContents } from "~/models/pyroxene-planner";
import { RecruitmentRepository, RaidRepository } from "~/repositories";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import { syncRawStudents } from "~/models/student";
import { getTimelineContents } from "~/models/timeline-content";
import { syncTimelineContents } from "~/jobs/sync-timeline-contents";

type ObservabilityEnv = Env & {
  SERVER_BETTER_STACK_SOURCE_TOKEN?: string;
  SERVER_BETTER_STACK_SENTRY_DSN?: string;
};

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: ObservabilityEnv;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

const handler: ExportedHandler<ObservabilityEnv> = {
  async fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },

  async scheduled(event, env, ctx) {
    const logger = getLogger(env, ctx, {
      cron: event.cron,
      handler: "scheduled",
    });

    try {
      await Sentry.withMonitor(`cron:${event.cron}`, async () => {
        if (event.cron === "* * * * *") {
          // every minute: keep UI-facing caches fresh
          await Promise.all([
            getIndexContents(env, true),
            getNavigationBarContents(env, true),
          ]);
        } else if (event.cron === "*/10 * * * *") {
          // every 10 minutes: sync D1 data, refresh short-lived caches
          const recruitmentRepository = new RecruitmentRepository(env);
          const raidRepository = new RaidRepository(env);

          // Step 1: sync raw data sources (independent)
          await Promise.all([
            syncRawStudents(env),
            syncTimelineContents(env, ctx),
            recruitmentRepository.refresh(),
          ]);

          // Step 2: refresh leaf caches (independent)
          const activeContents = await getTimelineContents(env);
          await Promise.all([
            raidRepository.refresh(),
            // refresh per-uid name caches for active/upcoming timeline contents
            warmUpNameCaches(env, activeContents),
          ]);

          // Step 3: refresh composite caches that depend on leaf caches
          await Promise.all([
            getPyroxenePlannerContents(env, true),
            getFutureContents(env, true),
          ]);
        } else if (event.cron === "0 * * * *") {
          // every hour: refresh longer-lived caches
          // Step 1: refresh leaf caches (independent of each other)
          await Promise.all([
            getAllStudentsFavoriteItems(env, true),
            getMainStories(env, true),
          ]);

          // Step 2: refresh composite caches that depend on the above
          await Promise.all([
            getIndexContents(env, true),
            getNavigationBarContents(env, true),
          ]);
        }
      });
    } catch (error) {
      logger.error("Scheduled handler failed", error);
    }
  },
};

export default Sentry.withSentry<ObservabilityEnv>(
  (env) => ({
    dsn: env.SERVER_BETTER_STACK_SENTRY_DSN,
    enabled: Boolean(env.SERVER_BETTER_STACK_SENTRY_DSN),
    environment: env.STAGE ?? "local",
    tracesSampleRate: 0,
  }),
  handler,
);
