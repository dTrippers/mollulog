import { asc, desc, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  type PlannerStateDocumentV1,
  type PlannerStateProjectionRows,
  plannerStateDocumentDifferences,
  projectPlannerStateDocument,
} from "~/domain/planner-state";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import {
  pgEventShopStatesTable,
  pgPlannerStatesTable,
  pgPyroxeneCollectedSourcesTable,
  pgPyroxeneEventDataTable,
  pgPyroxeneOwnedResourcesTable,
  pgPyroxenePlannerOptionsTable,
  pgPyroxeneTimelineItemsTable,
} from "./schema";

type PlannerStateDatabase = NodePgDatabase;
type LegacyTableName = keyof PlannerStateProjectionRows;
type MutableProjectionRows = { -readonly [Field in keyof PlannerStateProjectionRows]: unknown[] };
type LegacyRowsByUser = Map<number, MutableProjectionRows>;

export type PlannerStateDatabaseOptions = {
  createClient?: PostgresClientFactory;
  ctx?: ExecutionContext;
};

export type PlannerStateConversionFailure = { userId: number; field: string };

export type PlannerStateBackfillResult = {
  sourceUserCount: number;
  inserted: number;
  alreadyPresent: number;
  wouldInsert: number;
  conversionFailures: PlannerStateConversionFailure[];
};

export type PlannerStateParityMismatch = { userId: number; reasons: string[] };

export type PlannerStateParityResult = {
  sourceUserCounts: Record<LegacyTableName, number>;
  documentCount: number;
  mismatches: PlannerStateParityMismatch[];
  conversionFailures: PlannerStateConversionFailure[];
};

async function readLegacyRows(db: PlannerStateDatabase, userId?: number): Promise<PlannerStateProjectionRows> {
  const [resources, timelineItems, plannerOptions, collectedSources, eventData, eventShops] = await Promise.all([
    userId === undefined
      ? db
          .select()
          .from(pgPyroxeneOwnedResourcesTable)
          .orderBy(desc(pgPyroxeneOwnedResourcesTable.inputAt), desc(pgPyroxeneOwnedResourcesTable.id))
      : db
          .select()
          .from(pgPyroxeneOwnedResourcesTable)
          .where(eq(pgPyroxeneOwnedResourcesTable.userId, userId))
          .orderBy(desc(pgPyroxeneOwnedResourcesTable.inputAt), desc(pgPyroxeneOwnedResourcesTable.id)),
    userId === undefined
      ? db
          .select()
          .from(pgPyroxeneTimelineItemsTable)
          .orderBy(asc(pgPyroxeneTimelineItemsTable.eventAt), asc(pgPyroxeneTimelineItemsTable.uid))
      : db
          .select()
          .from(pgPyroxeneTimelineItemsTable)
          .where(eq(pgPyroxeneTimelineItemsTable.userId, userId))
          .orderBy(asc(pgPyroxeneTimelineItemsTable.eventAt), asc(pgPyroxeneTimelineItemsTable.uid)),
    userId === undefined
      ? db.select().from(pgPyroxenePlannerOptionsTable)
      : db.select().from(pgPyroxenePlannerOptionsTable).where(eq(pgPyroxenePlannerOptionsTable.userId, userId)),
    userId === undefined
      ? db.select().from(pgPyroxeneCollectedSourcesTable).orderBy(asc(pgPyroxeneCollectedSourcesTable.sourceKey))
      : db
          .select()
          .from(pgPyroxeneCollectedSourcesTable)
          .where(eq(pgPyroxeneCollectedSourcesTable.userId, userId))
          .orderBy(asc(pgPyroxeneCollectedSourcesTable.sourceKey)),
    userId === undefined
      ? db.select().from(pgPyroxeneEventDataTable).orderBy(asc(pgPyroxeneEventDataTable.eventUid))
      : db
          .select()
          .from(pgPyroxeneEventDataTable)
          .where(eq(pgPyroxeneEventDataTable.userId, userId))
          .orderBy(asc(pgPyroxeneEventDataTable.eventUid)),
    userId === undefined
      ? db.select().from(pgEventShopStatesTable).orderBy(asc(pgEventShopStatesTable.eventUid))
      : db
          .select()
          .from(pgEventShopStatesTable)
          .where(eq(pgEventShopStatesTable.userId, userId))
          .orderBy(asc(pgEventShopStatesTable.eventUid)),
  ]);

  return { resources, timelineItems, plannerOptions, collectedSources, eventData, eventShops };
}

function groupLegacyRowsByUser(rows: PlannerStateProjectionRows): LegacyRowsByUser {
  const grouped = new Map<number, MutableProjectionRows>();
  const fields = Object.keys(rows) as LegacyTableName[];
  for (const field of fields) {
    for (const value of rows[field]) {
      const userId = (value as { userId?: unknown }).userId;
      if (typeof userId !== "number" || !Number.isSafeInteger(userId)) {
        throw new Error(`Invalid planner state source user id: ${field}`);
      }
      let userRows = grouped.get(userId);
      if (!userRows) {
        userRows = {
          resources: [],
          timelineItems: [],
          plannerOptions: [],
          collectedSources: [],
          eventData: [],
          eventShops: [],
        };
        grouped.set(userId, userRows);
      }
      userRows[field].push(value);
    }
  }
  return grouped;
}

export async function getPlannerStateDocumentFromLegacyInDatabase(
  db: PlannerStateDatabase,
  userId: number,
): Promise<PlannerStateDocumentV1> {
  return projectPlannerStateDocument(await readLegacyRows(db, userId));
}

async function upsertPlannerStateInDatabase(
  db: PlannerStateDatabase,
  userId: number,
  document: PlannerStateDocumentV1,
): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(pgPlannerStatesTable)
    .values({ userId, revision: 1, document, updatedAt })
    .onConflictDoUpdate({
      target: pgPlannerStatesTable.userId,
      set: {
        document,
        revision: sql`${pgPlannerStatesTable.revision} + 1`,
        updatedAt,
      },
    });
}

/**
 * Runs one legacy mutation and its projection in one database transaction.
 * A projection error aborts the transaction, so the legacy write cannot commit
 * without its matching planner document.
 */
export async function withPlannerStateDualWrite<T>(
  db: PlannerStateDatabase,
  userId: number,
  operation: (transaction: PlannerStateDatabase) => Promise<T>,
): Promise<T> {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as PlannerStateDatabase;
    // Serialize same-user writes so later READ COMMITTED projection queries see prior commits.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`mollulog:planner-state:user:${userId}`}, 0))`,
    );
    const result = await operation(tx);
    const document = await getPlannerStateDocumentFromLegacyInDatabase(tx, userId);
    await upsertPlannerStateInDatabase(tx, userId, document);
    return result;
  });
}

export function withPlannerStatesDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  operation: (db: PlannerStateDatabase) => Promise<T>,
  options: PlannerStateDatabaseOptions = {},
): Promise<T> {
  const { createClient = createPostgresClient, ctx } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const run = () => operation(drizzle(client));
      return ctx ? ctx.tracing.enterSpan("postgres.planner_states.operation", run) : run();
    },
    createClient,
    ctx,
  );
}

function emptyProjectionRows(): PlannerStateProjectionRows {
  return {
    resources: [],
    timelineItems: [],
    plannerOptions: [],
    collectedSources: [],
    eventData: [],
    eventShops: [],
  };
}

function rowUserId(value: unknown, field: string): number {
  const userId = (value as { userId?: unknown }).userId;
  if (typeof userId !== "number" || !Number.isSafeInteger(userId)) {
    throw new Error(`Invalid planner state source user id: ${field}`);
  }
  return userId;
}

function sourceUserCounts(rows: PlannerStateProjectionRows): Record<LegacyTableName, number> {
  return Object.fromEntries(
    (Object.keys(rows) as LegacyTableName[]).map((field) => [
      field,
      new Set(rows[field].map((row) => rowUserId(row, field))).size,
    ]),
  ) as Record<LegacyTableName, number>;
}

function collectConversionFailure(userId: number, error: unknown): PlannerStateConversionFailure {
  const field =
    error instanceof Error && "field" in error && typeof error.field === "string" ? error.field : "legacy_rows";
  return { userId, field };
}

export async function backfillPlannerStatesInDatabase(
  db: PlannerStateDatabase,
  options: { dryRun?: boolean } = {},
): Promise<PlannerStateBackfillResult> {
  const sourceRows = await readLegacyRows(db);
  const grouped = groupLegacyRowsByUser(sourceRows);
  const existingRows = await db.select().from(pgPlannerStatesTable);
  const existingUserIds = new Set(existingRows.map((row) => row.userId));
  const result: PlannerStateBackfillResult = {
    sourceUserCount: grouped.size,
    inserted: 0,
    alreadyPresent: 0,
    wouldInsert: 0,
    conversionFailures: [],
  };

  for (const userId of [...grouped.keys()].sort((left, right) => left - right)) {
    let document: PlannerStateDocumentV1;
    try {
      document = projectPlannerStateDocument(grouped.get(userId) ?? emptyProjectionRows());
    } catch (error) {
      result.conversionFailures.push(collectConversionFailure(userId, error));
      continue;
    }

    if (existingUserIds.has(userId)) {
      result.alreadyPresent += 1;
      continue;
    }
    if (options.dryRun) {
      result.wouldInsert += 1;
      continue;
    }

    const [inserted] = await db
      .insert(pgPlannerStatesTable)
      .values({ userId, revision: 1, document, updatedAt: new Date() })
      .onConflictDoNothing({ target: pgPlannerStatesTable.userId })
      .returning({ id: pgPlannerStatesTable.id });
    if (inserted) {
      result.inserted += 1;
      existingUserIds.add(userId);
    } else {
      result.alreadyPresent += 1;
    }
  }
  return result;
}

export async function checkPlannerStateParityInDatabase(db: PlannerStateDatabase): Promise<PlannerStateParityResult> {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as PlannerStateDatabase;
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    const sourceRows = await readLegacyRows(tx);
    const grouped = groupLegacyRowsByUser(sourceRows);
    const documents = await tx.select().from(pgPlannerStatesTable);
    const documentByUser = new Map(documents.map((row) => [row.userId, row.document as unknown]));
    const userIds = new Set([...grouped.keys(), ...documentByUser.keys()]);
    const result: PlannerStateParityResult = {
      sourceUserCounts: sourceUserCounts(sourceRows),
      documentCount: documents.length,
      mismatches: [],
      conversionFailures: [],
    };

    for (const userId of [...userIds].sort((left, right) => left - right)) {
      const source = grouped.get(userId);
      const actual = documentByUser.get(userId);
      if (!source) {
        const reasons = plannerStateDocumentDifferences(projectPlannerStateDocument(emptyProjectionRows()), actual);
        if (reasons.length > 0) {
          result.mismatches.push({ userId, reasons: ["document_without_source_rows", ...reasons] });
        }
        continue;
      }
      try {
        const expected = projectPlannerStateDocument(source);
        if (actual === undefined) {
          result.mismatches.push({ userId, reasons: ["document_missing"] });
          continue;
        }
        const reasons = plannerStateDocumentDifferences(expected, actual);
        if (reasons.length > 0) result.mismatches.push({ userId, reasons });
      } catch (error) {
        result.conversionFailures.push(collectConversionFailure(userId, error));
      }
    }
    return result;
  });
}
