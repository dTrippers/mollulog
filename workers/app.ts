import { createRequestHandler } from "react-router";
import { getFutureContents, getIndexContents } from "~/models/content";
import { getAllRaids, getRaidDetail } from "~/models/raid";
import { syncRawStudents } from "~/models/student";

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
    if (event.cron === "0 * * * *") {
      // every hour
      await syncRawStudents(env);
    } else if (event.cron === "*/10 * * * *") {
      // every 10 minutes
      const allRaids = await getAllRaids(env, true);
      await Promise.all(allRaids.filter((raid) => raid.rankVisible && raid.until > new Date()).map((raid) => getRaidDetail(env, raid.uid, true)));
    } else if (event.cron === "* * * * *") {
      // every minute
      await getFutureContents(env, true);
      await getIndexContents(env, true);
    }
  },
} satisfies ExportedHandler<Env>;
