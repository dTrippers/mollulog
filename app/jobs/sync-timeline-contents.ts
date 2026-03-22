import { getLogger } from "~/lib/observability.server";
import { warmUpSingleItemCache } from "~/models/content-name";
import { getUnsyncedUnstartedContents, markSyncedAt } from "~/models/timeline-content";

/**
 * Syncs metadata from BAQL for unstarted timeline contents that have not yet been synced.
 *
 * Flow:
 * 1. Query D1 for items where synced_at IS NULL and start_at > now.
 * 2. For each item, attempt to warm up its KV cache via BAQL (forceRefresh=true).
 * 3. If BAQL returns data, stamp synced_at = current_timestamp — the item becomes visible on the timeline.
 * 4. If BAQL has no data yet, leave synced_at as NULL and retry on the next cron cycle.
 */
export async function syncTimelineContents(env: Env, ctx?: ExecutionContext): Promise<void> {
  const logger = getLogger(env, ctx, { job: "sync-timeline-contents" });

  const unsyncedItems = await getUnsyncedUnstartedContents(env);
  logger.info("Found unsynced unstarted timeline contents", { count: unsyncedItems.length });

  if (unsyncedItems.length === 0) return;

  await Promise.all(
    unsyncedItems.map(async (item) => {
      const success = await warmUpSingleItemCache(env, item);
      if (success) {
        await markSyncedAt(env, item.uid);
        logger.info("Synced timeline content", { uid: item.uid, contentType: item.contentType });
      } else {
        logger.warn("BAQL data not available yet, will retry", {
          uid: item.uid,
          contentType: item.contentType,
        });
      }
    }),
  );
}
