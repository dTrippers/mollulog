import { desc, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Client } from "pg";
import { pgCacheRefreshJobsTable } from "~/db/postgres/schema";
import {
  CACHE_REFRESH_TASK_NAMES,
  type CacheRefreshJob,
  type CacheRefreshJobStatus,
  type CacheRefreshTaskName,
  type CacheRefreshTaskResult,
  type CacheRefreshTaskResults,
  countCompletedCacheRefreshTasks,
  createPendingCacheRefreshTaskResults,
  isCacheRefreshTaskName,
} from "~/domain/cache-refresh";
import { normalizeInstant, type UtcIsoString } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

type CacheRefreshDatabase = NodePgDatabase;
type CacheRefreshJobRow = typeof pgCacheRefreshJobsTable.$inferSelect;
type CacheRefreshEnvironment = Pick<Env, "HYPERDRIVE">;

export type CacheRefreshJobOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

const JOB_STATUSES = ["queued", "running", "completed", "partial_failure", "failed"] as const;
const TASK_STATUSES = ["pending", "succeeded", "failed", "skipped"] as const;

function parseJobStatus(value: string): CacheRefreshJobStatus {
  if (JOB_STATUSES.includes(value as CacheRefreshJobStatus)) {
    return value as CacheRefreshJobStatus;
  }
  throw new Error(`Invalid cache refresh job status: ${value}`);
}

function parseTaskResult(value: unknown, name: CacheRefreshTaskName): CacheRefreshTaskResult {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid cache refresh task result: ${name}`);
  }

  const candidate = value as Record<string, unknown>;
  if (!TASK_STATUSES.includes(candidate.status as CacheRefreshTaskResult["status"])) {
    throw new Error(`Invalid cache refresh task status: ${name}`);
  }
  if (candidate.durationMs !== null && typeof candidate.durationMs !== "number") {
    throw new Error(`Invalid cache refresh task duration: ${name}`);
  }
  if (candidate.error !== null && typeof candidate.error !== "string") {
    throw new Error(`Invalid cache refresh task error: ${name}`);
  }

  return {
    status: candidate.status as CacheRefreshTaskResult["status"],
    durationMs: candidate.durationMs as number | null,
    error: candidate.error as string | null,
  };
}

export function parseCacheRefreshTaskResults(value: unknown): CacheRefreshTaskResults {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid cache refresh task results");
  }

  const candidate = parsed as Record<string, unknown>;
  return Object.fromEntries(
    CACHE_REFRESH_TASK_NAMES.map((name) => [name, parseTaskResult(candidate[name], name)]),
  ) as CacheRefreshTaskResults;
}

function normalizePostgresInstant(value: Date | string | null): UtcIsoString | null {
  if (value === null) return null;
  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

function requirePostgresInstant(value: Date | string | null, field: string): UtcIsoString {
  const normalized = normalizePostgresInstant(value);
  if (!normalized) {
    throw new Error(`Missing required PostgreSQL timestamp: ${field}`);
  }
  return normalized;
}

export function toCacheRefreshJob(row: CacheRefreshJobRow): CacheRefreshJob {
  if (row.currentTask !== null && !isCacheRefreshTaskName(row.currentTask)) {
    throw new Error(`Invalid current cache refresh task: ${row.currentTask}`);
  }

  return {
    uid: row.uid,
    requestedBy: row.requestedBy,
    status: parseJobStatus(row.status),
    currentTask: row.currentTask,
    completedCount: row.completedCount,
    totalCount: row.totalCount,
    taskResults: parseCacheRefreshTaskResults(row.taskResults),
    startedAt: normalizePostgresInstant(row.startedAt),
    finishedAt: normalizePostgresInstant(row.finishedAt),
    createdAt: requirePostgresInstant(row.createdAt, "cache_refresh_jobs.created_at"),
    updatedAt: requirePostgresInstant(row.updatedAt, "cache_refresh_jobs.updated_at"),
  };
}

async function withCacheRefreshDatabase<T>(
  env: CacheRefreshEnvironment,
  queryName: string,
  operation: (db: CacheRefreshDatabase, client: Client) => Promise<T>,
  options: CacheRefreshJobOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "cache_refresh_jobs");
        span?.setAttribute("cache_refresh.query_name", queryName);
        return operation(drizzle(client), client);
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.cache_refresh.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

async function getCacheRefreshJobRow(db: CacheRefreshDatabase, uid: string): Promise<CacheRefreshJobRow | null> {
  const [row] = await db.select().from(pgCacheRefreshJobsTable).where(eq(pgCacheRefreshJobsTable.uid, uid)).limit(1);
  return row ?? null;
}

export async function createCacheRefreshJob(
  env: CacheRefreshEnvironment,
  input: { uid: string; requestedBy: number },
  options: CacheRefreshJobOptions = {},
): Promise<CacheRefreshJob> {
  return withCacheRefreshDatabase(
    env,
    "create",
    async (db) => {
      const taskResults = createPendingCacheRefreshTaskResults();
      const [created] = await db
        .insert(pgCacheRefreshJobsTable)
        .values({
          uid: input.uid,
          requestedBy: input.requestedBy,
          status: "queued",
          activeSlot: 1,
          totalCount: CACHE_REFRESH_TASK_NAMES.length,
          taskResults,
        })
        .returning();

      if (!created) {
        throw new Error("Created cache refresh job was not found");
      }
      return toCacheRefreshJob(created);
    },
    options,
  );
}

export async function getCacheRefreshJob(
  env: CacheRefreshEnvironment,
  uid: string,
  options: CacheRefreshJobOptions = {},
): Promise<CacheRefreshJob | null> {
  return withCacheRefreshDatabase(
    env,
    "get_by_uid",
    async (db) => {
      const row = await getCacheRefreshJobRow(db, uid);
      return row ? toCacheRefreshJob(row) : null;
    },
    options,
  );
}

export async function getActiveCacheRefreshJob(
  env: CacheRefreshEnvironment,
  options: CacheRefreshJobOptions = {},
): Promise<CacheRefreshJob | null> {
  return withCacheRefreshDatabase(
    env,
    "get_active",
    async (db) => {
      const [row] = await db
        .select()
        .from(pgCacheRefreshJobsTable)
        .where(eq(pgCacheRefreshJobsTable.activeSlot, 1))
        .limit(1);
      return row ? toCacheRefreshJob(row) : null;
    },
    options,
  );
}

export async function getLatestCacheRefreshJob(
  env: CacheRefreshEnvironment,
  options: CacheRefreshJobOptions = {},
): Promise<CacheRefreshJob | null> {
  return withCacheRefreshDatabase(
    env,
    "get_latest",
    async (db) => {
      const [row] = await db
        .select()
        .from(pgCacheRefreshJobsTable)
        .orderBy(desc(pgCacheRefreshJobsTable.createdAt))
        .limit(1);
      return row ? toCacheRefreshJob(row) : null;
    },
    options,
  );
}

export async function markCacheRefreshJobRunning(
  env: CacheRefreshEnvironment,
  uid: string,
  options: CacheRefreshJobOptions = {},
): Promise<void> {
  await withCacheRefreshDatabase(
    env,
    "mark_job_running",
    async (db) => {
      await db
        .update(pgCacheRefreshJobsTable)
        .set({
          status: "running",
          startedAt: sql`coalesce(${pgCacheRefreshJobsTable.startedAt}, now())`,
          updatedAt: sql`now()`,
        })
        .where(eq(pgCacheRefreshJobsTable.uid, uid));
    },
    options,
  );
}

export async function markCacheRefreshTaskRunning(
  env: CacheRefreshEnvironment,
  uid: string,
  taskName: CacheRefreshTaskName,
  options: CacheRefreshJobOptions = {},
): Promise<void> {
  await withCacheRefreshDatabase(
    env,
    "mark_task_running",
    async (db) => {
      await db
        .update(pgCacheRefreshJobsTable)
        .set({ currentTask: taskName, updatedAt: sql`now()` })
        .where(eq(pgCacheRefreshJobsTable.uid, uid));
    },
    options,
  );
}

export async function recordCacheRefreshTaskResult(
  env: CacheRefreshEnvironment,
  uid: string,
  taskName: CacheRefreshTaskName,
  result: CacheRefreshTaskResult,
  options: CacheRefreshJobOptions = {},
): Promise<CacheRefreshTaskResults> {
  return withCacheRefreshDatabase(
    env,
    "record_task_result",
    async (db) => {
      const row = await getCacheRefreshJobRow(db, uid);
      if (!row) {
        throw new Error(`Cache refresh job not found: ${uid}`);
      }

      const job = toCacheRefreshJob(row);
      const taskResults = { ...job.taskResults, [taskName]: result };
      await db
        .update(pgCacheRefreshJobsTable)
        .set({
          taskResults,
          completedCount: countCompletedCacheRefreshTasks(taskResults),
          updatedAt: sql`now()`,
        })
        .where(eq(pgCacheRefreshJobsTable.uid, uid));
      return taskResults;
    },
    options,
  );
}

export async function recordSkippedCacheRefreshTasks(
  env: CacheRefreshEnvironment,
  uid: string,
  taskNames: readonly CacheRefreshTaskName[],
  options: CacheRefreshJobOptions = {},
): Promise<CacheRefreshTaskResults> {
  return withCacheRefreshDatabase(
    env,
    "record_skipped_tasks",
    async (db) => {
      const row = await getCacheRefreshJobRow(db, uid);
      if (!row) {
        throw new Error(`Cache refresh job not found: ${uid}`);
      }

      const job = toCacheRefreshJob(row);
      const taskResults = { ...job.taskResults };
      for (const taskName of taskNames) {
        taskResults[taskName] = { status: "skipped", durationMs: null, error: null };
      }

      await db
        .update(pgCacheRefreshJobsTable)
        .set({
          taskResults,
          completedCount: countCompletedCacheRefreshTasks(taskResults),
          updatedAt: sql`now()`,
        })
        .where(eq(pgCacheRefreshJobsTable.uid, uid));
      return taskResults;
    },
    options,
  );
}

export async function completeCacheRefreshJob(
  env: CacheRefreshEnvironment,
  uid: string,
  status: Extract<CacheRefreshJobStatus, "completed" | "partial_failure">,
  taskResults: CacheRefreshTaskResults,
  options: CacheRefreshJobOptions = {},
): Promise<void> {
  await withCacheRefreshDatabase(
    env,
    "complete",
    async (db) => {
      await db
        .update(pgCacheRefreshJobsTable)
        .set({
          status,
          activeSlot: null,
          currentTask: null,
          completedCount: countCompletedCacheRefreshTasks(taskResults),
          taskResults,
          finishedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(pgCacheRefreshJobsTable.uid, uid));
    },
    options,
  );
}

export async function failCacheRefreshJob(
  env: CacheRefreshEnvironment,
  uid: string,
  options: CacheRefreshJobOptions = {},
): Promise<void> {
  await withCacheRefreshDatabase(
    env,
    "fail",
    async (db) => {
      await db
        .update(pgCacheRefreshJobsTable)
        .set({
          status: "failed",
          activeSlot: null,
          currentTask: null,
          finishedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(pgCacheRefreshJobsTable.uid, uid));
    },
    options,
  );
}

export async function failStaleCacheRefreshJob(
  env: CacheRefreshEnvironment,
  uid: string,
  staleAfterHours: number,
  options: CacheRefreshJobOptions = {},
): Promise<boolean> {
  return withCacheRefreshDatabase(
    env,
    "fail_stale",
    async (_db, client) => {
      const result = await client.query({
        text: `
          UPDATE cache_refresh_jobs
             SET status = 'failed',
                 active_slot = NULL,
                 current_task = NULL,
                 finished_at = now(),
                 updated_at = now()
           WHERE uid = $1
             AND active_slot = 1
             AND updated_at <= now() - ($2::double precision * INTERVAL '1 hour')`,
        values: [uid, staleAfterHours],
      });
      return (result.rowCount ?? 0) > 0;
    },
    options,
  );
}
