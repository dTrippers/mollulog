import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgWalkthroughTimelinesTable } from "~/db/postgres/schema";
import {
  parseWalkthroughTimelineDocument,
  type WalkthroughTimelineDefenseType,
  type WalkthroughTimelineDifficulty,
  type WalkthroughTimelineDocument,
  type WalkthroughTimelineRecord,
  type WalkthroughTimelineTerrain,
  type WalkthroughTimelineVisibility,
} from "~/domain/walkthrough-timeline";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

type WalkthroughTimelineRow = typeof pgWalkthroughTimelinesTable.$inferSelect;

export type PostgresWalkthroughTimelineOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

export type WalkthroughTimelineWriteInput = {
  title: string;
  description: string;
  visibility: WalkthroughTimelineVisibility;
  bossUid: string;
  terrain: WalkthroughTimelineTerrain;
  defenseType: WalkthroughTimelineDefenseType;
  maxDifficulty: WalkthroughTimelineDifficulty;
  document: WalkthroughTimelineDocument;
};

function toDomain(row: WalkthroughTimelineRow): WalkthroughTimelineRecord {
  return {
    uid: row.uid,
    userId: row.userId,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    bossUid: row.bossUid,
    terrain: row.terrain,
    defenseType: row.defenseType,
    maxDifficulty: row.maxDifficulty,
    document: parseWalkthroughTimelineDocument(row.document),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function withWalkthroughTimelineDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: NodePgDatabase) => Promise<T>,
  options: PostgresWalkthroughTimelineOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "raid_walkthroughs");
        span?.setAttribute("walkthrough_timeline.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.raid_walkthroughs.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

function normalizeWriteInput(input: WalkthroughTimelineWriteInput): WalkthroughTimelineWriteInput {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title) throw new Error("타임라인 제목을 입력해주세요.");
  if (
    input.document.context.bossUid !== input.bossUid ||
    input.document.context.terrain !== input.terrain ||
    input.document.context.defenseType !== input.defenseType ||
    input.document.context.maxDifficulty !== input.maxDifficulty
  ) {
    throw new Error("타임라인 문서와 공략 설정이 일치하지 않아요.");
  }
  return { ...input, title, description, document: parseWalkthroughTimelineDocument(input.document) };
}

export async function createPostgresWalkthroughTimeline(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  input: WalkthroughTimelineWriteInput,
  options: PostgresWalkthroughTimelineOptions = {},
): Promise<WalkthroughTimelineRecord> {
  const normalized = normalizeWriteInput(input);
  return withWalkthroughTimelineDatabase(
    env,
    "create",
    async (db) => {
      const now = new Date();
      const rows = await db
        .insert(pgWalkthroughTimelinesTable)
        .values({
          uid: nanoid(12),
          userId,
          ...normalized,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!rows[0]) throw new Error("타임라인을 저장하지 못했어요.");
      return toDomain(rows[0]);
    },
    options,
  );
}

export async function getPostgresWalkthroughTimeline(
  env: Pick<Env, "HYPERDRIVE">,
  uid: string,
  options: PostgresWalkthroughTimelineOptions = {},
): Promise<WalkthroughTimelineRecord | null> {
  return withWalkthroughTimelineDatabase(
    env,
    "get_by_uid",
    async (db) => {
      const rows = await db
        .select()
        .from(pgWalkthroughTimelinesTable)
        .where(eq(pgWalkthroughTimelinesTable.uid, uid))
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    },
    options,
  );
}

export async function listPostgresWalkthroughTimelinesByUser(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  includePrivate: boolean,
  options: PostgresWalkthroughTimelineOptions = {},
): Promise<WalkthroughTimelineRecord[]> {
  return withWalkthroughTimelineDatabase(
    env,
    "list_by_user",
    async (db) => {
      const conditions = [eq(pgWalkthroughTimelinesTable.userId, userId)];
      if (!includePrivate) conditions.push(eq(pgWalkthroughTimelinesTable.visibility, "public"));
      const rows = await db
        .select()
        .from(pgWalkthroughTimelinesTable)
        .where(and(...conditions))
        .orderBy(desc(pgWalkthroughTimelinesTable.updatedAt), desc(pgWalkthroughTimelinesTable.uid));
      return rows.map(toDomain);
    },
    options,
  );
}

export async function listPostgresPublicWalkthroughTimelinesByBoss(
  env: Pick<Env, "HYPERDRIVE">,
  boss: {
    bossUid: string;
    terrain?: WalkthroughTimelineTerrain | null;
    defenseType?: WalkthroughTimelineDefenseType | null;
    maxDifficulty?: WalkthroughTimelineDifficulty | null;
  },
  options: PostgresWalkthroughTimelineOptions = {},
): Promise<WalkthroughTimelineRecord[]> {
  return listPostgresPublicWalkthroughTimelines(env, boss, options);
}

export async function listPostgresPublicWalkthroughTimelines(
  env: Pick<Env, "HYPERDRIVE">,
  filters: {
    bossUid?: string | null;
    terrain?: WalkthroughTimelineTerrain | null;
    defenseType?: WalkthroughTimelineDefenseType | null;
    maxDifficulty?: WalkthroughTimelineDifficulty | null;
  } = {},
  options: PostgresWalkthroughTimelineOptions = {},
): Promise<WalkthroughTimelineRecord[]> {
  return withWalkthroughTimelineDatabase(
    env,
    "list_public",
    async (db) => {
      const conditions = [];
      if (filters.bossUid) conditions.push(eq(pgWalkthroughTimelinesTable.bossUid, filters.bossUid));
      conditions.push(eq(pgWalkthroughTimelinesTable.visibility, "public"));
      if (filters.terrain) conditions.push(eq(pgWalkthroughTimelinesTable.terrain, filters.terrain));
      if (filters.defenseType) conditions.push(eq(pgWalkthroughTimelinesTable.defenseType, filters.defenseType));
      if (filters.maxDifficulty) {
        conditions.push(eq(pgWalkthroughTimelinesTable.maxDifficulty, filters.maxDifficulty));
      }
      const rows = await db
        .select()
        .from(pgWalkthroughTimelinesTable)
        .where(and(...conditions))
        .orderBy(desc(pgWalkthroughTimelinesTable.updatedAt), desc(pgWalkthroughTimelinesTable.uid));
      return rows.map(toDomain);
    },
    options,
  );
}

export async function updatePostgresWalkthroughTimeline(
  env: Pick<Env, "HYPERDRIVE">,
  uid: string,
  userId: number,
  input: WalkthroughTimelineWriteInput,
  options: PostgresWalkthroughTimelineOptions = {},
): Promise<WalkthroughTimelineRecord | null> {
  const normalized = normalizeWriteInput(input);
  return withWalkthroughTimelineDatabase(
    env,
    "update",
    async (db) => {
      const rows = await db
        .update(pgWalkthroughTimelinesTable)
        .set({
          ...normalized,
          updatedAt: new Date(),
        })
        .where(and(eq(pgWalkthroughTimelinesTable.uid, uid), eq(pgWalkthroughTimelinesTable.userId, userId)))
        .returning();
      return rows[0] ? toDomain(rows[0]) : null;
    },
    options,
  );
}

export async function deletePostgresWalkthroughTimeline(
  env: Pick<Env, "HYPERDRIVE">,
  uid: string,
  userId: number,
  options: PostgresWalkthroughTimelineOptions = {},
): Promise<boolean> {
  return withWalkthroughTimelineDatabase(
    env,
    "delete",
    async (db) => {
      const rows = await db
        .delete(pgWalkthroughTimelinesTable)
        .where(and(eq(pgWalkthroughTimelinesTable.uid, uid), eq(pgWalkthroughTimelinesTable.userId, userId)))
        .returning({ uid: pgWalkthroughTimelinesTable.uid });
      return rows.length > 0;
    },
    options,
  );
}

export async function clonePostgresWalkthroughTimeline(
  env: Pick<Env, "HYPERDRIVE">,
  sourceUid: string,
  userId: number,
  options: PostgresWalkthroughTimelineOptions = {},
): Promise<WalkthroughTimelineRecord | null> {
  const source = await getPostgresWalkthroughTimeline(env, sourceUid, options);
  if (!source || source.visibility === "private") return null;
  return createPostgresWalkthroughTimeline(
    env,
    userId,
    {
      title: `${source.title} 복사본`,
      description: source.description,
      visibility: "private",
      bossUid: source.bossUid,
      terrain: source.terrain,
      defenseType: source.defenseType,
      maxDifficulty: source.maxDifficulty,
      document: structuredClone(source.document),
    },
    options,
  );
}

export async function getPostgresWalkthroughTimelinesByUids(
  env: Pick<Env, "HYPERDRIVE">,
  uids: string[],
  options: PostgresWalkthroughTimelineOptions = {},
): Promise<WalkthroughTimelineRecord[]> {
  const uniqueUids = [...new Set(uids)];
  if (uniqueUids.length === 0) return [];
  return withWalkthroughTimelineDatabase(
    env,
    "get_by_uids",
    async (db) => {
      const rows = await db
        .select()
        .from(pgWalkthroughTimelinesTable)
        .where(inArray(pgWalkthroughTimelinesTable.uid, uniqueUids));
      return rows.map(toDomain);
    },
    options,
  );
}
