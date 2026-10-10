import { describe, expect, it, jest } from "@jest/globals";
import {
  getRelationshipLevel,
  getRelationshipLevels,
  resolveRelationshipLevelInput,
  updateRelationshipLevel,
  upsertRelationshipLevel,
} from "../../../app/models/relationship-level";
import { FakePostgresClient } from "../../helpers/fake-postgres";

jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));

function createEnv(db = new FakePostgresClient({}, "user_relationship_levels")): { db: FakePostgresClient; env: Env } {
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
  it("returns null when both current and target levels are empty", () => {
    expect(resolveRelationshipLevelInput(null, { currentLevel: null, targetLevel: null })).toBeNull();
  });

  it("defaults the target level to the current level", () => {
    expect(resolveRelationshipLevelInput(null, { currentLevel: 20, targetLevel: null })).toEqual({
      currentLevel: 20,
      currentExp: null,
      targetLevel: 20,
    });
  });

  it("defaults the current level to 1 when only the target level is provided", () => {
    expect(resolveRelationshipLevelInput(null, { currentLevel: null, targetLevel: 50 })).toEqual({
      currentLevel: 1,
      currentExp: null,
      targetLevel: 50,
    });
  });

  it("keeps current exp when the current level stays the same", () => {
    expect(
      resolveRelationshipLevelInput({ currentLevel: 15, currentExp: 1234 }, { currentLevel: 15, targetLevel: 30 }),
    ).toEqual({
      currentLevel: 15,
      currentExp: 1234,
      targetLevel: 30,
    });
  });

  it("clears current exp when the current level changes", () => {
    expect(
      resolveRelationshipLevelInput({ currentLevel: 15, currentExp: 1234 }, { currentLevel: 16, targetLevel: 30 }),
    ).toEqual({
      currentLevel: 16,
      currentExp: null,
      targetLevel: 30,
    });
  });

  it("rejects target levels below current levels", () => {
    expect(() => resolveRelationshipLevelInput(null, { currentLevel: 40, targetLevel: 39 })).toThrow(
      "목표 인연 랭크는 현재 인연 랭크보다 낮을 수 없어요",
    );
  });

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

  it("updates the conflict timestamp when relationship state changes", async () => {
    const previousUpdatedAt = new Date("2026-07-25T00:00:00.000Z");
    const db = new FakePostgresClient(
      {
        user_relationship_levels: [
          {
            id: 1,
            uid: "relationship-1",
            userId: 1,
            studentId: "student-1",
            currentLevel: 1,
            currentExp: null,
            targetLevel: 10,
            items: {},
            createdAt: previousUpdatedAt,
            updatedAt: previousUpdatedAt,
          },
        ],
      },
      "user_relationship_levels",
    );

    await upsertRelationshipLevel(
      { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
      1,
      "student-1",
      2,
      10,
      20,
      { gift: 3 },
    );

    const updatedAt = new Date(String(db.relationshipLevels[0]?.updatedAt));
    expect(updatedAt.getTime()).toBeGreaterThan(previousUpdatedAt.getTime());
  });

  it("reads, resolves, and writes relationship state under one row-locked transaction", async () => {
    const db = new FakePostgresClient(
      {
        user_relationship_levels: [
          {
            id: 1,
            uid: "relationship-1",
            userId: 1,
            studentId: "student-1",
            currentLevel: 10,
            currentExp: 123,
            targetLevel: 20,
            items: { gift: 4 },
            createdAt: new Date("2026-07-25T00:00:00.000Z"),
            updatedAt: new Date("2026-07-25T00:00:00.000Z"),
          },
        ],
      },
      "user_relationship_levels",
    );

    await updateRelationshipLevel(
      { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
      1,
      "student-1",
      { currentLevel: 10, targetLevel: 30 },
    );

    expect(db.relationshipLevels[0]).toMatchObject({ currentLevel: 10, currentExp: 123, targetLevel: 30 });
    const items = db.relationshipLevels[0]?.items;
    expect(typeof items === "string" ? JSON.parse(items) : items).toEqual({ gift: 4 });
    expect(db.statements[0]?.toLowerCase()).toBe("begin");
    expect(db.statements.at(-1)?.toLowerCase()).toBe("commit");
    const lockIndex = db.statements.findIndex(
      (statement) =>
        statement.toLowerCase().includes("for update") && statement.toLowerCase().includes("user_relationship_levels"),
    );
    const writeIndex = db.statements.findIndex((statement) => statement.toLowerCase().startsWith("insert"));
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(writeIndex);
  });

  it("rolls back relationship state validation failures without writing", async () => {
    const db = new FakePostgresClient(
      {
        user_relationship_levels: [
          {
            id: 1,
            uid: "relationship-1",
            userId: 1,
            studentId: "student-1",
            currentLevel: 10,
            currentExp: 123,
            targetLevel: 20,
            items: { gift: 4 },
            createdAt: new Date("2026-07-25T00:00:00.000Z"),
            updatedAt: new Date("2026-07-25T00:00:00.000Z"),
          },
        ],
      },
      "user_relationship_levels",
    );

    await expect(
      updateRelationshipLevel(
        { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
        1,
        "student-1",
        { currentLevel: 30, targetLevel: 20 },
      ),
    ).rejects.toThrow("목표 인연 랭크는 현재 인연 랭크보다 낮을 수 없어요");

    expect(db.relationshipLevels[0]).toMatchObject({ currentLevel: 10, currentExp: 123, targetLevel: 20 });
    expect(db.relationshipLevels[0]?.items).toEqual({ gift: 4 });
    expect(db.statements.map((statement) => statement.toLowerCase())).toEqual(
      expect.arrayContaining(["begin", "rollback"]),
    );
    expect(db.statements.some((statement) => statement.toLowerCase().startsWith("insert"))).toBe(false);
  });

  it("rejects a gift plan with a non-numeric quantity before writing", async () => {
    const db = new FakePostgresClient({}, "user_relationship_levels");

    await expect(
      upsertRelationshipLevel(
        { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
        1,
        "student-1",
        2,
        null,
        20,
        { gift: null } as unknown as Record<string, number>,
      ),
    ).rejects.toThrow("선물 계획 형식이 올바르지 않아요");
    expect(db.relationshipLevels).toHaveLength(0);
    expect(db.tables.student_state_audits).toHaveLength(0);
  });

  it("creates missing relationship state with empty items in the atomic operation", async () => {
    const db = new FakePostgresClient({}, "user_relationship_levels");

    await updateRelationshipLevel(
      { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
      1,
      "student-1",
      { currentLevel: 1, targetLevel: 15 },
    );

    expect(db.relationshipLevels).toHaveLength(1);
    expect(db.relationshipLevels[0]).toMatchObject({ currentLevel: 1, currentExp: null, targetLevel: 15 });
    expect(JSON.parse(String(db.relationshipLevels[0]?.items))).toEqual({});
  });

  it("deletes relationship state when both levels are cleared", async () => {
    const db = new FakePostgresClient(
      {
        user_relationship_levels: [
          {
            id: 1,
            uid: "relationship-1",
            userId: 1,
            studentId: "student-1",
            currentLevel: 10,
            currentExp: 123,
            targetLevel: 20,
            items: { gift: 4 },
            createdAt: new Date("2026-07-25T00:00:00.000Z"),
            updatedAt: new Date("2026-07-25T00:00:00.000Z"),
          },
        ],
      },
      "user_relationship_levels",
    );

    await updateRelationshipLevel(
      { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
      1,
      "student-1",
      { currentLevel: null, targetLevel: null },
    );

    expect(db.relationshipLevels).toHaveLength(0);
    expect(db.statements.map((statement) => statement.toLowerCase())).toEqual(
      expect.arrayContaining(["begin", "commit"]),
    );
  });
});
