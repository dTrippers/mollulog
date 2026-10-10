import { describe, expect, it, jest } from "@jest/globals";
import type { RecruitedStudentCurrentStateInput } from "~/models/recruited-student";
import {
  getStudentGrowth,
  getStudentGrowthsWithMetadata,
  getStudentGrowthWithMetadata,
  saveStudentGrowthAndCurrentState,
  upsertStudentGrowth,
} from "~/models/student-growth";
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
  it("upserts targets without writing the legacy current columns", async () => {
    const { db, env } = createEnv();
    db.rows.push(rowFactory({ targetLevel: 85 }));

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

    const growthUpsert = db.statements.find((statement) =>
      statement.toLowerCase().startsWith('insert into "student_growth"'),
    );
    expect(growthUpsert).toBeDefined();
    expectNoLegacyCurrentColumnsWritten(growthUpsert ?? "");
    expect(db.rows[0]).toMatchObject({
      level: null,
      skillEx: null,
      equip1: null,
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

  it("keeps the seeded disabled activation record shared-locked and does not audit a no-op legacy write", async () => {
    const { db, env } = createEnv();
    db.rows.push(rowFactory({ targetLevel: 85 }));

    await upsertStudentGrowth(env, 1, "student-a", {
      targetLevel: 85,
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
    });

    expect(
      db.statements.some((statement) => /from "student_state_migration_control"[\s\S]*for share/i.test(statement)),
    ).toBe(true);
    expect(db.tables.student_state_audits).toHaveLength(0);
    expect(db.tables.student_targets).toHaveLength(1);
  });

  it("rejects a legacy writer after nullable semantics activation before changing data", async () => {
    const db = new FakePostgresClient(
      {
        student_state_migration_control: [{ key: "default", nullableSemanticsEnabled: true }],
      },
      "student_growth",
    );
    const env = { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env;

    await expect(
      upsertStudentGrowth(env, 1, "student-a", {
        targetLevel: 90,
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
    ).rejects.toMatchObject({ code: "STUDENT_STATE_STALE" });

    expect(db.tables.student_growth).toHaveLength(0);
    expect(db.tables.student_states).toHaveLength(0);
    expect(db.tables.student_targets).toHaveLength(0);
    expect(db.tables.student_state_audits).toHaveLength(0);
  });

  it("fails closed when the activation control record is missing", async () => {
    const db = new FakePostgresClient({ student_state_migration_control: [] }, "student_growth");
    const env = { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env;

    await expect(
      upsertStudentGrowth(env, 1, "student-a", {
        targetLevel: 90,
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
    ).rejects.toThrow("Student-state migration control row 'default' is missing.");

    expect(db.tables.student_growth).toHaveLength(0);
    expect(db.tables.student_state_audits).toHaveLength(0);
  });

  it("leaves legacy growth shadow current fields untouched while projecting a target update", async () => {
    const { db, env } = createEnv();
    db.rows.push(rowFactory({ level: 80, skillEx: 4, equip1: 7, targetLevel: 85 }));

    await upsertStudentGrowth(env, 1, "student-a", {
      targetLevel: 90,
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
    });

    expect(db.rows[0]).toMatchObject({ level: 80, skillEx: 4, equip1: 7, targetLevel: 90 });
    expect(db.tables.student_states).toHaveLength(0);
    expect(db.tables.student_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentUid: "student-a", targetLevel: 90, studentGrowthUid: db.rows[0].uid }),
      ]),
    );
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
    db.rows.push(rowFactory({ createdAt: "2026-07-01T03:34:56.000Z" }));

    await expect(getStudentGrowthWithMetadata(env, 1, "student-a")).resolves.toMatchObject({
      uid: "growth-a",
      studentUid: "student-a",
      createdAt: "2026-07-01T03:34:56.000Z",
    });
  });

  it("preserves microsecond planner registration timestamps within the same millisecond", async () => {
    const { db, env } = createEnv();
    db.rows.push(
      rowFactory({ id: 1, uid: "growth-a", createdAt: "2026-07-01T03:34:56.123456Z" }),
      rowFactory({ id: 2, uid: "growth-b", studentUid: "student-b", createdAt: "2026-07-01T03:34:56.123789Z" }),
    );

    const growths = await getStudentGrowthsWithMetadata(env, 1);

    expect(growths.map(({ createdAt }) => createdAt)).toEqual([
      "2026-07-01T03:34:56.123456Z",
      "2026-07-01T03:34:56.123789Z",
    ]);
  });

  it("writes current and target values under one projection lock and records one audit", async () => {
    const db = new FakePostgresClient(
      {
        recruited_students: [
          {
            id: 1,
            uid: "recruited-a",
            userId: 1,
            studentUid: "student-a",
            tier: 3,
            level: 75,
            skillEx: null,
            skillNormal: null,
            skillEnhanced: null,
            skillSub: null,
            equip1: null,
            equip2: null,
            equip3: null,
            equipSpecial: null,
            equip1Level: null,
            equip2Level: null,
            equip3Level: null,
            weaponLevel: null,
            abilityHp: null,
            abilityAtk: null,
            abilityHeal: null,
            createdAt: new Date("2026-07-01T03:34:56.123Z"),
            updatedAt: new Date("2026-07-01T03:34:56.123Z"),
          },
        ],
      },
      "student_growth",
    );
    const env = { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env;
    const currentState: RecruitedStudentCurrentStateInput = {
      level: 80,
      skillEx: 4,
      skillNormal: null,
      skillEnhanced: null,
      skillSub: null,
      equip1: null,
      equip2: null,
      equip3: null,
      equipSpecial: null,
      weaponLevel: null,
      abilityHp: null,
      abilityAtk: null,
      abilityHeal: null,
    };
    const targets = {
      targetLevel: 90,
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
    };

    await saveStudentGrowthAndCurrentState(env, 1, "student-a", currentState, targets, 3);

    expect(db.recruitedStudents[0]).toMatchObject({ level: 80, skillEx: 4, tier: 3 });
    expect(db.studentGrowths[0]).toMatchObject({ targetLevel: 90, studentUid: "student-a" });
    expect(db.tables.student_states).toHaveLength(1);
    expect(db.tables.student_states[0]).toMatchObject({
      recruitedStudentUid: "recruited-a",
      tier: 3,
      level: 80,
      skillEx: 4,
    });
    expect(db.tables.student_targets).toHaveLength(1);
    expect(db.tables.student_targets[0]).toMatchObject({ studentGrowthUid: expect.any(String), targetLevel: 90 });
    expect(db.tables.student_state_audits).toHaveLength(1);
    expect(db.tables.student_state_audits[0]).toMatchObject({
      userId: 1,
      actorUserId: 1,
      studentUid: "student-a",
      source: "student_growth_form",
    });
  });

  it("saves targets for an unrecruited student without validating its dropped current values", async () => {
    const { db, env } = createEnv();
    const currentState = {
      level: 999,
      skillEx: null,
      skillNormal: null,
      skillEnhanced: null,
      skillSub: null,
      equip1: null,
      equip2: null,
      equip3: null,
      equipSpecial: null,
      weaponLevel: null,
      abilityHp: null,
      abilityAtk: null,
      abilityHeal: null,
    } as RecruitedStudentCurrentStateInput;

    await saveStudentGrowthAndCurrentState(
      env,
      1,
      "student-a",
      currentState,
      {
        targetLevel: 90,
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
      },
      3,
    );

    expect(db.recruitedStudents).toHaveLength(0);
    expect(db.studentGrowths[0]).toMatchObject({ studentUid: "student-a", targetLevel: 90 });
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
