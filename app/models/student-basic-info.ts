import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgStudentStatesTable } from "~/db/postgres/schema";
import {
  patchCanonicalRelationship,
  patchCanonicalStudentState,
  type StudentStateRequestMode,
  withStudentStateWrite,
} from "~/db/postgres/student-state";
import { getRelationshipLevelValidationError } from "~/domain/relationship-level";
import {
  type StudentCalculatorCatalog,
  type StudentCalculatorSource,
  validateStudentEquipmentLevels,
} from "~/domain/student-calculator";
import { assertAbilityReleaseAvailable, assertWeaponLevelRange } from "~/domain/student-growth-state";
import { ActionValidationError } from "~/lib/action-errors";
import { type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import {
  type RecruitedStudentCurrentStateInput,
  validateRecruitedStudentCurrentStateInput,
} from "~/models/recruited-student";

type StudentBasicInfoDatabase = NodePgDatabase;

export type StudentBasicInfoSaveOptions = {
  createClient?: PostgresClientFactory;
  requestMode?: StudentStateRequestMode;
  equipmentValidation?: {
    student: Pick<StudentCalculatorSource, "equipments">;
    catalog: StudentCalculatorCatalog | null | undefined;
  };
};

export type StudentBasicInfoSaveInput = {
  tier?: number;
  currentState: Partial<RecruitedStudentCurrentStateInput>;
  relationshipBonds: Record<string, number | null>;
};

type EquipmentValidationState = Pick<
  RecruitedStudentCurrentStateInput,
  "equip1" | "equip2" | "equip3" | "equip1Level" | "equip2Level" | "equip3Level"
>;

export function mergeStudentBasicInfoEquipmentState(
  existing: Partial<EquipmentValidationState> | null | undefined,
  patch: Partial<EquipmentValidationState>,
): EquipmentValidationState {
  const value = (field: keyof EquipmentValidationState) =>
    Object.hasOwn(patch, field) ? (patch[field] ?? null) : (existing?.[field] ?? null);
  return {
    equip1: value("equip1"),
    equip2: value("equip2"),
    equip3: value("equip3"),
    equip1Level: value("equip1Level"),
    equip2Level: value("equip2Level"),
    equip3Level: value("equip3Level"),
  };
}

function validateSaveInput(input: StudentBasicInfoSaveInput): void {
  if (input.tier != null && (!Number.isInteger(input.tier) || input.tier < 1 || input.tier > 9)) {
    throw new ActionValidationError("성급 범위가 올바르지 않아요");
  }
  try {
    validateRecruitedStudentCurrentStateInput(input.currentState);
    if (input.tier != null) {
      assertWeaponLevelRange(input.currentState.weaponLevel, input.tier, "고유무기 레벨");
      assertAbilityReleaseAvailable(
        [input.currentState.abilityHp, input.currentState.abilityAtk, input.currentState.abilityHeal],
        input.tier,
        "능력 해방",
      );
    }
  } catch (error) {
    throw new ActionValidationError(error instanceof Error ? error.message : "육성 상태를 확인해주세요");
  }

  for (const bond of Object.values(input.relationshipBonds)) {
    if (bond == null) continue;
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
        await withStudentStateWrite(
          tx,
          senseiId,
          [studentUid, ...Object.keys(input.relationshipBonds)],
          "student_basic_info",
          async (lockedTx) => {
            const [existing] = await lockedTx
              .select()
              .from(pgStudentStatesTable)
              .where(and(eq(pgStudentStatesTable.userId, senseiId), eq(pgStudentStatesTable.studentUid, studentUid)))
              .limit(1);
            const tier = input.tier ?? existing?.tier ?? null;
            if (tier == null) throw new ActionValidationError("학생 성급을 확인해주세요");
            const equipmentFields = [
              "equip1",
              "equip2",
              "equip3",
              "equip1Level",
              "equip2Level",
              "equip3Level",
            ] as const;
            const hasEquipmentChanges = equipmentFields.some((field) => Object.hasOwn(input.currentState, field));
            try {
              validateRecruitedStudentCurrentStateInput(input.currentState);
              if (hasEquipmentChanges) {
                if (!options.equipmentValidation) {
                  throw new ActionValidationError("장비 정보를 확인하지 못했어요");
                }
                validateStudentEquipmentLevels(
                  options.equipmentValidation.student,
                  options.equipmentValidation.catalog,
                  mergeStudentBasicInfoEquipmentState(existing, input.currentState),
                );
              }
              const nextWeaponLevel = Object.hasOwn(input.currentState, "weaponLevel")
                ? (input.currentState.weaponLevel ?? null)
                : (existing?.weaponLevel ?? null);
              const ability = [
                Object.hasOwn(input.currentState, "abilityHp")
                  ? (input.currentState.abilityHp ?? null)
                  : (existing?.abilityHp ?? null),
                Object.hasOwn(input.currentState, "abilityAtk")
                  ? (input.currentState.abilityAtk ?? null)
                  : (existing?.abilityAtk ?? null),
                Object.hasOwn(input.currentState, "abilityHeal")
                  ? (input.currentState.abilityHeal ?? null)
                  : (existing?.abilityHeal ?? null),
              ];
              assertWeaponLevelRange(nextWeaponLevel, tier, "고유무기 레벨");
              assertAbilityReleaseAvailable(ability, tier, "능력 해방");
            } catch (error) {
              throw new ActionValidationError(error instanceof Error ? error.message : "육성 상태를 확인해주세요");
            }
            await patchCanonicalStudentState(lockedTx, senseiId, studentUid, {
              ...(existing?.recruitedStudentUid == null
                ? { recruitedStudentUid: nanoid(8), recruitedAt: new Date().toISOString() }
                : {}),
              ...(input.tier != null ? { tier: input.tier } : {}),
              ...input.currentState,
            });
            for (const [relationshipStudentUid, relationshipBond] of Object.entries(input.relationshipBonds)) {
              await patchCanonicalRelationship(lockedTx, senseiId, relationshipStudentUid, {
                currentLevel: relationshipBond,
              });
            }
            return;
          },
          null,
          options.requestMode ?? "legacy",
        );
      });
    },
    options,
  );
}
