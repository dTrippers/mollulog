import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgStudentStateAuditsTable, pgStudentStatesTable, pgStudentTargetsTable } from "~/db/postgres/schema";
import { StaleStudentStateRequestError } from "~/domain/student-state-errors";

type StudentStateDatabase = NodePgDatabase;
export type StudentStateTransaction = Parameters<Parameters<StudentStateDatabase["transaction"]>[0]>[0];

const STUDENT_STATE_LOCK_KEY_PREFIX = "mollulog:student-state:user:";

export type StudentStateWriteSource =
  | "recruited_student"
  | "recruited_student_batch"
  | "recruitment_result"
  | "student_growth"
  | "student_growth_form"
  | "relationship_level"
  | "student_basic_info"
  | "sync_draft";
export type StudentStateRequestMode = "legacy" | "nullable";

type StudentStatesRow = typeof pgStudentStatesTable.$inferSelect;
type StudentTargetsRow = typeof pgStudentTargetsTable.$inferSelect;

export type StudentStatesPatch = Partial<
  Omit<StudentStatesRow, "id" | "uid" | "userId" | "studentUid" | "createdAt" | "updatedAt" | "deletedAt">
>;
export type StudentTargetsPatch = Partial<
  Omit<StudentTargetsRow, "id" | "uid" | "userId" | "studentUid" | "createdAt" | "updatedAt" | "deletedAt">
>;

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

async function acquireStudentStateLock(db: StudentStateTransaction, userId: number): Promise<void> {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${STUDENT_STATE_LOCK_KEY_PREFIX}${userId}`}, 0))`,
  );
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
/** Serialize a user's canonical writes and audit the actual before/after state in the same transaction. */
export async function withStudentStateWrite<T>(
  db: StudentStateTransaction,
  userId: number,
  studentUids: readonly string[],
  source: StudentStateWriteSource,
  operation: (transaction: StudentStateTransaction) => Promise<T>,
  sourceRef: string | null = null,
  requestMode: StudentStateRequestMode | null = "legacy",
): Promise<T> {
  // Keep rejecting forms from before the cutover; their full-value payloads have different null semantics.
  if (requestMode != null && requestMode !== "nullable") throw new StaleStudentStateRequestError();
  const uniqueStudentUids = [...new Set(studentUids)].sort();
  if (uniqueStudentUids.length === 0) return operation(db);
  await acquireStudentStateLock(db, userId);
  const before = await readCanonicalStudentStates(db, userId, uniqueStudentUids);
  const result = await operation(db);
  const after = await readCanonicalStudentStates(db, userId, uniqueStudentUids);
  for (const studentUid of uniqueStudentUids) {
    const prior = before.get(studentUid) ?? { state: null, target: null };
    const next = after.get(studentUid) ?? { state: null, target: null };
    if (equalValue(canonicalAuditSnapshot(prior.state, prior.target), canonicalAuditSnapshot(next.state, next.target)))
      continue;
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
