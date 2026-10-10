import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgRelationshipLevelsTable, pgStudentStatesTable, pgStudentTargetsTable } from "~/db/postgres/schema";
import {
  isStudentNullableSemanticsEnabledInTransaction,
  patchCanonicalRelationship,
  type StudentStateRequestMode,
  type StudentStateWriteMode,
  withStudentStateProjection,
} from "~/db/postgres/student-state-projection";
import {
  getRelationshipGiftPlanValidationError,
  getRelationshipLevelValidationError,
  type RelationshipLevelInput,
} from "~/domain/relationship-level";
import { ActionValidationError } from "~/lib/action-errors";
import { withPostgresClient } from "~/lib/postgres.server";

export {
  getAccumulatedRelationshipExpForLevel,
  getRelationshipLevelValidationError,
  type RelationshipLevelInput,
} from "~/domain/relationship-level";

const PG_IN_QUERY_CHUNK_SIZE = 500;

export const relationshipLevelsTable = pgRelationshipLevelsTable;

export async function getStudentStateWriteMode(env: Env): Promise<StudentStateWriteMode> {
  return withPostgresClient(env, async (client) => {
    const enabled = await drizzle(client).transaction(async (tx) => isStudentNullableSemanticsEnabledInTransaction(tx));
    return enabled ? "nullable" : "legacy";
  });
}

export type RelationshipLevel = {
  uid: string;
  studentId: string;
  currentLevel: number | null;
  currentExp: number | null;
  targetLevel: number | null;
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
  input: Partial<RelationshipLevelInput> & { currentExp?: number | null },
  requestMode: StudentStateRequestMode = "legacy",
) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      await withStudentStateProjection(
        tx,
        senseiId,
        [studentId],
        "relationship_level",
        async (lockedTx, context) => {
          if (context.mode === "nullable") {
            const validationError = getRelationshipLevelValidationError(
              { currentLevel: input.currentLevel ?? null, targetLevel: input.targetLevel ?? null },
              true,
            );
            if (validationError) throw new ActionValidationError(validationError);
            await patchCanonicalRelationship(lockedTx, senseiId, studentId, {
              ...(Object.hasOwn(input, "currentLevel") ? { currentLevel: input.currentLevel } : {}),
              ...(Object.hasOwn(input, "currentExp") ? { currentExp: input.currentExp } : {}),
              ...(Object.hasOwn(input, "targetLevel") ? { targetLevel: input.targetLevel } : {}),
            });
            return;
          }
          const [existing] = await lockedTx
            .select()
            .from(relationshipLevelsTable)
            .where(and(eq(relationshipLevelsTable.userId, senseiId), eq(relationshipLevelsTable.studentId, studentId)))
            .limit(1)
            .for("update");
          if (!Object.hasOwn(input, "currentLevel") || !Object.hasOwn(input, "targetLevel")) {
            throw new ActionValidationError("현재와 목표 인연 랭크를 입력해주세요");
          }
          const resolved = resolveRelationshipLevelInput(existing ?? null, {
            currentLevel: input.currentLevel ?? null,
            targetLevel: input.targetLevel ?? null,
          });

          if (resolved == null) {
            await lockedTx
              .delete(relationshipLevelsTable)
              .where(
                and(eq(relationshipLevelsTable.userId, senseiId), eq(relationshipLevelsTable.studentId, studentId)),
              );
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
        },
        null,
        requestMode,
      );
    });
  });
}

export async function upsertRelationshipLevel(
  env: Env,
  senseiId: number,
  studentId: string,
  currentLevel: number | null | undefined,
  currentExp: number | null | undefined,
  targetLevel: number | null | undefined,
  items: Record<string, number> | undefined,
  requestMode: StudentStateRequestMode | null = "legacy",
) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      await withStudentStateProjection(
        tx,
        senseiId,
        [studentId],
        "relationship_level",
        async (lockedTx, context) => {
          if (context.mode === "nullable") {
            const validationError = getRelationshipLevelValidationError(
              { currentLevel: currentLevel ?? null, targetLevel: targetLevel ?? null },
              true,
            );
            if (validationError) throw new ActionValidationError(validationError);
            const giftPlanError = items == null ? null : getRelationshipGiftPlanValidationError(items);
            if (giftPlanError) throw new ActionValidationError(giftPlanError);
            await patchCanonicalRelationship(lockedTx, senseiId, studentId, {
              ...(currentLevel !== undefined ? { currentLevel } : {}),
              ...(currentExp !== undefined ? { currentExp } : {}),
              ...(targetLevel !== undefined ? { targetLevel } : {}),
              ...(items !== undefined ? { items } : {}),
            });
            return;
          }
          const validationError = getRelationshipLevelValidationError({
            currentLevel: currentLevel ?? null,
            targetLevel: targetLevel ?? null,
          });
          if (validationError) throw new ActionValidationError(validationError);
          const giftPlanError = items == null ? null : getRelationshipGiftPlanValidationError(items);
          if (giftPlanError) throw new ActionValidationError(giftPlanError);
          if (currentLevel == null || targetLevel == null || items == null) {
            throw new ActionValidationError("현재와 목표 인연 랭크를 입력해주세요");
          }
          await lockedTx
            .insert(relationshipLevelsTable)
            .values({
              uid: nanoid(8),
              userId: senseiId,
              studentId,
              currentLevel,
              currentExp: currentExp ?? null,
              targetLevel,
              items,
            })
            .onConflictDoUpdate({
              target: [relationshipLevelsTable.userId, relationshipLevelsTable.studentId],
              set: { currentLevel, currentExp: currentExp ?? null, targetLevel, items, updatedAt: new Date() },
            });
        },
        null,
        requestMode,
      );
    });
  });
}

export async function removeRelationshipLevel(env: Env, senseiId: number, studentId: string) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      await withStudentStateProjection(
        tx,
        senseiId,
        [studentId],
        "relationship_level",
        async (lockedTx, context) => {
          if (context.mode === "nullable") {
            await patchCanonicalRelationship(lockedTx, senseiId, studentId, {
              currentLevel: null,
              currentExp: null,
              targetLevel: null,
              items: {},
            });
            return;
          }
          await lockedTx
            .delete(relationshipLevelsTable)
            .where(and(eq(relationshipLevelsTable.userId, senseiId), eq(relationshipLevelsTable.studentId, studentId)));
        },
        null,
        null,
      );
    });
  });
}
