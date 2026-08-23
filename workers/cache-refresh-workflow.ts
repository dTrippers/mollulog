import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { CacheRefreshWorkflowParams } from "~/domain/cache-refresh";
import { runCacheRefreshWorkflow } from "~/jobs/cache-refresh-workflow.server";

export class CacheRefreshWorkflow extends WorkflowEntrypoint<Env, CacheRefreshWorkflowParams> {
  override run(event: Readonly<WorkflowEvent<CacheRefreshWorkflowParams>>, step: WorkflowStep) {
    return runCacheRefreshWorkflow(this.env, this.ctx, event, step);
  }
}
