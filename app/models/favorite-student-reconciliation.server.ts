import { drizzle } from "drizzle-orm/node-postgres";
import { getD1FavoriteRecordsPage, getD1FavoriteRecordsThroughId } from "~/db/d1/favorite-students";
import {
  deletePostgresFavoriteRecordsByUids,
  getPostgresFavoriteRecordsByUids,
  getPostgresFavoriteRecordsPage,
  upsertPostgresFavoriteRecords,
} from "~/db/postgres/favorite-students";
import { equalFavoriteRecords, type FavoriteStudentRecord } from "~/domain/favorite-student";
import { withD1Session } from "~/lib/d1-session";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

const PAGE_SIZE = 500;
const SAMPLE_LIMIT = 20;

export type FavoriteReconciliationResult = {
  matched: boolean;
  upsertedRows: number;
  deletedRows: number;
  sourceCount: number;
  targetCount: number;
  missingTargetCount: number;
  unexpectedTargetCount: number;
  mismatchedCount: number;
  missingTargetUids: string[];
  unexpectedTargetUids: string[];
  mismatchedUids: string[];
  durationMs: number;
};

type ReconciliationOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

function appendSample(samples: string[], uid: string): void {
  if (samples.length < SAMPLE_LIMIT) samples.push(uid);
}

async function forEachD1Page(
  env: Pick<Env, "DB">,
  visit: (rows: FavoriteStudentRecord[]) => Promise<void>,
): Promise<number> {
  let afterId = 0;
  let count = 0;
  while (true) {
    const rows = await getD1FavoriteRecordsPage(env, afterId, PAGE_SIZE);
    if (rows.length === 0) return count;
    await visit(rows);
    count += rows.length;
    afterId = rows.at(-1)?.id ?? afterId;
  }
}

export async function reconcileFavoriteStudents(
  env: Env,
  options: ReconciliationOptions = {},
): Promise<FavoriteReconciliationResult> {
  const { ctx, createClient = createPostgresClient } = options;
  const replicaEnv = withD1Session(env, "first-unconstrained");
  const startedAt = performance.now();

  const run = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
    return withPostgresClient(
      env,
      async (client) => {
        const db = drizzle(client);
        let upsertedRows = 0;
        let deletedRows = 0;

        await forEachD1Page(replicaEnv, async (rows) => {
          await upsertPostgresFavoriteRecords(db, rows);
          upsertedRows += rows.length;
        });

        let afterTargetId = 0;
        while (true) {
          const targetRows = await getPostgresFavoriteRecordsPage(db, afterTargetId, PAGE_SIZE);
          if (targetRows.length === 0) break;
          const throughId = targetRows.at(-1)?.id ?? afterTargetId;
          const sourceRows = await getD1FavoriteRecordsThroughId(replicaEnv, afterTargetId, throughId);
          const sourceUids = new Set(sourceRows.map((row) => row.uid));
          deletedRows += await deletePostgresFavoriteRecordsByUids(
            db,
            targetRows.filter((row) => !sourceUids.has(row.uid)).map((row) => row.uid),
          );
          afterTargetId = throughId;
        }

        await client.query(`
          select setval(
            pg_get_serial_sequence('content_favorite_students', 'id'),
            greatest(coalesce(max(id), 1), 1),
            exists(select 1 from content_favorite_students)
          )
          from content_favorite_students
        `);

        let missingTargetCount = 0;
        let mismatchedCount = 0;
        const missingTargetUids: string[] = [];
        const mismatchedUids: string[] = [];
        const sourceCount = await forEachD1Page(replicaEnv, async (sourceRows) => {
          const targetRows = await getPostgresFavoriteRecordsByUids(
            db,
            sourceRows.map((row) => row.uid),
          );
          const targetByUid = new Map(targetRows.map((row) => [row.uid, row]));
          for (const sourceRow of sourceRows) {
            const targetRow = targetByUid.get(sourceRow.uid);
            if (!targetRow) {
              missingTargetCount += 1;
              appendSample(missingTargetUids, sourceRow.uid);
            } else if (!equalFavoriteRecords(sourceRow, targetRow)) {
              mismatchedCount += 1;
              appendSample(mismatchedUids, sourceRow.uid);
            }
          }
        });

        let targetCount = 0;
        let unexpectedTargetCount = 0;
        const unexpectedTargetUids: string[] = [];
        afterTargetId = 0;
        while (true) {
          const targetRows = await getPostgresFavoriteRecordsPage(db, afterTargetId, PAGE_SIZE);
          if (targetRows.length === 0) break;
          targetCount += targetRows.length;
          const throughId = targetRows.at(-1)?.id ?? afterTargetId;
          const sourceRows = await getD1FavoriteRecordsThroughId(replicaEnv, afterTargetId, throughId);
          const sourceUids = new Set(sourceRows.map((row) => row.uid));
          for (const targetRow of targetRows) {
            if (!sourceUids.has(targetRow.uid)) {
              unexpectedTargetCount += 1;
              appendSample(unexpectedTargetUids, targetRow.uid);
            }
          }
          afterTargetId = throughId;
        }

        const matched = missingTargetCount === 0 && unexpectedTargetCount === 0 && mismatchedCount === 0;
        const result: FavoriteReconciliationResult = {
          matched,
          upsertedRows,
          deletedRows,
          sourceCount,
          targetCount,
          missingTargetCount,
          unexpectedTargetCount,
          mismatchedCount,
          missingTargetUids,
          unexpectedTargetUids,
          mismatchedUids,
          durationMs: performance.now() - startedAt,
        };

        span?.setAttribute("favorite.reconciliation.matched", matched);
        span?.setAttribute("favorite.reconciliation.source_count", sourceCount);
        span?.setAttribute("favorite.reconciliation.target_count", targetCount);
        span?.setAttribute("favorite.reconciliation.missing_count", missingTargetCount);
        span?.setAttribute("favorite.reconciliation.unexpected_count", unexpectedTargetCount);
        span?.setAttribute("favorite.reconciliation.mismatched_count", mismatchedCount);
        span?.setAttribute("favorite.reconciliation.duration_ms", result.durationMs);
        return result;
      },
      createClient,
      ctx,
    );
  };

  return ctx ? ctx.tracing.enterSpan("favorites.reconcile", run) : run();
}
