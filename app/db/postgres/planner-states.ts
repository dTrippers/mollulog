import { and, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { normalizeApPlannerState } from "~/domain/ap-planner";
import { normalizePyroxenePlannerOptions, type StoredPyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { type PlannerStateDocumentV1, projectPlannerStateDocument } from "~/domain/planner-state";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import { pgPlannerStatesTable } from "./schema";

export type PlannerStateDatabase = NodePgDatabase;

export type PlannerStateDatabaseOptions = {
  createClient?: PostgresClientFactory;
  ctx?: ExecutionContext;
};

export const PLANNER_STATE_REVISION_CONFLICT_MESSAGE = "다른 탭이나 기기에서 플래너가 바뀌었어요";

export type PlannerStateMutation<T> = (
  transaction: PlannerStateDatabase,
  currentDocument: PlannerStateDocumentV1,
) => Promise<{ document: PlannerStateDocumentV1; result: T }>;

export class PlannerStateRevisionConflictError extends Error {
  constructor() {
    super(PLANNER_STATE_REVISION_CONFLICT_MESSAGE);
    this.name = "PlannerStateRevisionConflictError";
  }
}

class RevisionConflictSignal extends Error {}

const plannerStateLockKey = (userId: number) => `mollulog:planner-state:user:${userId}`;

function emptyPlannerStateDocument(): PlannerStateDocumentV1 {
  return projectPlannerStateDocument({
    resources: [],
    timelineItems: [],
    plannerOptions: [],
    collectedSources: [],
    eventData: [],
    eventShops: [],
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStoredPlannerStateDocument(value: unknown): PlannerStateDocumentV1 {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      throw new Error("Unable to read planner state document");
    }
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.pyroxene) || !isRecord(value.eventShops)) {
    throw new Error("Unable to read planner state document");
  }
  const pyroxene = value.pyroxene;
  if (
    !(pyroxene.resources === null || isRecord(pyroxene.resources)) ||
    !Array.isArray(pyroxene.records) ||
    !isRecord(pyroxene.options) ||
    !Array.isArray(pyroxene.collectedSourceKeys) ||
    !isRecord(pyroxene.eventData) ||
    Object.values(value.eventShops).some((state) => !isRecord(state))
  ) {
    throw new Error("Unable to read planner state document");
  }
  const options = normalizePyroxenePlannerOptions(pyroxene.options as StoredPyroxenePlannerOptions);
  const ap = value.ap == null ? null : normalizeApPlannerState(value.ap);
  if (value.ap != null && ap === null) throw new Error("Unable to read planner state document");
  return {
    ...(value as unknown as PlannerStateDocumentV1),
    pyroxene: { ...pyroxene, options } as PlannerStateDocumentV1["pyroxene"],
    ap,
  };
}

export async function getPlannerStateDocumentInDatabase(
  db: PlannerStateDatabase,
  userId: number,
): Promise<PlannerStateDocumentV1> {
  const [row] = await db.select().from(pgPlannerStatesTable).where(eq(pgPlannerStatesTable.userId, userId)).limit(1);
  return row ? readStoredPlannerStateDocument(row.document) : emptyPlannerStateDocument();
}

async function withPlannerStateRevisionUpdate<T>(
  db: PlannerStateDatabase,
  userId: number,
  mutation: PlannerStateMutation<T>,
  retryable: boolean,
): Promise<T> {
  const attempts = retryable ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await db.transaction(async (transaction) => {
        const tx = transaction as unknown as PlannerStateDatabase;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${plannerStateLockKey(userId)}, 0))`);
        const [row] = await tx
          .select()
          .from(pgPlannerStatesTable)
          .where(eq(pgPlannerStatesTable.userId, userId))
          .limit(1);
        const currentDocument = row ? readStoredPlannerStateDocument(row.document) : emptyPlannerStateDocument();
        const { document, result } = await mutation(tx, currentDocument);
        const updatedAt = new Date();
        const saved = row
          ? await tx
              .update(pgPlannerStatesTable)
              .set({ document, revision: row.revision + 1, updatedAt })
              .where(and(eq(pgPlannerStatesTable.userId, userId), eq(pgPlannerStatesTable.revision, row.revision)))
              .returning({ id: pgPlannerStatesTable.id })
          : await tx
              .insert(pgPlannerStatesTable)
              .values({ userId, revision: 1, document, updatedAt })
              .onConflictDoNothing({ target: pgPlannerStatesTable.userId })
              .returning({ id: pgPlannerStatesTable.id });
        if (saved.length === 0) throw new RevisionConflictSignal();
        return result;
      });
    } catch (error) {
      if (!(error instanceof RevisionConflictSignal)) throw error;
    }
  }
  throw new PlannerStateRevisionConflictError();
}

export async function updatePlannerStateDocumentInDatabase<T>(
  db: PlannerStateDatabase,
  userId: number,
  mutation: PlannerStateMutation<T>,
  options: { retryable?: boolean } = {},
): Promise<T> {
  return withPlannerStateRevisionUpdate(db, userId, mutation, options.retryable ?? false);
}

export async function withPlannerStateUpdate<T>(
  db: PlannerStateDatabase,
  userId: number,
  mutation: PlannerStateMutation<T>,
  options: { retryable?: boolean } = {},
): Promise<T> {
  return updatePlannerStateDocumentInDatabase(db, userId, mutation, options);
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

export function getPostgresPlannerStateDocument(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PlannerStateDatabaseOptions = {},
): Promise<PlannerStateDocumentV1> {
  return withPlannerStatesDatabase(env, (db) => getPlannerStateDocumentInDatabase(db, userId), options);
}

export function updatePostgresPlannerStateDocument<T>(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  mutation: PlannerStateMutation<T>,
  options: PlannerStateDatabaseOptions & { retryable?: boolean } = {},
): Promise<T> {
  const { retryable = false, ...databaseOptions } = options;
  return withPlannerStatesDatabase(
    env,
    (db) => updatePlannerStateDocumentInDatabase(db, userId, mutation, { retryable }),
    databaseOptions,
  );
}
