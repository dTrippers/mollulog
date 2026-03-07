import dayjs from "dayjs";
import { createRequestHandler } from "react-router";
import { getFutureContents, getIndexContents, getNavigationBarContents } from "~/models/content";
import { getAllRaids, getRaidDetail } from "~/models/raid";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import { syncRawStudents } from "~/models/student";
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
      if (event.cron === "*/10 * * * *") {
        await syncTimelineContents(env);
      }
    } catch (error) {
      console.error(`[scheduled] ${event.cron}\nError: ${error}`);
    }
    // if (event.cron === "0 * * * *") {
    //   // every hour
    //   await getAllStudentsFavoriteItems(env, true);
    //   await syncTimelineContents(env);
    // } else if (event.cron === "*/10 * * * *") {
    //   // every 10 minutes
    //   await syncRawStudents(env);

    //   const allRaids = await getAllRaids(env, true);
    //   const now = dayjs();
    //   await Promise.all(allRaids.filter((raid) => raid.rankVisible && dayjs(raid.until).isAfter(now)).map((raid) => getRaidDetail(env, raid.uid, true)));
    // } else if (event.cron === "* * * * *") {
    //   // every minute
    //   await Promise.all([
    //     getFutureContents(env, true),
    //     getIndexContents(env, true),
    //     getNavigationBarContents(env, true),
    //   ]);
    // }
  },
} satisfies ExportedHandler<Env>;
