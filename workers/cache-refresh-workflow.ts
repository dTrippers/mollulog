import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { CacheRefreshWorkflowParams } from "~/domain/cache-refresh";
import { runCacheRefreshWorkflow } from "~/jobs/cache-refresh-workflow.server";
import { withD1Timeout } from "./d1-timeout";

export class CacheRefreshWorkflow extends WorkflowEntrypoint<Env, CacheRefreshWorkflowParams> {
  override run(event: Readonly<WorkflowEvent<CacheRefreshWorkflowParams>>, step: WorkflowStep) {
    const env: Env = { ...this.env, DB: withD1Timeout(this.env.DB) };
    return runCacheRefreshWorkflow(env, this.ctx, event, step);
  }
}
