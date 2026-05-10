import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import { RELATIONSHIP_EXP_TABLE } from "./constants";

export const relationshipLevelsTable = sqliteTable("user_relationship_levels", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  studentId: text().notNull(),
  currentLevel: int().notNull(),
  currentExp: int(),
  targetLevel: int().notNull(),
  items: text().notNull(), // JSON field for itemId and quantity
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type RelationshipLevel = {
  uid: string;
  studentId: string;
  currentLevel: number;
  currentExp: number | null;
  targetLevel: number;
  items: Record<string, number>; // itemId -> quantity
};

export type RelationshipLevelInput = {
  currentLevel: number | null;
  targetLevel: number | null;
};

export function getAccumulatedRelationshipExpForLevel(level: number): number {
  return RELATIONSHIP_EXP_TABLE.find((entry) => entry.level === level)?.accumulatedExp ?? 0;
}

export function getRelationshipLevelValidationError(input: RelationshipLevelInput): string | null {
  const { currentLevel, targetLevel } = input;

  if (currentLevel != null && (!Number.isInteger(currentLevel) || currentLevel < 1 || currentLevel > 100)) {
    return "현재 인연 랭크는 1부터 100 사이만 입력할 수 있어요";
  }

  if (targetLevel != null && (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 100)) {
    return "목표 인연 랭크는 1부터 100 사이만 입력할 수 있어요";
  }

  if (currentLevel != null && targetLevel != null && targetLevel < currentLevel) {
    return "목표 인연 랭크는 현재 인연 랭크보다 낮을 수 없어요";
  }

  return null;
}

function assertValidRelationshipLevelInput(input: RelationshipLevelInput) {
  const validationError = getRelationshipLevelValidationError(input);
  if (validationError) {
    throw new Error(validationError);
  }
}

function toModel(relationshipLevel: typeof relationshipLevelsTable.$inferSelect): RelationshipLevel {
  return {
    uid: relationshipLevel.uid,
    studentId: relationshipLevel.studentId,
    currentLevel: relationshipLevel.currentLevel,
    currentExp: relationshipLevel.currentExp,
    targetLevel: relationshipLevel.targetLevel,
    items: JSON.parse(relationshipLevel.items),
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

export async function getRelationshipLevels(env: Env, senseiId: number): Promise<RelationshipLevel[]> {
  const db = drizzle(env.DB);
  const relationshipLevels = await db
    .select()
    .from(relationshipLevelsTable)
    .where(eq(relationshipLevelsTable.userId, senseiId));
  return relationshipLevels.map(toModel);
}

export async function getRelationshipLevel(
  env: Env,
  senseiId: number,
  studentId: string,
): Promise<RelationshipLevel | null> {
  const db = drizzle(env.DB);
  const relationshipLevel = await db
    .select()
    .from(relationshipLevelsTable)
    .where(and(eq(relationshipLevelsTable.userId, senseiId), eq(relationshipLevelsTable.studentId, studentId)))
    .limit(1);

  return relationshipLevel.length > 0 ? toModel(relationshipLevel[0]) : null;
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

  const db = drizzle(env.DB);
  const uid = nanoid(8);
  const itemsJson = JSON.stringify(items);
  await db
    .insert(relationshipLevelsTable)
    .values({ uid, userId: senseiId, studentId, currentLevel, currentExp, targetLevel, items: itemsJson })
    .onConflictDoUpdate({
      target: [relationshipLevelsTable.userId, relationshipLevelsTable.studentId],
      set: { currentLevel, currentExp, targetLevel, items: itemsJson, updatedAt: sql`current_timestamp` },
    });
}

export async function removeRelationshipLevel(env: Env, senseiId: number, studentId: string) {
  const db = drizzle(env.DB);
  await db
    .delete(relationshipLevelsTable)
    .where(and(eq(relationshipLevelsTable.userId, senseiId), eq(relationshipLevelsTable.studentId, studentId)));
}
