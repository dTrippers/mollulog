import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgRelationshipLevelsTable } from "~/db/postgres/schema";
import { getRelationshipLevelValidationError, type RelationshipLevelInput } from "~/domain/relationship-level";
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

function toItems(value: unknown): Record<string, number> {
  if (typeof value === "string") {
    try {
      return toItems(JSON.parse(value));
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

function toModel(relationshipLevel: typeof relationshipLevelsTable.$inferSelect): RelationshipLevel {
  return {
    uid: relationshipLevel.uid,
    studentId: relationshipLevel.studentId,
    currentLevel: relationshipLevel.currentLevel,
    currentExp: relationshipLevel.currentExp,
    targetLevel: relationshipLevel.targetLevel,
    items: toItems(relationshipLevel.items),
  };
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
    const db = drizzle(client);
    const relationshipLevels: (typeof relationshipLevelsTable.$inferSelect)[] = [];

    if (!studentIds) {
      relationshipLevels.push(
        ...(await db.select().from(relationshipLevelsTable).where(eq(relationshipLevelsTable.userId, senseiId))),
      );
    } else {
      const uniqueStudentIds = [...new Set(studentIds)];
      for (let offset = 0; offset < uniqueStudentIds.length; offset += PG_IN_QUERY_CHUNK_SIZE) {
        const studentIdChunk = uniqueStudentIds.slice(offset, offset + PG_IN_QUERY_CHUNK_SIZE);
        relationshipLevels.push(
          ...(await db
            .select()
            .from(relationshipLevelsTable)
            .where(
              and(
                eq(relationshipLevelsTable.userId, senseiId),
                inArray(relationshipLevelsTable.studentId, studentIdChunk),
              ),
            )),
        );
      }
    }

    return relationshipLevels.map(toModel);
  });
}

export async function getRelationshipLevel(
  env: Env,
  senseiId: number,
  studentId: string,
): Promise<RelationshipLevel | null> {
  return withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const [relationshipLevel] = await db
      .select()
      .from(relationshipLevelsTable)
      .where(and(eq(relationshipLevelsTable.userId, senseiId), eq(relationshipLevelsTable.studentId, studentId)))
      .limit(1);

    return relationshipLevel ? toModel(relationshipLevel) : null;
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

  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db
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
}

export async function removeRelationshipLevel(env: Env, senseiId: number, studentId: string) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db
      .delete(relationshipLevelsTable)
      .where(and(eq(relationshipLevelsTable.userId, senseiId), eq(relationshipLevelsTable.studentId, studentId)));
  });
}
