import { WorkerEntrypoint } from "cloudflare:workers";
import { getAdminCacheRefreshStatus, startAdminCacheRefresh } from "~/jobs/cache-refresh-service.server";

/**
 * RPC entrypoint for the admin worker. It is reachable only through a service binding, not over HTTP,
 * so access is limited to workers in this account that bind it.
 */
export class CacheRefreshService extends WorkerEntrypoint<Env> {
  start() {
    return startAdminCacheRefresh(this.env, this.ctx);
  }

  status(uid: string | null = null) {
    return getAdminCacheRefreshStatus(this.env, this.ctx, uid);
  }
}
