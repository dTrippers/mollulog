import { describe, expect, it, jest } from "@jest/globals";
import {
  getRelationshipLevel,
  getRelationshipLevels,
  updateRelationshipLevel,
  upsertRelationshipLevel,
} from "../../../app/models/relationship-level";
import { FakePostgresClient } from "../../helpers/fake-postgres";

jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));

function createEnv(db = new FakePostgresClient({}, "student_states")): { db: FakePostgresClient; env: Env } {
  return {
    db,
    env: { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
  };
}

function studentStateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    uid: "state-a",
    userId: 1,
    studentUid: "student-a",
    recruitedStudentUid: null,
    relationshipLevelUid: "relationship-a",
    tier: null,
    level: null,
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
    relationshipCurrentLevel: 20,
    relationshipCurrentExp: 246,
    recruitedAt: null,
    deletedAt: null,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function studentTargetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    uid: "target-row-a",
    userId: 1,
    studentUid: "student-a",
    studentGrowthUid: null,
    relationshipLevelUid: "relationship-a",
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
    relationshipTargetLevel: 10,
    giftPlan: { "gift-x": 3 },
    plannerAddedAt: null,
    deletedAt: null,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("relationship-level", () => {
  it("loads a large student ID filter with PostgreSQL chunking", async () => {
    const { db, env } = createEnv();
    const studentIds = Array.from({ length: 501 }, (_, index) => `student-${index}`);
    db.tables.student_states.push(
      ...studentIds.map((studentId, index) =>
        studentStateRow({
          id: index + 1,
          uid: `state-${index}`,
          studentUid: studentId,
          relationshipLevelUid: `relationship-${index}`,
        }),
      ),
    );
    db.tables.student_targets.push(
      ...studentIds.map((studentId, index) =>
        studentTargetRow({
          id: index + 1,
          uid: `target-row-${index}`,
          studentUid: studentId,
          relationshipLevelUid: `relationship-${index}`,
        }),
      ),
    );

    await expect(getRelationshipLevels(env, 1, [...studentIds, studentIds[0]])).resolves.toHaveLength(501);
    expect(db.selectParameterCounts).toEqual([501, 501, 2, 2]);
  });

  it("combines relationship state and targets and ignores tombstones", async () => {
    const { db, env } = createEnv();
    db.tables.student_states.push(
      studentStateRow(),
      studentStateRow({
        id: 2,
        uid: "state-tombstone",
        studentUid: "student-tombstone",
        relationshipLevelUid: "relationship-tombstone",
        deletedAt: new Date("2026-06-14T00:00:00.000Z"),
      }),
      studentStateRow({ id: 3, userId: 2, studentUid: "student-other-user" }),
    );
    db.tables.student_targets.push(
      studentTargetRow(),
      studentTargetRow({
        id: 2,
        uid: "target-row-tombstone",
        studentUid: "student-tombstone",
        relationshipLevelUid: "relationship-tombstone",
        deletedAt: new Date("2026-06-14T00:00:00.000Z"),
      }),
      studentTargetRow({ id: 3, userId: 2, studentUid: "student-other-user" }),
    );

    await expect(getRelationshipLevels(env, 1)).resolves.toEqual([
      {
        uid: "relationship-a",
        studentId: "student-a",
        currentLevel: 20,
        currentExp: 246,
        targetLevel: 10,
        items: { "gift-x": 3 },
      },
    ]);
    await expect(getRelationshipLevel(env, 1, "student-a")).resolves.toEqual({
      uid: "relationship-a",
      studentId: "student-a",
      currentLevel: 20,
      currentExp: 246,
      targetLevel: 10,
      items: { "gift-x": 3 },
    });
    const readSelects = db.statements.filter((statement) => /^select/i.test(statement.trim()));
    expect(
      readSelects.every(
        (statement) => statement.includes('"student_states"') || statement.includes('"student_targets"'),
      ),
    ).toBe(true);
    expect(readSelects.some((statement) => statement.includes('"user_relationship_levels"'))).toBe(false);
  });

  it("reads null current and target levels without inventing defaults", async () => {
    const { db, env } = createEnv();
    db.tables.student_states.push(
      studentStateRow({ relationshipCurrentLevel: null, relationshipCurrentExp: null }),
      studentStateRow({
        id: 2,
        uid: "state-current-only",
        studentUid: "student-current-only",
        relationshipLevelUid: "relationship-current-only",
        relationshipCurrentLevel: 18,
        relationshipCurrentExp: null,
      }),
    );
    db.tables.student_targets.push(
      studentTargetRow({ relationshipTargetLevel: null, giftPlan: { "gift-x": 2 } }),
      studentTargetRow({
        id: 2,
        uid: "target-row-current-only",
        studentUid: "student-current-only",
        relationshipLevelUid: "relationship-current-only",
        relationshipTargetLevel: null,
        giftPlan: {},
      }),
    );

    await expect(getRelationshipLevels(env, 1)).resolves.toEqual([
      {
        uid: "relationship-a",
        studentId: "student-a",
        currentLevel: null,
        currentExp: null,
        targetLevel: null,
        items: { "gift-x": 2 },
      },
      {
        uid: "relationship-current-only",
        studentId: "student-current-only",
        currentLevel: 18,
        currentExp: null,
        targetLevel: null,
        items: {},
      },
    ]);
  });

  it.each([
    "state-only",
    "target-only",
    "different-uids",
  ] as const)("fails when relationship projection rows are %s", async (caseName) => {
    const { db, env } = createEnv();
    if (caseName !== "target-only") db.tables.student_states.push(studentStateRow());
    if (caseName !== "state-only") {
      db.tables.student_targets.push(
        studentTargetRow({ relationshipLevelUid: caseName === "different-uids" ? "relationship-b" : "relationship-a" }),
      );
    }

    await expect(getRelationshipLevel(env, 1, "student-a")).rejects.toThrow("Student relationship projection");
  });
});

describe("canonical relationship writes", () => {
  it("keeps a lower target and gift plan while changing only the current level", async () => {
    const { db, env } = createEnv();
    db.tables.student_states.push(studentStateRow());
    db.tables.student_targets.push(studentTargetRow());
    await updateRelationshipLevel(env, 1, "student-a", { currentLevel: 21 }, "nullable");
    expect(await getRelationshipLevel(env, 1, "student-a")).toMatchObject({
      currentLevel: 21,
      currentExp: null,
      targetLevel: 10,
      items: { "gift-x": 3 },
    });
  });
  it("clears current independently without fabricating a default", async () => {
    const { db, env } = createEnv();
    db.tables.student_states.push(studentStateRow());
    db.tables.student_targets.push(studentTargetRow());
    await updateRelationshipLevel(env, 1, "student-a", { currentLevel: null }, "nullable");
    expect(await getRelationshipLevel(env, 1, "student-a")).toMatchObject({ currentLevel: null, targetLevel: 10 });
  });
  it("keeps EXP for a target-only update", async () => {
    const { db, env } = createEnv();
    db.tables.student_states.push(studentStateRow());
    db.tables.student_targets.push(studentTargetRow());
    await updateRelationshipLevel(env, 1, "student-a", { targetLevel: 5 }, "nullable");
    expect(await getRelationshipLevel(env, 1, "student-a")).toMatchObject({
      currentLevel: 20,
      currentExp: 246,
      targetLevel: 5,
    });
  });
  it("rejects invalid gifts before writing", async () => {
    const { db, env } = createEnv();
    await expect(upsertRelationshipLevel(env, 1, "student-a", 20, 0, 10, { gift: NaN }, "nullable")).rejects.toThrow();
    expect(db.tables.student_states).toEqual([]);
    expect(db.tables.student_state_audits).toEqual([]);
  });
  it("rejects a missing canonical request format", async () => {
    const { db, env } = createEnv();
    await expect(updateRelationshipLevel(env, 1, "student-a", { currentLevel: 20 })).rejects.toThrow();
    expect(db.tables.student_state_audits).toEqual([]);
  });
});
