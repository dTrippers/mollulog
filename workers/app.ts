import { createRequestHandler } from "react-router";
import { Env } from "~/env.server";
import { getFutureContents, getIndexContents } from "~/models/content";
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
    } else if (event.cron === "* * * * *") {
      // every minute
      await getFutureContents(env, true);
      await getIndexContents(env, true);
    }
  },
} satisfies ExportedHandler<Env>;
