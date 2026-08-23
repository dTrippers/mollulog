import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

/**
 * Returns the shared account-level visibility predicate for public community
 * rows. The correlated NOT EXISTS uses the primary key on
 * community_author_mutes.user_id and keeps the policy out of per-row
 * author lookups.
 */
export function communityAuthorVisiblePredicate(authorUserId: SQLWrapper, viewerUserId?: number | null): SQL {
  const notMuted = sql`NOT EXISTS (
    SELECT 1
    FROM community_author_mutes AS cam
    WHERE cam.user_id = ${authorUserId}
  )`;
  if (viewerUserId == null) return notMuted;
  return sql`(${authorUserId} = ${viewerUserId} OR ${notMuted})`;
}
