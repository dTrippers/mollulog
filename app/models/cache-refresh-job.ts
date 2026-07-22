import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
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

export const cacheRefreshJobsTable = sqliteTable("cache_refresh_jobs", {
  uid: text().primaryKey(),
  requestedBy: int().notNull(),
  status: text().notNull(),
  activeSlot: int(),
  currentTask: text(),
  completedCount: int().notNull().default(0),
  totalCount: int().notNull(),
  taskResults: text().notNull(),
  startedAt: text(),
  finishedAt: text(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

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

export function parseCacheRefreshTaskResults(value: string): CacheRefreshTaskResults {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid cache refresh task results");
  }

  const candidate = parsed as Record<string, unknown>;
  return Object.fromEntries(
    CACHE_REFRESH_TASK_NAMES.map((name) => [name, parseTaskResult(candidate[name], name)]),
  ) as CacheRefreshTaskResults;
}

function toCacheRefreshJob(row: typeof cacheRefreshJobsTable.$inferSelect): CacheRefreshJob {
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
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getCacheRefreshJobRow(env: Pick<Env, "DB">, uid: string) {
  const [row] = await drizzle(env.DB)
    .select()
    .from(cacheRefreshJobsTable)
    .where(eq(cacheRefreshJobsTable.uid, uid))
    .limit(1);
  return row ?? null;
}

export async function createCacheRefreshJob(
  env: Pick<Env, "DB">,
  input: { uid: string; requestedBy: number },
): Promise<CacheRefreshJob> {
  const taskResults = createPendingCacheRefreshTaskResults();
  await drizzle(env.DB)
    .insert(cacheRefreshJobsTable)
    .values({
      uid: input.uid,
      requestedBy: input.requestedBy,
      status: "queued",
      activeSlot: 1,
      totalCount: CACHE_REFRESH_TASK_NAMES.length,
      taskResults: JSON.stringify(taskResults),
    });

  const created = await getCacheRefreshJobRow(env, input.uid);
  if (!created) {
    throw new Error("Created cache refresh job was not found");
  }
  return toCacheRefreshJob(created);
}

export async function getCacheRefreshJob(env: Pick<Env, "DB">, uid: string): Promise<CacheRefreshJob | null> {
  const row = await getCacheRefreshJobRow(env, uid);
  return row ? toCacheRefreshJob(row) : null;
}

export async function getActiveCacheRefreshJob(env: Pick<Env, "DB">): Promise<CacheRefreshJob | null> {
  const [row] = await drizzle(env.DB)
    .select()
    .from(cacheRefreshJobsTable)
    .where(eq(cacheRefreshJobsTable.activeSlot, 1))
    .limit(1);
  return row ? toCacheRefreshJob(row) : null;
}

export async function getLatestCacheRefreshJob(env: Pick<Env, "DB">): Promise<CacheRefreshJob | null> {
  const [row] = await drizzle(env.DB)
    .select()
    .from(cacheRefreshJobsTable)
    .orderBy(desc(cacheRefreshJobsTable.createdAt))
    .limit(1);
  return row ? toCacheRefreshJob(row) : null;
}

export async function markCacheRefreshJobRunning(env: Pick<Env, "DB">, uid: string): Promise<void> {
  await drizzle(env.DB)
    .update(cacheRefreshJobsTable)
    .set({
      status: "running",
      startedAt: sql`coalesce(${cacheRefreshJobsTable.startedAt}, current_timestamp)`,
      updatedAt: sql`current_timestamp`,
    })
    .where(eq(cacheRefreshJobsTable.uid, uid));
}

export async function markCacheRefreshTaskRunning(
  env: Pick<Env, "DB">,
  uid: string,
  taskName: CacheRefreshTaskName,
): Promise<void> {
  await drizzle(env.DB)
    .update(cacheRefreshJobsTable)
    .set({ currentTask: taskName, updatedAt: sql`current_timestamp` })
    .where(eq(cacheRefreshJobsTable.uid, uid));
}

export async function recordCacheRefreshTaskResult(
  env: Pick<Env, "DB">,
  uid: string,
  taskName: CacheRefreshTaskName,
  result: CacheRefreshTaskResult,
): Promise<CacheRefreshTaskResults> {
  const job = await getCacheRefreshJob(env, uid);
  if (!job) {
    throw new Error(`Cache refresh job not found: ${uid}`);
  }

  const taskResults = { ...job.taskResults, [taskName]: result };
  await drizzle(env.DB)
    .update(cacheRefreshJobsTable)
    .set({
      taskResults: JSON.stringify(taskResults),
      completedCount: countCompletedCacheRefreshTasks(taskResults),
      updatedAt: sql`current_timestamp`,
    })
    .where(eq(cacheRefreshJobsTable.uid, uid));
  return taskResults;
}

export async function recordSkippedCacheRefreshTasks(
  env: Pick<Env, "DB">,
  uid: string,
  taskNames: readonly CacheRefreshTaskName[],
): Promise<CacheRefreshTaskResults> {
  const job = await getCacheRefreshJob(env, uid);
  if (!job) {
    throw new Error(`Cache refresh job not found: ${uid}`);
  }

  const taskResults = { ...job.taskResults };
  for (const taskName of taskNames) {
    taskResults[taskName] = { status: "skipped", durationMs: null, error: null };
  }

  await drizzle(env.DB)
    .update(cacheRefreshJobsTable)
    .set({
      taskResults: JSON.stringify(taskResults),
      completedCount: countCompletedCacheRefreshTasks(taskResults),
      updatedAt: sql`current_timestamp`,
    })
    .where(eq(cacheRefreshJobsTable.uid, uid));
  return taskResults;
}

export async function completeCacheRefreshJob(
  env: Pick<Env, "DB">,
  uid: string,
  status: Extract<CacheRefreshJobStatus, "completed" | "partial_failure">,
  taskResults: CacheRefreshTaskResults,
): Promise<void> {
  await drizzle(env.DB)
    .update(cacheRefreshJobsTable)
    .set({
      status,
      activeSlot: null,
      currentTask: null,
      completedCount: countCompletedCacheRefreshTasks(taskResults),
      taskResults: JSON.stringify(taskResults),
      finishedAt: sql`current_timestamp`,
      updatedAt: sql`current_timestamp`,
    })
    .where(eq(cacheRefreshJobsTable.uid, uid));
}

export async function failCacheRefreshJob(env: Pick<Env, "DB">, uid: string): Promise<void> {
  await drizzle(env.DB)
    .update(cacheRefreshJobsTable)
    .set({
      status: "failed",
      activeSlot: null,
      currentTask: null,
      finishedAt: sql`current_timestamp`,
      updatedAt: sql`current_timestamp`,
    })
    .where(eq(cacheRefreshJobsTable.uid, uid));
}
