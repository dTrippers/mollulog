import { describe, expect, it, jest } from "@jest/globals";
import { getStudentGrowth, getStudentGrowthWithMetadata, upsertStudentGrowth } from "~/models/student-growth";
import { FakePostgresClient } from "../../helpers/fake-postgres";

jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));

type StudentGrowthRow = {
  id: number;
  uid: string;
  userId: number;
  studentUid: string;
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
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
  updatedAt: string;
};

function rowFactory(overrides: Partial<StudentGrowthRow>): StudentGrowthRow {
  return {
    id: 1,
    uid: "growth-a",
    userId: 1,
    studentUid: "student-a",
    level: null,
    skillEx: null,
    skillNormal: null,
    skillEnhanced: null,
    skillSub: null,
    equip1: null,
    equip2: null,
    equip3: null,
    equipSpecial: null,
    targetLevel: null,
    targetSkillEx: null,
    targetSkillNormal: null,
    targetSkillEnhanced: null,
    targetSkillSub: null,
    targetEquip1: null,
    targetEquip2: null,
    targetEquip3: null,
    targetEquipSpecial: null,
    targetTier: null,
    targetWeaponLevel: null,
    targetAbilityHp: null,
    targetAbilityAtk: null,
    targetAbilityHeal: null,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function createEnv(db = new FakePostgresClient({}, "student_growth")): { db: FakePostgresClient; env: Env } {
  return {
    db,
    env: { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
  };
}

function normalizeSql(sql: string): string {
  return sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
}

function expectNoLegacyCurrentColumnsWritten(sql: string) {
  const normalizedSql = normalizeSql(sql).split("do update set")[1] ?? "";
  for (const field of [
    "level",
    "skillEx",
    "skillNormal",
    "skillEnhanced",
    "skillSub",
    "equip1",
    "equip2",
    "equip3",
    "equipSpecial",
  ]) {
    expect(normalizedSql).not.toMatch(new RegExp(`\\b${field.toLowerCase()}\\b`));
  }
}

describe("student-growth target state", () => {
  it("upserts targets without changing legacy current columns", async () => {
    const { db, env } = createEnv();
    db.rows.push(rowFactory({ level: 80, skillEx: 4, equip1: 7, targetLevel: 85 }));

    await upsertStudentGrowth(env, 1, "student-a", {
      targetLevel: 90,
      targetSkillEx: 5,
      targetSkillNormal: 10,
      targetSkillEnhanced: 10,
      targetSkillSub: 10,
      targetEquip1: 10,
      targetEquip2: 9,
      targetEquip3: 8,
      targetEquipSpecial: 2,
      targetTier: 6,
      targetWeaponLevel: 0,
      targetAbilityHp: 10,
      targetAbilityAtk: 11,
      targetAbilityHeal: 12,
    });

    expectNoLegacyCurrentColumnsWritten(db.statements[0] ?? "");
    expect(db.rows[0]).toMatchObject({
      level: 80,
      skillEx: 4,
      equip1: 7,
      targetLevel: 90,
      targetSkillEx: 5,
      targetSkillNormal: 10,
      targetSkillEnhanced: 10,
      targetSkillSub: 10,
      targetEquip1: 10,
      targetEquip2: 9,
      targetEquip3: 8,
      targetEquipSpecial: 2,
      targetTier: 6,
      targetWeaponLevel: 0,
      targetAbilityHp: 10,
      targetAbilityAtk: 11,
      targetAbilityHeal: 12,
    });
  });

  it("returns target fields only at the model API", async () => {
    const { db, env } = createEnv();
    db.rows.push(rowFactory({ level: 80, skillEx: 4, targetLevel: 90, targetTier: 5 }));

    await expect(getStudentGrowth(env, 1, "student-a")).resolves.toEqual({
      uid: "growth-a",
      studentUid: "student-a",
      targetLevel: 90,
      targetSkillEx: null,
      targetSkillNormal: null,
      targetSkillEnhanced: null,
      targetSkillSub: null,
      targetEquip1: null,
      targetEquip2: null,
      targetEquip3: null,
      targetEquipSpecial: null,
      targetTier: 5,
      targetWeaponLevel: null,
      targetAbilityHp: null,
      targetAbilityAtk: null,
      targetAbilityHeal: null,
    });
  });

  it("returns the registration timestamp only through the metadata API", async () => {
    const { db, env } = createEnv();
    db.rows.push(rowFactory({ createdAt: "2026-07-01 12:34:56" }));

    await expect(getStudentGrowthWithMetadata(env, 1, "student-a")).resolves.toMatchObject({
      uid: "growth-a",
      studentUid: "student-a",
      createdAt: "2026-07-01T03:34:56.000Z",
    });
  });

  it("rejects out-of-range target values", async () => {
    const { env } = createEnv();

    await expect(
      upsertStudentGrowth(env, 1, "student-a", {
        targetLevel: 91,
        targetSkillEx: null,
        targetSkillNormal: null,
        targetSkillEnhanced: null,
        targetSkillSub: null,
        targetEquip1: null,
        targetEquip2: null,
        targetEquip3: null,
        targetEquipSpecial: null,
        targetTier: null,
        targetWeaponLevel: null,
        targetAbilityHp: null,
        targetAbilityAtk: null,
        targetAbilityHeal: null,
      }),
    ).rejects.toThrow("목표 레벨은(는) 1부터 90 사이만 입력할 수 있어요");
  });

  it("rejects target weapon levels that exceed the target tier cap", async () => {
    const { env } = createEnv();

    await expect(
      upsertStudentGrowth(env, 1, "student-a", {
        targetLevel: null,
        targetSkillEx: null,
        targetSkillNormal: null,
        targetSkillEnhanced: null,
        targetSkillSub: null,
        targetEquip1: null,
        targetEquip2: null,
        targetEquip3: null,
        targetEquipSpecial: null,
        targetTier: 6,
        targetWeaponLevel: 40,
        targetAbilityHp: null,
        targetAbilityAtk: null,
        targetAbilityHeal: null,
      }),
    ).rejects.toThrow("목표 고유무기 레벨은(는) 현재 성급 기준 0부터 30 사이만 입력할 수 있어요");
  });

  it("rejects target ability release levels before the unique weapon is equipped", async () => {
    const { env } = createEnv();

    await expect(
      upsertStudentGrowth(env, 1, "student-a", {
        targetLevel: null,
        targetSkillEx: null,
        targetSkillNormal: null,
        targetSkillEnhanced: null,
        targetSkillSub: null,
        targetEquip1: null,
        targetEquip2: null,
        targetEquip3: null,
        targetEquipSpecial: null,
        targetTier: 5,
        targetWeaponLevel: 0,
        targetAbilityHp: 1,
        targetAbilityAtk: null,
        targetAbilityHeal: null,
      }),
    ).rejects.toThrow("목표 능력 해방은(는) 고유무기 장착 후 입력할 수 있어요");
  });
});
