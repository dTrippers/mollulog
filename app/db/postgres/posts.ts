import { and, count, desc, eq, isNotNull, ne, type SQL } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { pgPostsTable } from "~/db/postgres/schema";
import { normalizeInstant, type UtcIsoString } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

type PostgresPostRow = typeof pgPostsTable.$inferSelect;

export type Post = {
  uid: string;
  title: string;
  content: string;
  board: string;
  timelineContentUid: string | null;
  thumbnailImageUrl: string | null;
  // When the post became public. Lists, dates, and the news badge all use it, never the draft's creation time.
  publishedAt: UtcIsoString;
  updatedAt: UtcIsoString;
};

export type PostPage = {
  items: Post[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type PostgresPostsOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

function toUtcIso(value: Date | string): UtcIsoString {
  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

// Every public read goes through this condition, so a draft never leaves the admin app.
function published(condition?: SQL): SQL | undefined {
  return and(isNotNull(pgPostsTable.publishedAt), condition);
}

const newestPublishedFirst = [desc(pgPostsTable.publishedAt), desc(pgPostsTable.uid)];

export function toPost(row: PostgresPostRow): Post {
  if (!row.publishedAt) {
    throw new Error(`Draft post ${row.uid} reached a public read`);
  }
  return {
    uid: row.uid,
    title: row.title,
    content: row.content,
    board: row.board,
    timelineContentUid: row.timelineContentUid,
    thumbnailImageUrl: row.thumbnailImageUrl,
    publishedAt: toUtcIso(row.publishedAt),
    updatedAt: toUtcIso(row.updatedAt),
  };
}

async function withPostsDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: NodePgDatabase) => Promise<T>,
  options: PostgresPostsOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.operation.name", "select");
        span?.setAttribute("db.collection.name", "posts");
        span?.setAttribute("posts.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.posts.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

export async function getPostgresPosts(
  env: Pick<Env, "HYPERDRIVE">,
  board?: string,
  options: PostgresPostsOptions = {},
): Promise<Post[]> {
  return withPostsDatabase(
    env,
    "get_all",
    async (db) => {
      const rows = await db
        .select()
        .from(pgPostsTable)
        .where(published(board ? eq(pgPostsTable.board, board) : undefined))
        .orderBy(...newestPublishedFirst);
      return rows.map(toPost);
    },
    options,
  );
}

export async function getPostgresPostByUid(
  env: Pick<Env, "HYPERDRIVE">,
  uid: string,
  options: PostgresPostsOptions = {},
): Promise<Post | null> {
  return withPostsDatabase(
    env,
    "get_by_uid",
    async (db) => {
      const [row] = await db
        .select()
        .from(pgPostsTable)
        .where(published(eq(pgPostsTable.uid, uid)))
        .limit(1);
      return row ? toPost(row) : null;
    },
    options,
  );
}

export async function getPostgresNewsPosts(
  env: Pick<Env, "HYPERDRIVE">,
  page = 1,
  pageSize = 5,
  options: PostgresPostsOptions = {},
): Promise<PostPage> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);

  return withPostsDatabase(
    env,
    "get_news_page",
    async (db) => {
      const [{ value: totalCount }] = await db
        .select({ value: count() })
        .from(pgPostsTable)
        .where(published(eq(pgPostsTable.board, "news")));
      const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
      const currentPage = Math.min(safePage, totalPages);
      const offset = (currentPage - 1) * safePageSize;
      const rows = await db
        .select()
        .from(pgPostsTable)
        .where(published(eq(pgPostsTable.board, "news")))
        .orderBy(...newestPublishedFirst)
        .limit(safePageSize)
        .offset(offset);

      return {
        items: rows.map(toPost),
        page: currentPage,
        pageSize: safePageSize,
        totalCount,
        totalPages,
      };
    },
    options,
  );
}

export async function getPostgresRecentNewsPosts(
  env: Pick<Env, "HYPERDRIVE">,
  excludeUid: string,
  limit = 3,
  options: PostgresPostsOptions = {},
): Promise<Post[]> {
  const safeLimit = Math.max(1, limit);

  return withPostsDatabase(
    env,
    "get_recent_news",
    async (db) => {
      const rows = await db
        .select()
        .from(pgPostsTable)
        .where(published(and(eq(pgPostsTable.board, "news"), ne(pgPostsTable.uid, excludeUid))))
        .orderBy(...newestPublishedFirst)
        .limit(safeLimit);
      return rows.map(toPost);
    },
    options,
  );
}

export async function getPostgresPostByTimelineContentUid(
  env: Pick<Env, "HYPERDRIVE">,
  timelineContentUid: string,
  options: PostgresPostsOptions = {},
): Promise<Post | null> {
  return withPostsDatabase(
    env,
    "get_by_timeline_content_uid",
    async (db) => {
      const [row] = await db
        .select()
        .from(pgPostsTable)
        .where(published(eq(pgPostsTable.timelineContentUid, timelineContentUid)))
        .orderBy(...newestPublishedFirst)
        .limit(1);
      return row ? toPost(row) : null;
    },
    options,
  );
}

export async function getPostgresLatestPostTime(
  env: Pick<Env, "HYPERDRIVE">,
  board: string,
  options: PostgresPostsOptions = {},
): Promise<Date | null> {
  return withPostsDatabase(
    env,
    "get_latest_time",
    async (db) => {
      const [row] = await db
        .select({ publishedAt: pgPostsTable.publishedAt })
        .from(pgPostsTable)
        .where(published(eq(pgPostsTable.board, board)))
        .orderBy(...newestPublishedFirst)
        .limit(1);
      return row?.publishedAt ? new Date(row.publishedAt) : null;
    },
    options,
  );
}
