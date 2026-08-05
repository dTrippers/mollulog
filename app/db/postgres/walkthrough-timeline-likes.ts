import { and, count, eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { communityAuthorVisiblePredicate } from "~/db/postgres/community-moderation";
import { pgWalkthroughTimelineLikesTable, pgWalkthroughTimelinesTable } from "~/db/postgres/schema";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export type WalkthroughTimelineLikeSummary = {
  liked: boolean;
  likeCount: number;
};

export type PostgresWalkthroughTimelineLikeOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

async function withWalkthroughTimelineLikeDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: NodePgDatabase) => Promise<T>,
  options: PostgresWalkthroughTimelineLikeOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "raid_walkthrough_likes");
        span?.setAttribute("walkthrough_timeline_like.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.raid_walkthrough_likes.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

export async function getPostgresWalkthroughTimelineLikeSummaries(
  env: Pick<Env, "HYPERDRIVE">,
  walkthroughUids: string[],
  currentUserId?: number | null,
  options: PostgresWalkthroughTimelineLikeOptions = {},
): Promise<Record<string, WalkthroughTimelineLikeSummary>> {
  const uniqueUids = [...new Set(walkthroughUids)];
  if (uniqueUids.length === 0) return {};

  return withWalkthroughTimelineLikeDatabase(
    env,
    "get_summaries",
    async (db) => {
      const countRows = await db
        .select({
          walkthroughUid: pgWalkthroughTimelineLikesTable.walkthroughUid,
          likeCount: count(),
        })
        .from(pgWalkthroughTimelineLikesTable)
        .innerJoin(
          pgWalkthroughTimelinesTable,
          eq(pgWalkthroughTimelineLikesTable.walkthroughUid, pgWalkthroughTimelinesTable.uid),
        )
        .where(
          and(
            inArray(pgWalkthroughTimelineLikesTable.walkthroughUid, uniqueUids),
            eq(pgWalkthroughTimelinesTable.visibility, "public"),
          ),
        )
        .groupBy(pgWalkthroughTimelineLikesTable.walkthroughUid);
      const likedRows = currentUserId
        ? await db
            .select({ walkthroughUid: pgWalkthroughTimelineLikesTable.walkthroughUid })
            .from(pgWalkthroughTimelineLikesTable)
            .innerJoin(
              pgWalkthroughTimelinesTable,
              eq(pgWalkthroughTimelineLikesTable.walkthroughUid, pgWalkthroughTimelinesTable.uid),
            )
            .where(
              and(
                eq(pgWalkthroughTimelineLikesTable.userId, currentUserId),
                inArray(pgWalkthroughTimelineLikesTable.walkthroughUid, uniqueUids),
                eq(pgWalkthroughTimelinesTable.visibility, "public"),
              ),
            )
        : [];
      const counts = new Map(countRows.map((row) => [row.walkthroughUid, Number(row.likeCount)]));
      const likedUids = new Set(likedRows.map((row) => row.walkthroughUid));

      return Object.fromEntries(
        uniqueUids.map((uid) => [uid, { liked: likedUids.has(uid), likeCount: counts.get(uid) ?? 0 }]),
      );
    },
    options,
  );
}

export async function canPostgresWalkthroughTimelineReceiveLike(
  env: Pick<Env, "HYPERDRIVE">,
  walkthroughUid: string,
  viewerUserId?: number | null,
  options: PostgresWalkthroughTimelineLikeOptions = {},
): Promise<boolean> {
  return withWalkthroughTimelineLikeDatabase(
    env,
    "can_receive_like",
    async (db) => {
      const rows = await db
        .select({ uid: pgWalkthroughTimelinesTable.uid })
        .from(pgWalkthroughTimelinesTable)
        .where(
          and(
            eq(pgWalkthroughTimelinesTable.uid, walkthroughUid),
            eq(pgWalkthroughTimelinesTable.visibility, "public"),
            communityAuthorVisiblePredicate(pgWalkthroughTimelinesTable.userId, viewerUserId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
    options,
  );
}

export async function setPostgresWalkthroughTimelineLike(
  env: Pick<Env, "HYPERDRIVE">,
  walkthroughUid: string,
  userId: number,
  liked: boolean,
  options: PostgresWalkthroughTimelineLikeOptions = {},
): Promise<boolean> {
  return withWalkthroughTimelineLikeDatabase(
    env,
    "set_state",
    async (db) => {
      const targets = await db
        .select({ uid: pgWalkthroughTimelinesTable.uid })
        .from(pgWalkthroughTimelinesTable)
        .where(
          and(
            eq(pgWalkthroughTimelinesTable.uid, walkthroughUid),
            eq(pgWalkthroughTimelinesTable.visibility, "public"),
            liked ? communityAuthorVisiblePredicate(pgWalkthroughTimelinesTable.userId, userId) : undefined,
          ),
        )
        .limit(1);
      if (!targets[0]) return false;

      if (liked) {
        await db
          .insert(pgWalkthroughTimelineLikesTable)
          .values({ walkthroughUid, userId, createdAt: new Date() })
          .onConflictDoNothing({
            target: [pgWalkthroughTimelineLikesTable.walkthroughUid, pgWalkthroughTimelineLikesTable.userId],
          });
      } else {
        await db
          .delete(pgWalkthroughTimelineLikesTable)
          .where(
            and(
              eq(pgWalkthroughTimelineLikesTable.walkthroughUid, walkthroughUid),
              eq(pgWalkthroughTimelineLikesTable.userId, userId),
            ),
          );
      }

      return true;
    },
    options,
  );
}
