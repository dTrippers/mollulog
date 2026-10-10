import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import {
  pgRecruitedStudentsTable,
  pgRelationshipLevelsTable,
  pgStudentGrowthTable,
  pgStudentStateAuditsTable,
  pgStudentStateMigrationControlTable,
  pgStudentStatesTable,
  pgStudentTargetsTable,
} from "~/db/postgres/schema";
import { StaleStudentStateRequestError } from "~/domain/student-state-errors";

type StudentStateDatabase = NodePgDatabase;
export type StudentStateTransaction = Parameters<Parameters<StudentStateDatabase["transaction"]>[0]>[0];

const STUDENT_STATE_LOCK_KEY_PREFIX = "mollulog:student-state:user:";
const QUERY_CHUNK_SIZE = 500;

export type StudentStateWriteSource =
  | "recruited_student"
  | "recruited_student_batch"
  | "recruitment_result"
  | "student_growth"
  | "student_growth_form"
  | "relationship_level"
  | "student_basic_info"
  | "sync_draft";

export type StudentStateWriteMode = "legacy" | "nullable";
export type StudentStateRequestMode = StudentStateWriteMode;

type StudentStatesRow = typeof pgStudentStatesTable.$inferSelect;
type StudentTargetsRow = typeof pgStudentTargetsTable.$inferSelect;

export type StudentStatesPatch = Partial<
  Omit<StudentStatesRow, "id" | "uid" | "userId" | "studentUid" | "createdAt" | "updatedAt" | "deletedAt">
>;
export type StudentTargetsPatch = Partial<
  Omit<StudentTargetsRow, "id" | "uid" | "userId" | "studentUid" | "createdAt" | "updatedAt" | "deletedAt">
>;

export type StudentStateWriteContext = {
  mode: StudentStateWriteMode;
  requestMode: StudentStateRequestMode | null;
};

type RecruitedState = {
  uid: string;
  tier: number;
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
  equip1Level: number | null;
  equip2Level: number | null;
  equip3Level: number | null;
  weaponLevel: number | null;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
  createdAt: string;
};

type GrowthTarget = {
  uid: string;
  targetLevel: number | null;
  targetSkillEx: number | null;
  targetSkillNormal: number | null;
  targetSkillEnhanced: number | null;
  targetSkillSub: number | null;
  targetEquip1: number | null;
  targetEquip2: number | null;
  targetEquip3: number | null;
  targetEquipSpecial: number | null;
  targetTier: number | null;
  targetWeaponLevel: number | null;
  targetAbilityHp: number | null;
  targetAbilityAtk: number | null;
  targetAbilityHeal: number | null;
  createdAt: string;
};

type RelationshipState = {
  uid: string;
  currentLevel: number;
  currentExp: number | null;
  targetLevel: number;
  items: Record<string, number>;
  createdAt: string;
};

type LegacyStudentState = {
  recruited: RecruitedState | null;
  growth: GrowthTarget | null;
  relationship: RelationshipState | null;
};

function normalizeGiftPlan(value: unknown, studentUid: string): Record<string, number> {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      throw new Error(`Unable to read legacy relationship gift plan for ${studentUid}`);
    }
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Unable to read legacy relationship gift plan for ${studentUid}`);
  }
  const result: Record<string, number> = {};
  for (const [uid, quantity] of Object.entries(parsed)) {
    if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
      throw new Error(`Unable to read legacy relationship gift plan for ${studentUid}`);
    }
    result[uid] = quantity;
  }
  return result;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function equalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function hasCurrentStateSources(value: LegacyStudentState): boolean {
  return value.recruited !== null || value.relationship !== null;
}

function hasTargetSources(value: LegacyStudentState): boolean {
  return value.growth !== null || value.relationship !== null;
}

async function acquireStudentStateLock(db: StudentStateTransaction, userId: number): Promise<void> {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${STUDENT_STATE_LOCK_KEY_PREFIX}${userId}`}, 0))`,
  );
}

async function readLegacyStudentStates(
  db: StudentStateTransaction,
  userId: number,
  studentUids: readonly string[],
): Promise<Map<string, LegacyStudentState>> {
  const uniqueStudentUids = [...new Set(studentUids)].sort();
  const states = new Map(
    uniqueStudentUids.map((studentUid) => [
      studentUid,
      {
        recruited: null,
        growth: null,
        relationship: null,
      } as LegacyStudentState,
    ]),
  );

  for (let offset = 0; offset < uniqueStudentUids.length; offset += QUERY_CHUNK_SIZE) {
    const chunk = uniqueStudentUids.slice(offset, offset + QUERY_CHUNK_SIZE);
    const recruitedRows = await db
      .select({
        uid: pgRecruitedStudentsTable.uid,
        studentUid: pgRecruitedStudentsTable.studentUid,
        tier: pgRecruitedStudentsTable.tier,
        level: pgRecruitedStudentsTable.level,
        skillEx: pgRecruitedStudentsTable.skillEx,
        skillNormal: pgRecruitedStudentsTable.skillNormal,
        skillEnhanced: pgRecruitedStudentsTable.skillEnhanced,
        skillSub: pgRecruitedStudentsTable.skillSub,
        equip1: pgRecruitedStudentsTable.equip1,
        equip2: pgRecruitedStudentsTable.equip2,
        equip3: pgRecruitedStudentsTable.equip3,
        equipSpecial: pgRecruitedStudentsTable.equipSpecial,
        equip1Level: pgRecruitedStudentsTable.equip1Level,
        equip2Level: pgRecruitedStudentsTable.equip2Level,
        equip3Level: pgRecruitedStudentsTable.equip3Level,
        weaponLevel: pgRecruitedStudentsTable.weaponLevel,
        abilityHp: pgRecruitedStudentsTable.abilityHp,
        abilityAtk: pgRecruitedStudentsTable.abilityAtk,
        abilityHeal: pgRecruitedStudentsTable.abilityHeal,
        createdAt: sql<string>`to_char(${pgRecruitedStudentsTable.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(pgRecruitedStudentsTable)
      .where(and(eq(pgRecruitedStudentsTable.userId, userId), inArray(pgRecruitedStudentsTable.studentUid, chunk)));
    for (const row of recruitedRows) {
      const state = states.get(row.studentUid);
      if (state) state.recruited = row;
    }

    const growthRows = await db
      .select({
        uid: pgStudentGrowthTable.uid,
        studentUid: pgStudentGrowthTable.studentUid,
        targetLevel: pgStudentGrowthTable.targetLevel,
        targetSkillEx: pgStudentGrowthTable.targetSkillEx,
        targetSkillNormal: pgStudentGrowthTable.targetSkillNormal,
        targetSkillEnhanced: pgStudentGrowthTable.targetSkillEnhanced,
        targetSkillSub: pgStudentGrowthTable.targetSkillSub,
        targetEquip1: pgStudentGrowthTable.targetEquip1,
        targetEquip2: pgStudentGrowthTable.targetEquip2,
        targetEquip3: pgStudentGrowthTable.targetEquip3,
        targetEquipSpecial: pgStudentGrowthTable.targetEquipSpecial,
        targetTier: pgStudentGrowthTable.targetTier,
        targetWeaponLevel: pgStudentGrowthTable.targetWeaponLevel,
        targetAbilityHp: pgStudentGrowthTable.targetAbilityHp,
        targetAbilityAtk: pgStudentGrowthTable.targetAbilityAtk,
        targetAbilityHeal: pgStudentGrowthTable.targetAbilityHeal,
        createdAt: sql<string>`to_char(${pgStudentGrowthTable.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(pgStudentGrowthTable)
      .where(and(eq(pgStudentGrowthTable.userId, userId), inArray(pgStudentGrowthTable.studentUid, chunk)));
    for (const row of growthRows) {
      const state = states.get(row.studentUid);
      if (!state) continue;
      state.growth = {
        uid: row.uid,
        targetLevel: row.targetLevel,
        targetSkillEx: row.targetSkillEx,
        targetSkillNormal: row.targetSkillNormal,
        targetSkillEnhanced: row.targetSkillEnhanced,
        targetSkillSub: row.targetSkillSub,
        targetEquip1: row.targetEquip1,
        targetEquip2: row.targetEquip2,
        targetEquip3: row.targetEquip3,
        targetEquipSpecial: row.targetEquipSpecial,
        targetTier: row.targetTier,
        targetWeaponLevel: row.targetWeaponLevel,
        targetAbilityHp: row.targetAbilityHp,
        targetAbilityAtk: row.targetAbilityAtk,
        targetAbilityHeal: row.targetAbilityHeal,
        createdAt: row.createdAt,
      };
    }

    const relationshipRows = await db
      .select({
        uid: pgRelationshipLevelsTable.uid,
        studentUid: pgRelationshipLevelsTable.studentId,
        currentLevel: pgRelationshipLevelsTable.currentLevel,
        currentExp: pgRelationshipLevelsTable.currentExp,
        targetLevel: pgRelationshipLevelsTable.targetLevel,
        items: pgRelationshipLevelsTable.items,
        createdAt: sql<string>`to_char(${pgRelationshipLevelsTable.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(pgRelationshipLevelsTable)
      .where(and(eq(pgRelationshipLevelsTable.userId, userId), inArray(pgRelationshipLevelsTable.studentId, chunk)));
    for (const row of relationshipRows) {
      const state = states.get(row.studentUid);
      if (state) {
        state.relationship = {
          uid: row.uid,
          currentLevel: row.currentLevel,
          currentExp: row.currentExp,
          targetLevel: row.targetLevel,
          items: normalizeGiftPlan(row.items, row.studentUid),
          createdAt: row.createdAt,
        };
      }
    }
  }
  return states;
}

function auditSnapshot(value: LegacyStudentState): Record<string, unknown> {
  return stableValue({
    recruited: value.recruited,
    growth: value.growth,
    relationship: value.relationship,
  }) as Record<string, unknown>;
}

function canonicalAuditSnapshot(
  state: StudentStatesRow | null,
  target: StudentTargetsRow | null,
): Record<string, unknown> {
  const withoutMetadata = (row: StudentStatesRow | StudentTargetsRow | null) => {
    if (!row) return null;
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...value } = row;
    return value;
  };
  return stableValue({
    format: "student_state_v1",
    state: withoutMetadata(state),
    target: withoutMetadata(target),
  }) as Record<string, unknown>;
}

async function readCanonicalStudentStates(
  db: StudentStateTransaction,
  userId: number,
  studentUids: readonly string[],
): Promise<Map<string, { state: StudentStatesRow | null; target: StudentTargetsRow | null }>> {
  const [states, targets] = await Promise.all([
    db
      .select()
      .from(pgStudentStatesTable)
      .where(and(eq(pgStudentStatesTable.userId, userId), inArray(pgStudentStatesTable.studentUid, studentUids))),
    db
      .select()
      .from(pgStudentTargetsTable)
      .where(and(eq(pgStudentTargetsTable.userId, userId), inArray(pgStudentTargetsTable.studentUid, studentUids))),
  ]);
  const byStudent = new Map<string, { state: StudentStatesRow | null; target: StudentTargetsRow | null }>();
  for (const studentUid of studentUids) byStudent.set(studentUid, { state: null, target: null });
  for (const state of states) byStudent.get(state.studentUid)!.state = state;
  for (const target of targets) byStudent.get(target.studentUid)!.target = target;
  return byStudent;
}

function hasStateValues(
  value: Omit<StudentStatesRow, "id" | "uid" | "userId" | "studentUid" | "createdAt" | "updatedAt" | "deletedAt">,
): boolean {
  return Object.entries(value).some(([key, field]) => (key.endsWith("Uid") ? field != null : field != null));
}

function hasTargetValues(
  value: Omit<StudentTargetsRow, "id" | "uid" | "userId" | "studentUid" | "createdAt" | "updatedAt" | "deletedAt">,
): boolean {
  if (value.studentGrowthUid != null || value.relationshipLevelUid != null) return true;
  if (Object.entries(value).some(([key, field]) => key !== "giftPlan" && field != null)) return true;
  return Object.values(value.giftPlan ?? {}).some((quantity) => quantity > 0);
}

/** Apply only the supplied fields and retain a tombstone after the last current source is removed. */
export async function patchCanonicalStudentState(
  db: StudentStateTransaction,
  userId: number,
  studentUid: string,
  patch: StudentStatesPatch,
): Promise<StudentStatesRow | null> {
  const [existing] = await db
    .select()
    .from(pgStudentStatesTable)
    .where(and(eq(pgStudentStatesTable.userId, userId), eq(pgStudentStatesTable.studentUid, studentUid)))
    .limit(1);
  const current = existing ? { ...existing } : null;
  const merged = { ...(existing ?? {}), ...patch } as StudentStatesRow;
  const values = {
    recruitedStudentUid: merged.recruitedStudentUid,
    relationshipLevelUid: merged.relationshipLevelUid,
    tier: merged.tier,
    level: merged.level,
    skillEx: merged.skillEx,
    skillNormal: merged.skillNormal,
    skillEnhanced: merged.skillEnhanced,
    skillSub: merged.skillSub,
    equip1: merged.equip1,
    equip2: merged.equip2,
    equip3: merged.equip3,
    equipSpecial: merged.equipSpecial,
    equip1Level: merged.equip1Level,
    equip2Level: merged.equip2Level,
    equip3Level: merged.equip3Level,
    weaponLevel: merged.weaponLevel,
    abilityHp: merged.abilityHp,
    abilityAtk: merged.abilityAtk,
    abilityHeal: merged.abilityHeal,
    relationshipCurrentLevel: merged.relationshipCurrentLevel,
    relationshipCurrentExp: merged.relationshipCurrentExp,
    recruitedAt: merged.recruitedAt,
  };
  const active = hasStateValues(values);
  if (!existing && !active) return null;
  const deletedAt = active ? null : (existing?.deletedAt ?? new Date());
  const changed =
    !existing ||
    !equalValue(values, {
      recruitedStudentUid: existing.recruitedStudentUid,
      relationshipLevelUid: existing.relationshipLevelUid,
      tier: existing.tier,
      level: existing.level,
      skillEx: existing.skillEx,
      skillNormal: existing.skillNormal,
      skillEnhanced: existing.skillEnhanced,
      skillSub: existing.skillSub,
      equip1: existing.equip1,
      equip2: existing.equip2,
      equip3: existing.equip3,
      equipSpecial: existing.equipSpecial,
      equip1Level: existing.equip1Level,
      equip2Level: existing.equip2Level,
      equip3Level: existing.equip3Level,
      weaponLevel: existing.weaponLevel,
      abilityHp: existing.abilityHp,
      abilityAtk: existing.abilityAtk,
      abilityHeal: existing.abilityHeal,
      relationshipCurrentLevel: existing.relationshipCurrentLevel,
      relationshipCurrentExp: existing.relationshipCurrentExp,
      recruitedAt: existing.recruitedAt,
    }) ||
    !equalValue(deletedAt, existing?.deletedAt ?? null);
  if (!changed) return existing;
  if (!existing) {
    const [inserted] = await db
      .insert(pgStudentStatesTable)
      .values({ uid: nanoid(8), userId, studentUid, ...values, deletedAt })
      .returning();
    return inserted ?? null;
  }
  const [updated] = await db
    .update(pgStudentStatesTable)
    .set({ ...patch, deletedAt, updatedAt: new Date() })
    .where(and(eq(pgStudentStatesTable.userId, userId), eq(pgStudentStatesTable.studentUid, studentUid)))
    .returning();
  return updated ?? current;
}

/** Apply only the supplied goal fields and retain a tombstone after the last target source is removed. */
export async function patchCanonicalStudentTarget(
  db: StudentStateTransaction,
  userId: number,
  studentUid: string,
  patch: StudentTargetsPatch,
): Promise<StudentTargetsRow | null> {
  const [existing] = await db
    .select()
    .from(pgStudentTargetsTable)
    .where(and(eq(pgStudentTargetsTable.userId, userId), eq(pgStudentTargetsTable.studentUid, studentUid)))
    .limit(1);
  const current = existing ? { ...existing } : null;
  const merged = { ...(existing ?? {}), ...patch } as StudentTargetsRow;
  const values = {
    studentGrowthUid: merged.studentGrowthUid,
    relationshipLevelUid: merged.relationshipLevelUid,
    targetLevel: merged.targetLevel,
    targetSkillEx: merged.targetSkillEx,
    targetSkillNormal: merged.targetSkillNormal,
    targetSkillEnhanced: merged.targetSkillEnhanced,
    targetSkillSub: merged.targetSkillSub,
    targetEquip1: merged.targetEquip1,
    targetEquip2: merged.targetEquip2,
    targetEquip3: merged.targetEquip3,
    targetEquipSpecial: merged.targetEquipSpecial,
    targetTier: merged.targetTier,
    targetWeaponLevel: merged.targetWeaponLevel,
    targetAbilityHp: merged.targetAbilityHp,
    targetAbilityAtk: merged.targetAbilityAtk,
    targetAbilityHeal: merged.targetAbilityHeal,
    relationshipTargetLevel: merged.relationshipTargetLevel,
    giftPlan: merged.giftPlan ?? {},
    plannerAddedAt: merged.plannerAddedAt,
  };
  const active = hasTargetValues(values);
  if (!existing && !active) return null;
  const deletedAt = active ? null : (existing?.deletedAt ?? new Date());
  const changed =
    !existing ||
    !equalValue(values, {
      studentGrowthUid: existing.studentGrowthUid,
      relationshipLevelUid: existing.relationshipLevelUid,
      targetLevel: existing.targetLevel,
      targetSkillEx: existing.targetSkillEx,
      targetSkillNormal: existing.targetSkillNormal,
      targetSkillEnhanced: existing.targetSkillEnhanced,
      targetSkillSub: existing.targetSkillSub,
      targetEquip1: existing.targetEquip1,
      targetEquip2: existing.targetEquip2,
      targetEquip3: existing.targetEquip3,
      targetEquipSpecial: existing.targetEquipSpecial,
      targetTier: existing.targetTier,
      targetWeaponLevel: existing.targetWeaponLevel,
      targetAbilityHp: existing.targetAbilityHp,
      targetAbilityAtk: existing.targetAbilityAtk,
      targetAbilityHeal: existing.targetAbilityHeal,
      relationshipTargetLevel: existing.relationshipTargetLevel,
      giftPlan: existing.giftPlan ?? {},
      plannerAddedAt: existing.plannerAddedAt,
    }) ||
    !equalValue(deletedAt, existing?.deletedAt ?? null);
  if (!changed) return existing;
  if (!existing) {
    const [inserted] = await db
      .insert(pgStudentTargetsTable)
      .values({ uid: nanoid(8), userId, studentUid, ...values, deletedAt })
      .returning();
    return inserted ?? null;
  }
  const [updated] = await db
    .update(pgStudentTargetsTable)
    .set({ ...patch, deletedAt, updatedAt: new Date() })
    .where(and(eq(pgStudentTargetsTable.userId, userId), eq(pgStudentTargetsTable.studentUid, studentUid)))
    .returning();
  return updated ?? current;
}

/** Keep the relationship identity paired while allowing current, target, and gift-plan fields to be independent. */
export async function patchCanonicalRelationship(
  db: StudentStateTransaction,
  userId: number,
  studentUid: string,
  patch: {
    currentLevel?: number | null;
    currentExp?: number | null;
    targetLevel?: number | null;
    items?: Record<string, number>;
  },
): Promise<void> {
  const [state, target] = await Promise.all([
    db
      .select()
      .from(pgStudentStatesTable)
      .where(and(eq(pgStudentStatesTable.userId, userId), eq(pgStudentStatesTable.studentUid, studentUid)))
      .limit(1),
    db
      .select()
      .from(pgStudentTargetsTable)
      .where(and(eq(pgStudentTargetsTable.userId, userId), eq(pgStudentTargetsTable.studentUid, studentUid)))
      .limit(1),
  ]).then(([states, targets]) => [states[0] ?? null, targets[0] ?? null] as const);
  if (
    state?.relationshipLevelUid &&
    target?.relationshipLevelUid &&
    state.relationshipLevelUid !== target.relationshipLevelUid
  ) {
    throw new Error("Student relationship projection is inconsistent between current state and targets.");
  }
  const currentLevel = Object.hasOwn(patch, "currentLevel")
    ? (patch.currentLevel ?? null)
    : (state?.relationshipCurrentLevel ?? null);
  // Accumulated EXP takes precedence over the rank in calculations, so a rank change without EXP invalidates it.
  const clearsCurrentExp =
    !Object.hasOwn(patch, "currentExp") && currentLevel !== (state?.relationshipCurrentLevel ?? null);
  const currentExp = Object.hasOwn(patch, "currentExp")
    ? (patch.currentExp ?? null)
    : clearsCurrentExp
      ? null
      : (state?.relationshipCurrentExp ?? null);
  const targetLevel = Object.hasOwn(patch, "targetLevel")
    ? (patch.targetLevel ?? null)
    : (target?.relationshipTargetLevel ?? null);
  const items = Object.hasOwn(patch, "items") ? (patch.items ?? {}) : (target?.giftPlan ?? {});
  const hasPositiveItems = Object.values(items).some((quantity) => quantity > 0);
  const active = currentLevel != null || currentExp != null || targetLevel != null || hasPositiveItems;
  const uid = active ? (state?.relationshipLevelUid ?? target?.relationshipLevelUid ?? nanoid(8)) : null;
  await patchCanonicalStudentState(db, userId, studentUid, {
    ...(Object.hasOwn(patch, "currentLevel") ? { relationshipCurrentLevel: patch.currentLevel ?? null } : {}),
    ...(Object.hasOwn(patch, "currentExp") || clearsCurrentExp ? { relationshipCurrentExp: currentExp } : {}),
    relationshipLevelUid: uid,
  });
  await patchCanonicalStudentTarget(db, userId, studentUid, {
    ...(Object.hasOwn(patch, "targetLevel") ? { relationshipTargetLevel: patch.targetLevel ?? null } : {}),
    ...(Object.hasOwn(patch, "items") ? { giftPlan: patch.items ?? {} } : {}),
    relationshipLevelUid: uid,
  });
}

function expectedStateProjection(
  userId: number,
  studentUid: string,
  value: LegacyStudentState,
  deletedAt: Date | null,
) {
  const recruited = value.recruited;
  const relationship = value.relationship;
  return {
    userId,
    studentUid,
    recruitedStudentUid: recruited?.uid ?? null,
    relationshipLevelUid: relationship?.uid ?? null,
    tier: recruited?.tier ?? null,
    level: recruited?.level ?? null,
    skillEx: recruited?.skillEx ?? null,
    skillNormal: recruited?.skillNormal ?? null,
    skillEnhanced: recruited?.skillEnhanced ?? null,
    skillSub: recruited?.skillSub ?? null,
    equip1: recruited?.equip1 ?? null,
    equip2: recruited?.equip2 ?? null,
    equip3: recruited?.equip3 ?? null,
    equipSpecial: recruited?.equipSpecial ?? null,
    equip1Level: recruited?.equip1Level ?? null,
    equip2Level: recruited?.equip2Level ?? null,
    equip3Level: recruited?.equip3Level ?? null,
    weaponLevel: recruited?.weaponLevel ?? null,
    abilityHp: recruited?.abilityHp ?? null,
    abilityAtk: recruited?.abilityAtk ?? null,
    abilityHeal: recruited?.abilityHeal ?? null,
    relationshipCurrentLevel: relationship?.currentLevel ?? null,
    relationshipCurrentExp: relationship?.currentExp ?? null,
    recruitedAt: recruited?.createdAt ?? null,
    deletedAt,
  };
}

function expectedTargetProjection(
  userId: number,
  studentUid: string,
  value: LegacyStudentState,
  deletedAt: Date | null,
) {
  const growth = value.growth;
  const relationship = value.relationship;
  return {
    userId,
    studentUid,
    studentGrowthUid: growth?.uid ?? null,
    relationshipLevelUid: relationship?.uid ?? null,
    targetLevel: growth?.targetLevel ?? null,
    targetSkillEx: growth?.targetSkillEx ?? null,
    targetSkillNormal: growth?.targetSkillNormal ?? null,
    targetSkillEnhanced: growth?.targetSkillEnhanced ?? null,
    targetSkillSub: growth?.targetSkillSub ?? null,
    targetEquip1: growth?.targetEquip1 ?? null,
    targetEquip2: growth?.targetEquip2 ?? null,
    targetEquip3: growth?.targetEquip3 ?? null,
    targetEquipSpecial: growth?.targetEquipSpecial ?? null,
    targetTier: growth?.targetTier ?? null,
    targetWeaponLevel: growth?.targetWeaponLevel ?? null,
    targetAbilityHp: growth?.targetAbilityHp ?? null,
    targetAbilityAtk: growth?.targetAbilityAtk ?? null,
    targetAbilityHeal: growth?.targetAbilityHeal ?? null,
    relationshipTargetLevel: relationship?.targetLevel ?? null,
    giftPlan: relationship?.items ?? {},
    plannerAddedAt: growth?.createdAt ?? null,
    deletedAt,
  };
}

function projectionMatches(
  existing: Record<string, unknown>,
  expected: Record<string, unknown>,
  exactTimestampAliases: Record<string, string> = {},
): boolean {
  return Object.entries(expected).every(([key, value]) =>
    equalValue(existing[exactTimestampAliases[key] ?? key], value),
  );
}

async function writeProjectionRows(
  db: StudentStateTransaction,
  userId: number,
  values: Map<string, LegacyStudentState>,
  before: Map<string, LegacyStudentState>,
): Promise<void> {
  const studentUids = [...values.keys()];
  if (studentUids.length === 0) return;
  const existingStates = await db
    .select({
      ...getTableColumns(pgStudentStatesTable),
      recruitedAtExact: sql<
        string | null
      >`case when ${pgStudentStatesTable.recruitedAt} is null then null else to_char(${pgStudentStatesTable.recruitedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end`,
    })
    .from(pgStudentStatesTable)
    .where(and(eq(pgStudentStatesTable.userId, userId), inArray(pgStudentStatesTable.studentUid, studentUids)));
  const stateByStudent = new Map(existingStates.map((row) => [row.studentUid, row]));
  const existingTargets = await db
    .select({
      ...getTableColumns(pgStudentTargetsTable),
      plannerAddedAtExact: sql<
        string | null
      >`case when ${pgStudentTargetsTable.plannerAddedAt} is null then null else to_char(${pgStudentTargetsTable.plannerAddedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end`,
    })
    .from(pgStudentTargetsTable)
    .where(and(eq(pgStudentTargetsTable.userId, userId), inArray(pgStudentTargetsTable.studentUid, studentUids)));
  const targetByStudent = new Map(existingTargets.map((row) => [row.studentUid, row]));

  for (const [studentUid, current] of values) {
    const previous = before.get(studentUid) ?? { recruited: null, growth: null, relationship: null };
    const existingState = stateByStudent.get(studentUid);
    const stateDeletedAt = hasCurrentStateSources(current)
      ? null
      : hasCurrentStateSources(previous) || (existingState != null && existingState.deletedAt == null)
        ? new Date()
        : (existingState?.deletedAt ?? null);
    if (hasCurrentStateSources(current) || stateDeletedAt != null) {
      const projected = expectedStateProjection(userId, studentUid, current, stateDeletedAt);
      if (
        !existingState ||
        !projectionMatches(existingState as unknown as Record<string, unknown>, projected, {
          recruitedAt: "recruitedAtExact",
        })
      ) {
        await db
          .insert(pgStudentStatesTable)
          .values({ uid: existingState?.uid ?? nanoid(8), ...projected })
          .onConflictDoUpdate({
            target: [pgStudentStatesTable.userId, pgStudentStatesTable.studentUid],
            set: { ...projected, updatedAt: new Date() },
          });
      }
    }

    const existingTarget = targetByStudent.get(studentUid);
    const targetDeletedAt = hasTargetSources(current)
      ? null
      : hasTargetSources(previous) || (existingTarget != null && existingTarget.deletedAt == null)
        ? new Date()
        : (existingTarget?.deletedAt ?? null);
    if (hasTargetSources(current) || targetDeletedAt != null) {
      const projected = expectedTargetProjection(userId, studentUid, current, targetDeletedAt);
      if (
        !existingTarget ||
        !projectionMatches(existingTarget as unknown as Record<string, unknown>, projected, {
          plannerAddedAt: "plannerAddedAtExact",
        })
      ) {
        await db
          .insert(pgStudentTargetsTable)
          .values({ uid: existingTarget?.uid ?? nanoid(8), ...projected })
          .onConflictDoUpdate({
            target: [pgStudentTargetsTable.userId, pgStudentTargetsTable.studentUid],
            set: { ...projected, updatedAt: new Date() },
          });
      }
    }
  }
}

/** Lock, choose the write semantics, then project legacy writes or audit canonical-only writes. */
export async function withStudentStateProjection<T>(
  db: StudentStateTransaction,
  userId: number,
  studentUids: readonly string[],
  source: StudentStateWriteSource,
  operation: (transaction: StudentStateTransaction, context: StudentStateWriteContext) => Promise<T>,
  sourceRef: string | null = null,
  requestMode: StudentStateRequestMode | null = "legacy",
): Promise<T> {
  const uniqueStudentUids = [...new Set(studentUids)].sort();
  if (uniqueStudentUids.length > 0) await acquireStudentStateLock(db, userId);
  const mode: StudentStateWriteMode = (await isStudentNullableSemanticsEnabledInTransaction(db))
    ? "nullable"
    : "legacy";
  if (requestMode != null && requestMode !== mode) throw new StaleStudentStateRequestError();
  const context = { mode, requestMode } satisfies StudentStateWriteContext;
  if (uniqueStudentUids.length === 0) return operation(db, context);

  if (mode === "nullable") {
    const before = await readCanonicalStudentStates(db, userId, uniqueStudentUids);
    const result = await operation(db, context);
    const after = await readCanonicalStudentStates(db, userId, uniqueStudentUids);
    for (const studentUid of uniqueStudentUids) {
      const prior = before.get(studentUid) ?? { state: null, target: null };
      const next = after.get(studentUid) ?? { state: null, target: null };
      if (
        equalValue(canonicalAuditSnapshot(prior.state, prior.target), canonicalAuditSnapshot(next.state, next.target))
      ) {
        continue;
      }
      await db.insert(pgStudentStateAuditsTable).values({
        userId,
        studentUid,
        actorUserId: userId,
        source,
        sourceRef,
        beforeState: canonicalAuditSnapshot(prior.state, prior.target),
        afterState: canonicalAuditSnapshot(next.state, next.target),
      });
    }
    return result;
  }

  const before = await readLegacyStudentStates(db, userId, uniqueStudentUids);
  const result = await operation(db, context);
  const after = await readLegacyStudentStates(db, userId, uniqueStudentUids);
  await writeProjectionRows(db, userId, after, before);
  for (const studentUid of uniqueStudentUids) {
    const prior = before.get(studentUid) ?? { recruited: null, growth: null, relationship: null };
    const next = after.get(studentUid) ?? { recruited: null, growth: null, relationship: null };
    if (equalValue(auditSnapshot(prior), auditSnapshot(next))) continue;
    await db.insert(pgStudentStateAuditsTable).values({
      userId,
      studentUid,
      actorUserId: userId,
      source,
      sourceRef,
      beforeState: auditSnapshot(prior),
      afterState: auditSnapshot(next),
    });
  }
  return result;
}

/** P1 keeps this server-side semantic switch off until a later release explicitly enables it. */
export async function isStudentNullableSemanticsEnabledInTransaction(db: StudentStateTransaction): Promise<boolean> {
  const [row] = await db
    .select({ enabled: pgStudentStateMigrationControlTable.nullableSemanticsEnabled })
    .from(pgStudentStateMigrationControlTable)
    .where(eq(pgStudentStateMigrationControlTable.key, "default"))
    .for("share")
    .limit(1);
  if (!row) throw new Error("Student-state migration control row 'default' is missing.");
  return row.enabled;
}
