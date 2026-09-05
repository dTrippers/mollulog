import { and, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgRecruitedStudentsTable, pgRelationshipLevelsTable } from "~/db/postgres/schema";
import { getRelationshipLevelValidationError } from "~/domain/relationship-level";
import { assertAbilityReleaseAvailable, assertWeaponLevelRange } from "~/domain/student-growth-state";
import { ActionValidationError } from "~/lib/action-errors";
import { type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import {
  type RecruitedStudentCurrentStateInput,
  validateRecruitedStudentCurrentStateInput,
} from "~/models/recruited-student";
import { normalizeRelationshipItems } from "~/models/relationship-level";

type StudentBasicInfoDatabase = NodePgDatabase;

export type StudentBasicInfoSaveOptions = {
  createClient?: PostgresClientFactory;
};

export type StudentBasicInfoSaveInput = {
  tier: number;
  currentState: RecruitedStudentCurrentStateInput;
  relationshipBonds: Record<string, number>;
};

function validateSaveInput(input: StudentBasicInfoSaveInput): void {
  if (!Number.isInteger(input.tier) || input.tier < 1 || input.tier > 9) {
    throw new ActionValidationError("성급 범위가 올바르지 않아요");
  }
  try {
    validateRecruitedStudentCurrentStateInput(input.currentState);
    assertWeaponLevelRange(input.currentState.weaponLevel, input.tier, "고유무기 레벨");
    assertAbilityReleaseAvailable(
      [input.currentState.abilityHp, input.currentState.abilityAtk, input.currentState.abilityHeal],
      input.tier,
      "능력 해방",
    );
  } catch (error) {
    throw new ActionValidationError(error instanceof Error ? error.message : "육성 상태를 확인해주세요");
  }

  for (const bond of Object.values(input.relationshipBonds)) {
    const validationError = getRelationshipLevelValidationError({ currentLevel: bond, targetLevel: bond });
    if (validationError) throw new ActionValidationError(validationError);
  }
}

function withStudentBasicInfoDatabase<T>(
  env: Env,
  operation: (db: StudentBasicInfoDatabase) => Promise<T>,
  options: StudentBasicInfoSaveOptions,
): Promise<T> {
  return withPostgresClient(env, (client) => operation(drizzle(client)), options.createClient);
}

export async function saveStudentBasicInfo(
  env: Env,
  senseiId: number,
  studentUid: string,
  input: StudentBasicInfoSaveInput,
  options: StudentBasicInfoSaveOptions = {},
): Promise<void> {
  validateSaveInput(input);

  await withStudentBasicInfoDatabase(
    env,
    async (db) => {
      await db.transaction(async (tx) => {
        await tx
          .insert(pgRecruitedStudentsTable)
          .values({
            uid: nanoid(8),
            userId: senseiId,
            studentUid,
            tier: input.tier,
            ...input.currentState,
          })
          .onConflictDoUpdate({
            target: [pgRecruitedStudentsTable.userId, pgRecruitedStudentsTable.studentUid],
            set: { tier: input.tier, ...input.currentState, updatedAt: new Date() },
          });

        for (const [relationshipStudentUid, relationshipBond] of Object.entries(input.relationshipBonds)) {
          const [existingRelationship] = await tx
            .select()
            .from(pgRelationshipLevelsTable)
            .where(
              and(
                eq(pgRelationshipLevelsTable.userId, senseiId),
                eq(pgRelationshipLevelsTable.studentId, relationshipStudentUid),
              ),
            )
            .limit(1)
            .for("update");
          const targetLevel = Math.max(relationshipBond, existingRelationship?.targetLevel ?? relationshipBond);
          const currentExp =
            existingRelationship?.currentLevel === relationshipBond ? existingRelationship.currentExp : null;
          const items = normalizeRelationshipItems(existingRelationship?.items);
          await tx
            .insert(pgRelationshipLevelsTable)
            .values({
              uid: nanoid(8),
              userId: senseiId,
              studentId: relationshipStudentUid,
              currentLevel: relationshipBond,
              currentExp,
              targetLevel,
              items,
            })
            .onConflictDoUpdate({
              target: [pgRelationshipLevelsTable.userId, pgRelationshipLevelsTable.studentId],
              set: {
                currentLevel: relationshipBond,
                currentExp: sql`case when ${pgRelationshipLevelsTable.currentLevel} = ${relationshipBond} then ${pgRelationshipLevelsTable.currentExp} else ${currentExp} end`,
                targetLevel: sql`greatest(${pgRelationshipLevelsTable.targetLevel}, excluded.target_level)`,
                updatedAt: new Date(),
              },
            });
        }
      });
    },
    options,
  );
}
