import { and, count, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import {
  type RaidRecord,
  type RaidRecordParty,
  type RaidRecordRaidType,
  type RaidRecordScore,
  type RaidRecordServer,
  isScoreOnlyRaidRecord,
  readStoredRaidRecordParties,
  readStoredRaidRecordScores,
} from "~/domain/raid-record";
import { postgresUniqueConstraintName } from "~/lib/db";
import { normalizeInstant } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import { pgRaidRecordsTable } from "./schema";

type RaidRecordRow = typeof pgRaidRecordsTable.$inferSelect;

export type PostgresRaidRecordOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

export type RaidRecordSeasonKey = {
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
  seasonIndex: number;
};

export type RaidRecordValues = {
  scores: RaidRecordScore[];
  rank: number | null;
  rankRecordedAt: string | null;
  memo: string;
  parties: RaidRecordParty[];
};

export const RAID_RECORD_SEASON_UNIQUE_INDEX = "raid_records_user_server_raid_season_uidx";

export class RaidRecordSeasonConflictError extends Error {
  constructor() {
    super("이 시즌에는 이미 기록이 있어요.");
    this.name = "RaidRecordSeasonConflictError";
  }
}

function toDomain(row: RaidRecordRow): RaidRecord {
  return {
    uid: row.uid,
    userId: row.userId,
    server: row.server,
    raidType: row.raidType,
    seasonIndex: row.seasonIndex,
    scores: readStoredRaidRecordScores(row.scores),
    rank: row.rank,
    rankRecordedAt: row.rankRecordedAt === null ? null : normalizeInstant(row.rankRecordedAt),
    memo: row.memo,
    parties: readStoredRaidRecordParties(row.parties),
    createdAt: normalizeInstant(row.createdAt),
    updatedAt: normalizeInstant(row.updatedAt),
  };
}

async function withRaidRecordDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: NodePgDatabase) => Promise<T>,
  options: PostgresRaidRecordOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "raid_records");
        span?.setAttribute("raid_record.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.raid_records.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

function seasonWhere(userId: number, key: RaidRecordSeasonKey) {
  return and(
    eq(pgRaidRecordsTable.userId, userId),
    eq(pgRaidRecordsTable.server, key.server),
    eq(pgRaidRecordsTable.raidType, key.raidType),
    eq(pgRaidRecordsTable.seasonIndex, key.seasonIndex),
  );
}

export async function listPostgresRaidRecords(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresRaidRecordOptions = {},
): Promise<RaidRecord[]> {
  const rows = await withRaidRecordDatabase(
    env,
    "list_by_user",
    (db) => db.select().from(pgRaidRecordsTable).where(eq(pgRaidRecordsTable.userId, userId)),
    options,
  );
  return rows.map(toDomain);
}

export async function countPostgresRaidRecords(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresRaidRecordOptions = {},
): Promise<number> {
  const rows = await withRaidRecordDatabase(
    env,
    "count_by_user",
    (db) => db.select({ value: count() }).from(pgRaidRecordsTable).where(eq(pgRaidRecordsTable.userId, userId)),
    options,
  );
  return Number(rows[0]?.value ?? 0);
}

export async function getPostgresRaidRecordByUid(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  uid: string,
  options: PostgresRaidRecordOptions = {},
): Promise<RaidRecord | null> {
  const rows = await withRaidRecordDatabase(
    env,
    "get_by_uid",
    (db) =>
      db
        .select()
        .from(pgRaidRecordsTable)
        .where(and(eq(pgRaidRecordsTable.userId, userId), eq(pgRaidRecordsTable.uid, uid)))
        .limit(1),
    options,
  );
  return rows[0] ? toDomain(rows[0]) : null;
}

export async function getPostgresRaidRecordBySeason(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  key: RaidRecordSeasonKey,
  options: PostgresRaidRecordOptions = {},
): Promise<RaidRecord | null> {
  const rows = await withRaidRecordDatabase(
    env,
    "get_by_season",
    (db) => db.select().from(pgRaidRecordsTable).where(seasonWhere(userId, key)).limit(1),
    options,
  );
  return rows[0] ? toDomain(rows[0]) : null;
}

export async function createPostgresRaidRecord(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  key: RaidRecordSeasonKey,
  values: RaidRecordValues,
  options: PostgresRaidRecordOptions = {},
): Promise<RaidRecord> {
  try {
    const rows = await withRaidRecordDatabase(
      env,
      "create",
      (db) =>
        db
          .insert(pgRaidRecordsTable)
          .values({ uid: nanoid(12), userId, ...key, ...values })
          .returning(),
      options,
    );
    if (!rows[0]) throw new Error("raid record insert returned no row");
    return toDomain(rows[0]);
  } catch (error) {
    if (postgresUniqueConstraintName(error) === RAID_RECORD_SEASON_UNIQUE_INDEX) {
      throw new RaidRecordSeasonConflictError();
    }
    throw error;
  }
}

export async function updatePostgresRaidRecord(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  uid: string,
  values: Partial<RaidRecordValues>,
  options: PostgresRaidRecordOptions = {},
): Promise<RaidRecord | null> {
  const rows = await withRaidRecordDatabase(
    env,
    "update",
    (db) =>
      db
        .update(pgRaidRecordsTable)
        .set({ ...values, updatedAt: sql`now()` })
        .where(and(eq(pgRaidRecordsTable.userId, userId), eq(pgRaidRecordsTable.uid, uid)))
        .returning(),
    options,
  );
  return rows[0] ? toDomain(rows[0]) : null;
}

export async function deletePostgresRaidRecord(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  uid: string,
  options: PostgresRaidRecordOptions = {},
): Promise<boolean> {
  const rows = await withRaidRecordDatabase(
    env,
    "delete",
    (db) =>
      db
        .delete(pgRaidRecordsTable)
        .where(and(eq(pgRaidRecordsTable.userId, userId), eq(pgRaidRecordsTable.uid, uid)))
        .returning({ uid: pgRaidRecordsTable.uid }),
    options,
  );
  return rows.length > 0;
}

// One row of a batch save. `uid` and `updatedAt` name the record and the version the screen read; a row without them
// creates the season's record.
export type RaidRecordBatchRow = {
  key: RaidRecordSeasonKey;
  current: { uid: string; updatedAt: string } | null;
  values: Pick<RaidRecordValues, "scores" | "rank" | "rankRecordedAt">;
};

export class RaidRecordBatchStaleError extends Error {
  constructor() {
    super("다른 곳에서 기록이 바뀌었어요.");
    this.name = "RaidRecordBatchStaleError";
  }
}

// Saves every row or none. A row for a record that was deleted or changed, or for a season that gained a record since the
// screen read it, fails the whole batch, so the screen reloads instead of overwriting what it never saw.
export async function savePostgresRaidRecordsBatch(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  rows: readonly RaidRecordBatchRow[],
  options: PostgresRaidRecordOptions = {},
): Promise<void> {
  try {
    await withRaidRecordDatabase(
      env,
      "save_batch",
      (db) =>
        db.transaction(async (tx) => {
          for (const row of rows) {
            if (row.current === null) {
              await tx.insert(pgRaidRecordsTable).values({
                uid: nanoid(12),
                userId,
                ...row.key,
                ...row.values,
                memo: "",
                parties: [],
              });
              continue;
            }
            const locked = await tx
              .select()
              .from(pgRaidRecordsTable)
              .where(and(eq(pgRaidRecordsTable.uid, row.current.uid), seasonWhere(userId, row.key)))
              .for("update");
            // The version compares as the screen read it: the same millisecond-precision instant.
            if (!locked[0] || toDomain(locked[0]).updatedAt !== normalizeInstant(row.current.updatedAt)) {
              throw new RaidRecordBatchStaleError();
            }
            await tx
              .update(pgRaidRecordsTable)
              .set({ ...row.values, updatedAt: sql`now()` })
              .where(eq(pgRaidRecordsTable.uid, row.current.uid));
          }
        }),
      options,
    );
  } catch (error) {
    if (postgresUniqueConstraintName(error) === RAID_RECORD_SEASON_UNIQUE_INDEX) {
      throw new RaidRecordBatchStaleError();
    }
    throw error;
  }
}

export type RaidRecordChartScoreResult =
  | { kind: "saved"; record: RaidRecord }
  | { kind: "deleted" }
  // Clearing the score of a record that holds more than a score keeps the record as it was.
  | { kind: "kept"; record: RaidRecord | null };

// The season chart's "내 점수" saves one defense type's score. A season with no record gains a record with the score
// alone. Clearing the score removes it only from a record that holds nothing but scores, and removes that record once it
// has no score left.
export async function applyPostgresRaidRecordChartScore(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  key: RaidRecordSeasonKey,
  entry: RaidRecordScore | { defenseType: RaidRecordScore["defenseType"]; score: null },
  options: PostgresRaidRecordOptions = {},
): Promise<RaidRecordChartScoreResult> {
  try {
    return await applyChartScoreOnce(env, userId, key, entry, options);
  } catch (error) {
    // Another save created the season's record first, such as the same chart open in two tabs. The second attempt
    // finds that record and updates it.
    if (postgresUniqueConstraintName(error) !== RAID_RECORD_SEASON_UNIQUE_INDEX) throw error;
    return applyChartScoreOnce(env, userId, key, entry, options);
  }
}

function applyChartScoreOnce(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  key: RaidRecordSeasonKey,
  entry: RaidRecordScore | { defenseType: RaidRecordScore["defenseType"]; score: null },
  options: PostgresRaidRecordOptions,
): Promise<RaidRecordChartScoreResult> {
  return withRaidRecordDatabase(
    env,
    "apply_chart_score",
    (db) =>
      db.transaction(async (tx): Promise<RaidRecordChartScoreResult> => {
        const currentRows = await tx.select().from(pgRaidRecordsTable).where(seasonWhere(userId, key)).for("update");
        const current = currentRows[0] ? toDomain(currentRows[0]) : null;
        if (entry.score === null) {
          if (!current || !isScoreOnlyRaidRecord(current)) return { kind: "kept", record: current };
          const scores = current.scores.filter((score) => score.defenseType !== entry.defenseType);
          if (scores.length === current.scores.length) return { kind: "kept", record: current };
          if (scores.length === 0) {
            await tx.delete(pgRaidRecordsTable).where(eq(pgRaidRecordsTable.uid, current.uid));
            return { kind: "deleted" };
          }
          const rows = await tx
            .update(pgRaidRecordsTable)
            .set({ scores, updatedAt: sql`now()` })
            .where(eq(pgRaidRecordsTable.uid, current.uid))
            .returning();
          return { kind: "saved", record: toDomain(rows[0]) };
        }
        const savedEntry: RaidRecordScore = entry;
        if (!current) {
          const rows = await tx
            .insert(pgRaidRecordsTable)
            .values({
              uid: nanoid(12),
              userId,
              ...key,
              scores: [savedEntry],
              rank: null,
              rankRecordedAt: null,
              memo: "",
              parties: [],
            })
            .returning();
          return { kind: "saved", record: toDomain(rows[0]) };
        }
        const scores = [...current.scores.filter((score) => score.defenseType !== entry.defenseType), savedEntry];
        const rows = await tx
          .update(pgRaidRecordsTable)
          .set({ scores, updatedAt: sql`now()` })
          .where(eq(pgRaidRecordsTable.uid, current.uid))
          .returning();
        return { kind: "saved", record: toDomain(rows[0]) };
      }),
    options,
  );
}
