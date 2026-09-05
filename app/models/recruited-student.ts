import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgRecruitedStudentsTable } from "~/db/postgres/schema";
import {
  ABILITY_RELEASE_MAX_LEVEL,
  assertAbilityReleaseAvailable,
  assertWeaponLevelRange,
  EQUIPMENT_LEVEL_MAX_LEVEL,
  getWeaponLevelMaxByTier,
  WEAPON_LEVEL_MAX_LEVEL,
} from "~/domain/student-growth-state";
import { withPostgresClient } from "~/lib/postgres.server";

const PG_IN_QUERY_CHUNK_SIZE = 500;
export const MAX_RECRUITED_STUDENT_BATCH_SIZE = 500;
type RecruitedStudentsDb = NodePgDatabase;
export type RecruitedStudentsTransaction = Pick<RecruitedStudentsDb, "insert">;

export const recruitedStudentsTable = pgRecruitedStudentsTable;

export type RecruitedStudentCurrentState = {
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
  weaponLevel: number | null;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
};

type RecruitedStudentEquipmentLevelFields = {
  equip1Level?: number | null;
  equip2Level?: number | null;
  equip3Level?: number | null;
};

export type RecruitedStudentCurrentStateInput = RecruitedStudentCurrentState & RecruitedStudentEquipmentLevelFields;

export type RecruitedStudentCurrentStatePatch = Partial<RecruitedStudentCurrentStateInput> & {
  tier?: number;
};

export type RecruitedStudentCurrentStatePatchOptions = {
  equipmentMaxLevelsByTier?: readonly [
    ReadonlyMap<number, number>,
    ReadonlyMap<number, number>,
    ReadonlyMap<number, number>,
  ];
};

export type RecruitedStudent = RecruitedStudentCurrentState &
  RecruitedStudentEquipmentLevelFields & {
    uid: string;
    studentUid: string;
    tier: number;
  };

export type RecruitedStudentBatchInput = {
  studentUid: string;
  tier: number;
};

export class RecruitedStudentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecruitedStudentValidationError";
  }
}

const currentStateRanges = {
  level: { label: "레벨", min: 1, max: 90 },
  skillEx: { label: "EX 스킬", min: 1, max: 5 },
  skillNormal: { label: "기본 스킬", min: 1, max: 10 },
  skillEnhanced: { label: "강화 스킬", min: 1, max: 10 },
  skillSub: { label: "서브 스킬", min: 1, max: 10 },
  equip1: { label: "장비 1", min: 1, max: 10 },
  equip2: { label: "장비 2", min: 1, max: 10 },
  equip3: { label: "장비 3", min: 1, max: 10 },
  equip1Level: { label: "장비 1 레벨", min: 1, max: EQUIPMENT_LEVEL_MAX_LEVEL },
  equip2Level: { label: "장비 2 레벨", min: 1, max: EQUIPMENT_LEVEL_MAX_LEVEL },
  equip3Level: { label: "장비 3 레벨", min: 1, max: EQUIPMENT_LEVEL_MAX_LEVEL },
  equipSpecial: { label: "애용품", min: 1, max: 2 },
  weaponLevel: { label: "고유무기 레벨", min: 0, max: WEAPON_LEVEL_MAX_LEVEL },
  abilityHp: { label: "능력 개방 체력", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  abilityAtk: { label: "능력 개방 공격력", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  abilityHeal: { label: "능력 개방 치유력", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
} satisfies Record<keyof RecruitedStudentCurrentStateInput, { label: string; min: number; max?: number }>;

type RecruitedStudentRow = typeof pgRecruitedStudentsTable.$inferSelect;

function toModel(recruitedStudent: RecruitedStudentRow): RecruitedStudent {
  return {
    uid: recruitedStudent.uid,
    studentUid: recruitedStudent.studentUid,
    tier: recruitedStudent.tier,
    level: recruitedStudent.level,
    skillEx: recruitedStudent.skillEx,
    skillNormal: recruitedStudent.skillNormal,
    skillEnhanced: recruitedStudent.skillEnhanced,
    skillSub: recruitedStudent.skillSub,
    equip1: recruitedStudent.equip1,
    equip2: recruitedStudent.equip2,
    equip3: recruitedStudent.equip3,
    equip1Level: recruitedStudent.equip1Level,
    equip2Level: recruitedStudent.equip2Level,
    equip3Level: recruitedStudent.equip3Level,
    equipSpecial: recruitedStudent.equipSpecial,
    weaponLevel: recruitedStudent.weaponLevel,
    abilityHp: recruitedStudent.abilityHp,
    abilityAtk: recruitedStudent.abilityAtk,
    abilityHeal: recruitedStudent.abilityHeal,
  };
}

function withDb<T>(env: Env, operation: (db: RecruitedStudentsDb) => Promise<T>): Promise<T> {
  return withPostgresClient(env, (client) => operation(drizzle(client)));
}

export function validateRecruitedStudentCurrentStateInput(input: RecruitedStudentCurrentStateInput) {
  for (const [field, range] of Object.entries(currentStateRanges) as [
    keyof RecruitedStudentCurrentStateInput,
    { label: string; min: number; max?: number },
  ][]) {
    const value = input[field];
    if (value == null) {
      continue;
    }

    if (!Number.isInteger(value)) {
      throw new Error(`${range.label}은(는) 숫자만 입력할 수 있어요`);
    }

    if (value < range.min || (range.max != null && value > range.max)) {
      if (range.max == null) {
        throw new Error(`${range.label}은(는) ${range.min} 이상만 입력할 수 있어요`);
      }
      throw new Error(`${range.label}은(는) ${range.min}부터 ${range.max} 사이만 입력할 수 있어요`);
    }
  }
}

export async function getRecruitedStudents(
  env: Env,
  senseiId: number,
  studentUids?: readonly string[],
): Promise<RecruitedStudent[]> {
  if (studentUids?.length === 0) return [];
  return withDb(env, async (db) => {
    if (!studentUids) {
      const rows = await db
        .select()
        .from(pgRecruitedStudentsTable)
        .where(eq(pgRecruitedStudentsTable.userId, senseiId));
      return rows.map(toModel);
    }
    const uniqueStudentUids = [...new Set(studentUids)];
    const rows: RecruitedStudentRow[] = [];
    for (let offset = 0; offset < uniqueStudentUids.length; offset += PG_IN_QUERY_CHUNK_SIZE) {
      const chunk = uniqueStudentUids.slice(offset, offset + PG_IN_QUERY_CHUNK_SIZE);
      rows.push(
        ...(await db
          .select()
          .from(pgRecruitedStudentsTable)
          .where(
            and(eq(pgRecruitedStudentsTable.userId, senseiId), inArray(pgRecruitedStudentsTable.studentUid, chunk)),
          )),
      );
    }
    return rows.map(toModel);
  });
}

export async function getRecruitedStudentTiers(env: Env, senseiId: number): Promise<Record<string, number>> {
  const recruitedStudents = await getRecruitedStudents(env, senseiId);
  return recruitedStudents.reduce(
    (acc, { studentUid, tier }) => {
      acc[studentUid] = tier;
      return acc;
    },
    {} as Record<string, number>,
  );
}

export async function upsertRecruitedStudent(env: Env, senseiId: number, studentUid: string, tier: number) {
  if (!Number.isInteger(tier) || tier < 1 || tier > 9) {
    throw new RecruitedStudentValidationError("성급 범위가 올바르지 않아요");
  }
  await withDb(env, async (db) => {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          weaponLevel: pgRecruitedStudentsTable.weaponLevel,
          abilityHp: pgRecruitedStudentsTable.abilityHp,
          abilityAtk: pgRecruitedStudentsTable.abilityAtk,
          abilityHeal: pgRecruitedStudentsTable.abilityHeal,
        })
        .from(pgRecruitedStudentsTable)
        .where(and(eq(pgRecruitedStudentsTable.userId, senseiId), eq(pgRecruitedStudentsTable.studentUid, studentUid)))
        .limit(1)
        .for("update");
      // A missing business-key row cannot be row-locked; the unique index and
      // conflict target serialize a concurrent insert at the write boundary.
      if (existing?.weaponLevel != null && existing.weaponLevel > getWeaponLevelMaxByTier(tier)) {
        throw new RecruitedStudentValidationError("고유무기 레벨이 변경하려는 성급의 상한을 초과해요");
      }
      try {
        assertAbilityReleaseAvailable(
          [existing?.abilityHp, existing?.abilityAtk, existing?.abilityHeal],
          tier,
          "능력 해방",
        );
      } catch (error) {
        if (error instanceof Error) {
          throw new RecruitedStudentValidationError(error.message);
        }
        throw error;
      }
      await tx
        .insert(pgRecruitedStudentsTable)
        .values({ uid: nanoid(8), userId: senseiId, studentUid, tier })
        .onConflictDoUpdate({
          target: [pgRecruitedStudentsTable.userId, pgRecruitedStudentsTable.studentUid],
          set: { tier, updatedAt: new Date() },
        });
    });
  });
}

function normalizeRecruitedStudentBatch(items: readonly RecruitedStudentBatchInput[]): RecruitedStudentBatchInput[] {
  if (!Array.isArray(items)) {
    throw new RecruitedStudentValidationError("학생 일괄 등록 요청이 올바르지 않아요");
  }

  const normalized = new Map<string, RecruitedStudentBatchInput>();
  for (const item of items) {
    if (
      item == null ||
      typeof item !== "object" ||
      typeof item.studentUid !== "string" ||
      item.studentUid.trim() === "" ||
      !Number.isInteger(item.tier) ||
      item.tier < 1 ||
      item.tier > 9
    ) {
      throw new RecruitedStudentValidationError("학생 일괄 등록 요청이 올바르지 않아요");
    }

    const studentUid = item.studentUid.trim();
    if (!normalized.has(studentUid)) {
      normalized.set(studentUid, { studentUid, tier: item.tier });
    }
  }

  if (normalized.size > MAX_RECRUITED_STUDENT_BATCH_SIZE) {
    throw new RecruitedStudentValidationError(
      `학생은 최대 ${MAX_RECRUITED_STUDENT_BATCH_SIZE}명까지 한 번에 등록할 수 있어요`,
    );
  }
  return [...normalized.values()];
}

export async function addRecruitedStudents(env: Env, senseiId: number, items: readonly RecruitedStudentBatchInput[]) {
  const normalizedItems = normalizeRecruitedStudentBatch(items);
  if (normalizedItems.length === 0) return;

  await withDb(env, async (db) => {
    await db
      .insert(pgRecruitedStudentsTable)
      .values(normalizedItems.map(({ studentUid, tier }) => ({ uid: nanoid(8), userId: senseiId, studentUid, tier })))
      .onConflictDoNothing({
        target: [pgRecruitedStudentsTable.userId, pgRecruitedStudentsTable.studentUid],
      });
  });
}

export async function upsertRecruitedStudentFromRecruitmentResult(
  env: Env,
  senseiId: number,
  studentUid: string,
  tier: number,
) {
  return withDb(env, (db) => upsertRecruitedStudentFromRecruitmentResultInTransaction(db, senseiId, studentUid, tier));
}

export async function upsertRecruitedStudentFromRecruitmentResultInTransaction(
  db: RecruitedStudentsTransaction,
  senseiId: number,
  studentUid: string,
  tier: number,
) {
  if (tier < 1 || tier > 9) {
    throw new Error(`Invalid tier: ${tier}`);
  }
  await db
    .insert(pgRecruitedStudentsTable)
    .values({ uid: nanoid(8), userId: senseiId, studentUid, tier })
    .onConflictDoUpdate({
      target: [pgRecruitedStudentsTable.userId, pgRecruitedStudentsTable.studentUid],
      set: {
        tier: sql`greatest(${pgRecruitedStudentsTable.tier}, ${tier})`,
        updatedAt: new Date(),
      },
    });
}

export async function updateRecruitedStudentCurrentState(
  env: Env,
  senseiId: number,
  studentUid: string,
  input: RecruitedStudentCurrentStateInput,
) {
  validateRecruitedStudentCurrentStateInput(input);
  await withDb(env, async (db) => {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ tier: pgRecruitedStudentsTable.tier })
        .from(pgRecruitedStudentsTable)
        .where(and(eq(pgRecruitedStudentsTable.userId, senseiId), eq(pgRecruitedStudentsTable.studentUid, studentUid)))
        .limit(1)
        .for("update");
      assertWeaponLevelRange(input.weaponLevel, existing?.tier ?? null, "고유무기 레벨");
      assertAbilityReleaseAvailable(
        [input.abilityHp, input.abilityAtk, input.abilityHeal],
        existing?.tier ?? null,
        "능력 해방",
      );
      await tx
        .update(pgRecruitedStudentsTable)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(pgRecruitedStudentsTable.userId, senseiId), eq(pgRecruitedStudentsTable.studentUid, studentUid)));
    });
  });
}

/**
 * Applies only the supplied current-state fields to an existing recruited row.
 * The row lock and all cross-field validation happen before the update so a
 * rejected tier change cannot leave a partially updated student behind.
 */
export async function patchRecruitedStudentCurrentState(
  env: Env,
  senseiId: number,
  studentUid: string,
  patch: RecruitedStudentCurrentStatePatch,
  options: RecruitedStudentCurrentStatePatchOptions = {},
): Promise<RecruitedStudent> {
  const { tier, ...currentStatePatch } = patch;
  if (tier !== undefined && (!Number.isInteger(tier) || tier < 1 || tier > 9)) {
    throw new RecruitedStudentValidationError("성급 범위가 올바르지 않아요");
  }
  try {
    validateRecruitedStudentCurrentStateInput(currentStatePatch as RecruitedStudentCurrentStateInput);
  } catch (error) {
    if (error instanceof Error) {
      throw new RecruitedStudentValidationError(error.message);
    }
    throw error;
  }

  return withDb(env, async (db) => {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(pgRecruitedStudentsTable)
        .where(and(eq(pgRecruitedStudentsTable.userId, senseiId), eq(pgRecruitedStudentsTable.studentUid, studentUid)))
        .limit(1)
        .for("update");
      if (!existing) {
        throw new RecruitedStudentValidationError("모집한 학생만 성장 상태를 저장할 수 있어요");
      }

      const nextTier = tier ?? existing.tier;
      const nextWeaponLevel =
        currentStatePatch.weaponLevel !== undefined ? currentStatePatch.weaponLevel : existing.weaponLevel;
      const nextAbilityValues = [
        currentStatePatch.abilityHp !== undefined ? currentStatePatch.abilityHp : existing.abilityHp,
        currentStatePatch.abilityAtk !== undefined ? currentStatePatch.abilityAtk : existing.abilityAtk,
        currentStatePatch.abilityHeal !== undefined ? currentStatePatch.abilityHeal : existing.abilityHeal,
      ];
      try {
        assertWeaponLevelRange(nextWeaponLevel, nextTier, "고유무기 레벨");
        assertAbilityReleaseAvailable(nextAbilityValues, nextTier, "능력 해방");
      } catch (error) {
        if (error instanceof Error) {
          throw new RecruitedStudentValidationError(error.message);
        }
        throw error;
      }
      validateStoredEquipmentLevels(existing, currentStatePatch, options.equipmentMaxLevelsByTier);

      await tx
        .update(pgRecruitedStudentsTable)
        .set(
          tier === undefined
            ? { ...currentStatePatch, updatedAt: new Date() }
            : { ...currentStatePatch, tier: nextTier, updatedAt: new Date() },
        )
        .where(and(eq(pgRecruitedStudentsTable.userId, senseiId), eq(pgRecruitedStudentsTable.studentUid, studentUid)));

      const [updated] = await tx
        .select()
        .from(pgRecruitedStudentsTable)
        .where(and(eq(pgRecruitedStudentsTable.userId, senseiId), eq(pgRecruitedStudentsTable.studentUid, studentUid)))
        .limit(1);
      if (!updated) {
        throw new RecruitedStudentValidationError("학생 성장 상태를 확인하지 못했어요");
      }
      return toModel(updated);
    });
  });
}

function validateStoredEquipmentLevels(
  existing: RecruitedStudentRow,
  patch: Omit<RecruitedStudentCurrentStatePatch, "tier">,
  equipmentMaxLevelsByTier:
    | readonly [ReadonlyMap<number, number>, ReadonlyMap<number, number>, ReadonlyMap<number, number>]
    | undefined,
) {
  if (!equipmentMaxLevelsByTier) return;

  const equipmentTiers = [
    patch.equip1 !== undefined ? patch.equip1 : existing.equip1,
    patch.equip2 !== undefined ? patch.equip2 : existing.equip2,
    patch.equip3 !== undefined ? patch.equip3 : existing.equip3,
  ];
  const equipmentLevels = [existing.equip1Level, existing.equip2Level, existing.equip3Level];
  equipmentLevels.forEach((level, index) => {
    if (level == null) return;
    const tier = equipmentTiers[index];
    const maxLevel = tier == null ? undefined : equipmentMaxLevelsByTier[index]?.get(tier);
    if (maxLevel == null || tier == null) {
      throw new RecruitedStudentValidationError(`장비 ${index + 1} 정보를 확인하지 못했어요`);
    }
    if (level < 1 || level > maxLevel) {
      throw new RecruitedStudentValidationError(
        `장비 ${index + 1} 레벨은(는) 1부터 ${maxLevel} 사이만 입력할 수 있어요`,
      );
    }
  });
}

export async function upsertRecruitedStudentState(
  env: Env,
  senseiId: number,
  studentUid: string,
  tier: number,
  input: RecruitedStudentCurrentStateInput,
) {
  if (!Number.isInteger(tier) || tier < 1 || tier > 9) {
    throw new Error("성급 범위가 올바르지 않아요");
  }
  validateRecruitedStudentCurrentStateInput(input);
  assertWeaponLevelRange(input.weaponLevel, tier, "고유무기 레벨");
  assertAbilityReleaseAvailable([input.abilityHp, input.abilityAtk, input.abilityHeal], tier, "능력 해방");

  await withDb(env, async (db) => {
    await db
      .insert(pgRecruitedStudentsTable)
      .values({ uid: nanoid(8), userId: senseiId, studentUid, tier, ...input })
      .onConflictDoUpdate({
        target: [pgRecruitedStudentsTable.userId, pgRecruitedStudentsTable.studentUid],
        set: { tier, ...input, updatedAt: new Date() },
      });
  });
}

export async function removeRecruitedStudent(env: Env, senseiId: number, studentUid: string) {
  await withDb(env, (db) =>
    db
      .delete(pgRecruitedStudentsTable)
      .where(and(eq(pgRecruitedStudentsTable.userId, senseiId), eq(pgRecruitedStudentsTable.studentUid, studentUid))),
  );
}
