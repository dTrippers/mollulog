import dayjs from "dayjs";
import { createRequestHandler } from "react-router";
import { getIndexContents, getNavigationBarContents } from "~/models/content";
import { warmUpNameCaches } from "~/models/content-name";
import { getMainStories } from "~/models/main-story";
import { getPyroxenePlannerContents } from "~/models/pyroxene-planner";
import { getAllRaids, getRaidDetail } from "~/models/raid";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import { syncRawStudents } from "~/models/student";
import { getTimelineContents } from "~/models/timeline-content";
import { syncTimelineContents } from "~/jobs/sync-timeline-contents";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },

  async scheduled(event, env, ctx) {
    try {
      if (event.cron === "* * * * *") {
        // every minute: keep UI-facing caches fresh
        await Promise.all([
          getIndexContents(env, true),
          getNavigationBarContents(env, true),
        ]);
      } else if (event.cron === "*/10 * * * *") {
        // every 10 minutes: sync D1 data, refresh short-lived caches
        // Step 1: sync raw data sources (independent)
        await Promise.all([
          syncRawStudents(env),
          syncTimelineContents(env),
        ]);

        // Step 2: refresh leaf caches (independent)
        const [allRaids, activeContents] = await Promise.all([
          getAllRaids(env, true),
          getTimelineContents(env),
        ]);
        const now = dayjs();
        await Promise.all([
          // refresh active raid detail caches
          ...allRaids
            .filter((raid) => raid.rankVisible && dayjs(raid.until).isAfter(now))
            .map((raid) => getRaidDetail(env, raid.uid, true)),
          // refresh per-uid name caches for active/upcoming timeline contents
          warmUpNameCaches(env, activeContents),
        ]);

        // Step 3: refresh composite caches that depend on leaf caches
        await getPyroxenePlannerContents(env, true);
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
    } catch (error) {
      console.error(`[scheduled] ${event.cron}\nError: ${error}`);
    }
  },
} satisfies ExportedHandler<Env>;
