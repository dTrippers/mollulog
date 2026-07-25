import { count, desc, eq } from "drizzle-orm";
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
  createdAt: UtcIsoString;
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

export function toPost(row: PostgresPostRow): Post {
  return {
    uid: row.uid,
    title: row.title,
    content: row.content,
    board: row.board,
    timelineContentUid: row.timelineContentUid,
    createdAt: toUtcIso(row.createdAt),
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
        .where(board ? eq(pgPostsTable.board, board) : undefined)
        .orderBy(desc(pgPostsTable.createdAt), desc(pgPostsTable.uid));
      return rows.map(toPost);
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
        .where(eq(pgPostsTable.board, "news"));
      const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
      const currentPage = Math.min(safePage, totalPages);
      const offset = (currentPage - 1) * safePageSize;
      const rows = await db
        .select()
        .from(pgPostsTable)
        .where(eq(pgPostsTable.board, "news"))
        .orderBy(desc(pgPostsTable.createdAt), desc(pgPostsTable.uid))
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
        .where(eq(pgPostsTable.timelineContentUid, timelineContentUid))
        .orderBy(desc(pgPostsTable.createdAt), desc(pgPostsTable.uid))
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
        .select({ createdAt: pgPostsTable.createdAt })
        .from(pgPostsTable)
        .where(eq(pgPostsTable.board, board))
        .orderBy(desc(pgPostsTable.createdAt), desc(pgPostsTable.uid))
        .limit(1);
      return row ? new Date(row.createdAt) : null;
    },
    options,
  );
}
