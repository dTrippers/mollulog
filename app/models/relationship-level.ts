import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgRelationshipLevelsTable, pgStudentStatesTable, pgStudentTargetsTable } from "~/db/postgres/schema";
import { withStudentStateProjection } from "~/db/postgres/student-state-projection";
import {
  getRelationshipGiftPlanValidationError,
  getRelationshipLevelValidationError,
  type RelationshipLevelInput,
} from "~/domain/relationship-level";
import { withPostgresClient } from "~/lib/postgres.server";

export {
  getAccumulatedRelationshipExpForLevel,
  getRelationshipLevelValidationError,
  type RelationshipLevelInput,
} from "~/domain/relationship-level";

const PG_IN_QUERY_CHUNK_SIZE = 500;

export const relationshipLevelsTable = pgRelationshipLevelsTable;

export type RelationshipLevel = {
  uid: string;
  studentId: string;
  currentLevel: number;
  currentExp: number | null;
  targetLevel: number;
  items: Record<string, number>;
};

function assertValidRelationshipLevelInput(input: RelationshipLevelInput) {
  const validationError = getRelationshipLevelValidationError(input);
  if (validationError) {
    throw new Error(validationError);
  }
}

export function normalizeRelationshipItems(value: unknown): Record<string, number> {
  if (typeof value === "string") {
    try {
      return normalizeRelationshipItems(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, quantity]) => {
      if (typeof quantity === "number" && Number.isFinite(quantity)) return [[key, quantity]];
      return [];
    }),
  );
}

type RelationshipStateRow = typeof pgStudentStatesTable.$inferSelect;
type RelationshipTargetRow = typeof pgStudentTargetsTable.$inferSelect;

function toModel(state: RelationshipStateRow, target: RelationshipTargetRow): RelationshipLevel {
  if (
    state.relationshipLevelUid == null ||
    target.relationshipLevelUid == null ||
    state.relationshipLevelUid !== target.relationshipLevelUid
  ) {
    throw new Error("Student relationship projection is inconsistent between current state and targets.");
  }
  if (state.relationshipCurrentLevel == null || target.relationshipTargetLevel == null) {
    throw new Error("Student relationship projection is missing required rank data.");
  }

  return {
    uid: state.relationshipLevelUid,
    studentId: state.studentUid,
    currentLevel: state.relationshipCurrentLevel,
    currentExp: state.relationshipCurrentExp,
    targetLevel: target.relationshipTargetLevel,
    items: normalizeRelationshipItems(target.giftPlan),
  };
}

async function readRelationshipLevels(
  db: NodePgDatabase,
  senseiId: number,
  studentIds?: readonly string[],
): Promise<RelationshipLevel[]> {
  const uniqueStudentIds = studentIds ? [...new Set(studentIds)] : undefined;

  return db.transaction(
    async (tx) => {
      const stateRows: RelationshipStateRow[] = [];
      const targetRows: RelationshipTargetRow[] = [];
      const chunks = uniqueStudentIds
        ? Array.from({ length: Math.ceil(uniqueStudentIds.length / PG_IN_QUERY_CHUNK_SIZE) }, (_, index) =>
            uniqueStudentIds.slice(index * PG_IN_QUERY_CHUNK_SIZE, (index + 1) * PG_IN_QUERY_CHUNK_SIZE),
          )
        : [undefined];

      for (const studentIdChunk of chunks) {
        const stateWhere = studentIdChunk
          ? and(
              eq(pgStudentStatesTable.userId, senseiId),
              inArray(pgStudentStatesTable.studentUid, studentIdChunk),
              isNotNull(pgStudentStatesTable.relationshipLevelUid),
              isNull(pgStudentStatesTable.deletedAt),
            )
          : and(
              eq(pgStudentStatesTable.userId, senseiId),
              isNotNull(pgStudentStatesTable.relationshipLevelUid),
              isNull(pgStudentStatesTable.deletedAt),
            );
        const targetWhere = studentIdChunk
          ? and(
              eq(pgStudentTargetsTable.userId, senseiId),
              inArray(pgStudentTargetsTable.studentUid, studentIdChunk),
              isNotNull(pgStudentTargetsTable.relationshipLevelUid),
              isNull(pgStudentTargetsTable.deletedAt),
            )
          : and(
              eq(pgStudentTargetsTable.userId, senseiId),
              isNotNull(pgStudentTargetsTable.relationshipLevelUid),
              isNull(pgStudentTargetsTable.deletedAt),
            );
        const [states, targets] = await Promise.all([
          tx.select().from(pgStudentStatesTable).where(stateWhere),
          tx.select().from(pgStudentTargetsTable).where(targetWhere),
        ]);
        stateRows.push(...states);
        targetRows.push(...targets);
      }

      const targetsByStudentId = new Map(targetRows.map((row) => [row.studentUid, row]));
      const pairedStudentIds = new Set<string>();
      const result = stateRows.map((state) => {
        const target = targetsByStudentId.get(state.studentUid);
        if (!target) {
          throw new Error("Student relationship projection is missing a matching target row.");
        }
        pairedStudentIds.add(state.studentUid);
        return toModel(state, target);
      });

      if (pairedStudentIds.size !== targetRows.length) {
        throw new Error("Student relationship projection is missing a matching current-state row.");
      }

      return result;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export function resolveRelationshipLevelInput(
  existingRelationshipLevel: Pick<RelationshipLevel, "currentLevel" | "currentExp"> | null,
  input: RelationshipLevelInput,
): { currentLevel: number; currentExp: number | null; targetLevel: number } | null {
  if (input.currentLevel == null && input.targetLevel == null) {
    return null;
  }

  const currentLevel = input.currentLevel ?? 1;
  const targetLevel = input.targetLevel ?? currentLevel;

  assertValidRelationshipLevelInput({ currentLevel, targetLevel });

  const currentExp =
    existingRelationshipLevel?.currentLevel === currentLevel ? existingRelationshipLevel.currentExp : null;

  return { currentLevel, currentExp, targetLevel };
}

export async function getRelationshipLevels(
  env: Env,
  senseiId: number,
  studentIds?: readonly string[],
): Promise<RelationshipLevel[]> {
  if (studentIds?.length === 0) return [];

  return withPostgresClient(env, async (client) => {
    return readRelationshipLevels(drizzle(client), senseiId, studentIds);
  });
}

export async function getRelationshipLevel(
  env: Env,
  senseiId: number,
  studentId: string,
): Promise<RelationshipLevel | null> {
  return withPostgresClient(env, async (client) => {
    const [relationshipLevel] = await readRelationshipLevels(drizzle(client), senseiId, [studentId]);
    return relationshipLevel ?? null;
  });
}

export async function updateRelationshipLevel(
  env: Env,
  senseiId: number,
  studentId: string,
  input: RelationshipLevelInput,
) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      await withStudentStateProjection(tx, senseiId, [studentId], "relationship_level", async (lockedTx) => {
        const [existing] = await lockedTx
          .select()
          .from(relationshipLevelsTable)
          .where(and(eq(relationshipLevelsTable.userId, senseiId), eq(relationshipLevelsTable.studentId, studentId)))
          .limit(1)
          .for("update");
        const resolved = resolveRelationshipLevelInput(existing ?? null, input);

        if (resolved == null) {
          await lockedTx
            .delete(relationshipLevelsTable)
            .where(and(eq(relationshipLevelsTable.userId, senseiId), eq(relationshipLevelsTable.studentId, studentId)));
          return;
        }

        await lockedTx
          .insert(relationshipLevelsTable)
          .values({
            uid: nanoid(8),
            userId: senseiId,
            studentId,
            currentLevel: resolved.currentLevel,
            currentExp: resolved.currentExp,
            targetLevel: resolved.targetLevel,
            items: existing ? normalizeRelationshipItems(existing.items) : {},
          })
          .onConflictDoUpdate({
            target: [relationshipLevelsTable.userId, relationshipLevelsTable.studentId],
            set: {
              currentLevel: resolved.currentLevel,
              currentExp: resolved.currentExp,
              targetLevel: resolved.targetLevel,
              updatedAt: new Date(),
            },
          });
      });
    });
  });
}

export async function upsertRelationshipLevel(
  env: Env,
  senseiId: number,
  studentId: string,
  currentLevel: number,
  currentExp: number | null,
  targetLevel: number,
  items: Record<string, number>,
) {
  assertValidRelationshipLevelInput({ currentLevel, targetLevel });
  const giftPlanError = getRelationshipGiftPlanValidationError(items);
  if (giftPlanError) {
    throw new Error(giftPlanError);
  }

  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      await withStudentStateProjection(tx, senseiId, [studentId], "relationship_level", async (lockedTx) => {
        await lockedTx
          .insert(relationshipLevelsTable)
          .values({
            uid: nanoid(8),
            userId: senseiId,
            studentId,
            currentLevel,
            currentExp,
            targetLevel,
            items,
          })
          .onConflictDoUpdate({
            target: [relationshipLevelsTable.userId, relationshipLevelsTable.studentId],
            set: { currentLevel, currentExp, targetLevel, items, updatedAt: new Date() },
          });
      });
    });
  });
}

export async function removeRelationshipLevel(env: Env, senseiId: number, studentId: string) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      await withStudentStateProjection(tx, senseiId, [studentId], "relationship_level", async (lockedTx) => {
        await lockedTx
          .delete(relationshipLevelsTable)
          .where(and(eq(relationshipLevelsTable.userId, senseiId), eq(relationshipLevelsTable.studentId, studentId)));
      });
    });
  });
}
