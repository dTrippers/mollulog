import { describe, expect, it, jest } from "@jest/globals";
import {
  addRecruitedStudents,
  getRecruitedStudents,
  RecruitedStudentValidationError,
  updateRecruitedStudentCurrentState,
  upsertRecruitedStudent,
} from "~/models/recruited-student";
import { FakePostgresClient } from "../../helpers/fake-postgres";

jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));

type RecruitedStudentRow = {
  id: number;
  uid: string;
  userId: number;
  studentUid: string;
  tier: number;
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equip1Level: number | null;
  equip2Level: number | null;
  equip3Level: number | null;
  equipSpecial: number | null;
  weaponLevel: number | null;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
  createdAt: string;
  updatedAt: string;
};

function createRecruitedStudentRow(overrides: Partial<RecruitedStudentRow>): RecruitedStudentRow {
  return {
    id: 1,
    uid: "recruited-a",
    userId: 1,
    studentUid: "student-a",
    tier: 3,
    level: null,
    skillEx: null,
    skillNormal: null,
    skillEnhanced: null,
    skillSub: null,
    equip1: null,
    equip2: null,
    equip3: null,
    equip1Level: null,
    equip2Level: null,
    equip3Level: null,
    equipSpecial: null,
    weaponLevel: null,
    abilityHp: null,
    abilityAtk: null,
    abilityHeal: null,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function createEnv(db = new FakePostgresClient()): { db: FakePostgresClient; env: Env } {
  return {
    db,
    env: { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
  };
}

describe("recruited-student current state", () => {
  it("updates current fields for an existing recruited student without changing tier", async () => {
    const { db, env } = createEnv();
    db.rows.push(createRecruitedStudentRow({ tier: 6 }));

    await updateRecruitedStudentCurrentState(env, 1, "student-a", {
      level: 87,
      weaponLevel: 0,
      abilityHp: 10,
      abilityAtk: 11,
      abilityHeal: 12,
      skillEx: 5,
      skillNormal: 10,
      skillEnhanced: 9,
      skillSub: 8,
      equip1: 10,
      equip2: 9,
      equip3: 8,
      equipSpecial: 2,
    });

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      tier: 6,
      level: 87,
      weaponLevel: 0,
      abilityHp: 10,
      abilityAtk: 11,
      abilityHeal: 12,
      skillEx: 5,
      skillNormal: 10,
      skillEnhanced: 9,
      skillSub: 8,
      equip1: 10,
      equip2: 9,
      equip3: 8,
      equipSpecial: 2,
    });
    expect(db.statements[0]?.toLowerCase()).toBe("begin");
    expect(db.statements.at(-1)?.toLowerCase()).toBe("commit");
    const lockIndex = db.statements.findIndex(
      (statement) =>
        statement.toLowerCase().includes("for update") && statement.toLowerCase().includes("recruited_students"),
    );
    const writeIndex = db.statements.findIndex((statement) => statement.toLowerCase().startsWith("update"));
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(writeIndex);
  });

  it("does not create a recruited row when updating current state for a non-recruited student", async () => {
    const { db, env } = createEnv();

    await updateRecruitedStudentCurrentState(env, 1, "student-a", {
      level: 80,
      weaponLevel: null,
      abilityHp: null,
      abilityAtk: null,
      abilityHeal: null,
      skillEx: null,
      skillNormal: null,
      skillEnhanced: null,
      skillSub: null,
      equip1: null,
      equip2: null,
      equip3: null,
      equipSpecial: null,
    });

    expect(db.rows).toHaveLength(0);
  });

  it("inserts an absent recruited student under the same locked transaction", async () => {
    const { db, env } = createEnv();

    await upsertRecruitedStudent(env, 1, "student-a", 5);

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ userId: 1, studentUid: "student-a", tier: 5 });
    expect(db.statements[0]?.toLowerCase()).toBe("begin");
    expect(db.statements.at(-1)?.toLowerCase()).toBe("commit");
    const lockIndex = db.statements.findIndex((statement) => statement.toLowerCase().includes("for update"));
    const writeIndex = db.statements.findIndex((statement) => statement.toLowerCase().startsWith("insert"));
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(writeIndex);
  });

  it("preserves equipment levels when a growth-table update omits those fields", async () => {
    const { db, env } = createEnv();
    db.rows.push(
      createRecruitedStudentRow({
        tier: 6,
        equip1Level: 70,
        equip2Level: 45,
        equip3Level: 30,
      }),
    );

    await updateRecruitedStudentCurrentState(env, 1, "student-a", {
      level: 80,
      weaponLevel: 20,
      abilityHp: null,
      abilityAtk: null,
      abilityHeal: null,
      skillEx: 5,
      skillNormal: 10,
      skillEnhanced: 9,
      skillSub: 8,
      equip1: 10,
      equip2: 9,
      equip3: 8,
      equipSpecial: 2,
    });

    expect(db.rows[0]).toMatchObject({ equip1Level: 70, equip2Level: 45, equip3Level: 30, level: 80 });
  });

  it("keeps current fields when tier is updated", async () => {
    const { db, env } = createEnv();
    db.rows.push(createRecruitedStudentRow({ tier: 3, level: 80, skillEx: 4, equip1: 7 }));

    await upsertRecruitedStudent(env, 1, "student-a", 5);

    expect(db.rows[0]).toMatchObject({
      tier: 5,
      level: 80,
      skillEx: 4,
      equip1: 7,
    });
    expect(db.statements[0]?.toLowerCase()).toBe("begin");
    expect(db.statements.at(-1)?.toLowerCase()).toBe("commit");
    const lockIndex = db.statements.findIndex(
      (statement) =>
        statement.toLowerCase().includes("for update") && statement.toLowerCase().includes("recruited_students"),
    );
    const writeIndex = db.statements.findIndex((statement) => statement.toLowerCase().startsWith("insert"));
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(writeIndex);
  });

  it("rejects tier updates that would leave ability release levels without a unique weapon", async () => {
    const { db, env } = createEnv();
    db.rows.push(createRecruitedStudentRow({ tier: 6, abilityHp: 1 }));

    await expect(upsertRecruitedStudent(env, 1, "student-a", 5)).rejects.toThrow(
      "능력 해방은(는) 고유무기 장착 후 입력할 수 있어요",
    );
    expect(db.statements.map((statement) => statement.toLowerCase())).toEqual(
      expect.arrayContaining(["begin", "rollback"]),
    );
    expect(db.rows[0]).toMatchObject({ tier: 6, abilityHp: 1 });
    expect(db.statements.some((statement) => statement.toLowerCase().startsWith("insert"))).toBe(false);
  });

  it("rejects out-of-range current values", async () => {
    const { env } = createEnv();

    await expect(
      updateRecruitedStudentCurrentState(env, 1, "student-a", {
        level: 91,
        weaponLevel: null,
        abilityHp: null,
        abilityAtk: null,
        abilityHeal: null,
        skillEx: null,
        skillNormal: null,
        skillEnhanced: null,
        skillSub: null,
        equip1: null,
        equip2: null,
        equip3: null,
        equipSpecial: null,
      }),
    ).rejects.toThrow("레벨은(는) 1부터 90 사이만 입력할 수 있어요");
  });

  it("rejects ability release levels before the unique weapon is equipped", async () => {
    const { db, env } = createEnv();
    db.rows.push(createRecruitedStudentRow({ tier: 5 }));

    await expect(
      updateRecruitedStudentCurrentState(env, 1, "student-a", {
        level: null,
        weaponLevel: 0,
        abilityHp: 1,
        abilityAtk: 0,
        abilityHeal: null,
        skillEx: null,
        skillNormal: null,
        skillEnhanced: null,
        skillSub: null,
        equip1: null,
        equip2: null,
        equip3: null,
        equipSpecial: null,
      }),
    ).rejects.toThrow("능력 해방은(는) 고유무기 장착 후 입력할 수 있어요");
    expect(db.statements.map((statement) => statement.toLowerCase())).toEqual(
      expect.arrayContaining(["begin", "rollback"]),
    );
    expect(db.rows[0]).toMatchObject({ tier: 5, abilityHp: null, abilityAtk: null, abilityHeal: null });
    expect(db.statements.some((statement) => statement.toLowerCase().startsWith("update"))).toBe(false);
  });

  it("loads recruited current fields with the tier", async () => {
    const { db, env } = createEnv();
    db.rows.push(
      createRecruitedStudentRow({
        level: 80,
        skillEx: 4,
        equip1: 7,
        equip1Level: 70,
        equip2Level: 45,
        equip3Level: 30,
      }),
    );

    await expect(getRecruitedStudents(env, 1)).resolves.toEqual([
      expect.objectContaining({
        studentUid: "student-a",
        tier: 3,
        level: 80,
        skillEx: 4,
        equip1: 7,
        equip1Level: 70,
        equip2Level: 45,
        equip3Level: 30,
      }),
    ]);
  });

  it("loads a large student UID filter with PostgreSQL chunking", async () => {
    const { db, env } = createEnv();
    const studentUids = Array.from({ length: 181 }, (_, index) => `student-${index}`);
    db.rows.push(
      ...studentUids.map((studentUid, index) =>
        createRecruitedStudentRow({ id: index + 1, uid: `recruited-${index}`, studentUid }),
      ),
    );

    await expect(getRecruitedStudents(env, 1, [...studentUids, studentUids[0]])).resolves.toHaveLength(181);
    expect(db.selectParameterCounts).toEqual([182]);
  });

  it("normalizes duplicate UIDs and writes a batch in one multi-row insert", async () => {
    const { db, env } = createEnv();

    await addRecruitedStudents(env, 1, [
      { studentUid: "student-a", tier: 3 },
      { studentUid: "student-a", tier: 9 },
      { studentUid: "student-b", tier: 5 },
    ]);

    expect(db.rows).toHaveLength(2);
    expect(db.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 1, studentUid: "student-a", tier: 3 }),
        expect.objectContaining({ userId: 1, studentUid: "student-b", tier: 5 }),
      ]),
    );
    const insertStatements = db.statements.filter((statement) => statement.toLowerCase().startsWith("insert"));
    expect(insertStatements).toHaveLength(1);
    expect(insertStatements[0]?.toLowerCase()).toContain("on conflict");
    expect(insertStatements[0]?.toLowerCase()).toContain("do nothing");
    expect(db.statements.some((statement) => statement.toLowerCase() === "begin")).toBe(false);
  });

  it("does not open a PostgreSQL client for an empty batch", async () => {
    const { db, env } = createEnv();

    await addRecruitedStudents(env, 1, []);

    expect(db.statements).toEqual([]);
  });

  it("rejects invalid tiers and batches over 500 unique students before writing", async () => {
    const { db, env } = createEnv();

    await expect(addRecruitedStudents(env, 1, [{ studentUid: "student-a", tier: 10 }])).rejects.toThrow(
      "학생 일괄 등록 요청이 올바르지 않아요",
    );
    expect(db.statements).toEqual([]);

    const oversizedBatch = Array.from({ length: 501 }, (_, index) => ({
      studentUid: `student-${index}`,
      tier: 3,
    }));
    await expect(addRecruitedStudents(env, 1, oversizedBatch)).rejects.toThrow(
      "학생은 최대 500명까지 한 번에 등록할 수 있어요",
    );
    expect(db.statements).toEqual([]);
  });

  it("keeps the defensive array guard as a typed validation failure", async () => {
    const { db, env } = createEnv();

    await expect(addRecruitedStudents(env, 1, undefined as never)).rejects.toBeInstanceOf(
      RecruitedStudentValidationError,
    );
    expect(db.statements).toEqual([]);
  });

  it("emits conflict-safe SQL for the recruited-student business key", async () => {
    const { db, env } = createEnv();

    await addRecruitedStudents(env, 1, [{ studentUid: "student-a", tier: 3 }]);

    const insertStatement = db.statements.find((statement) => statement.toLowerCase().startsWith("insert"));
    expect(insertStatement).toMatch(/on conflict\s*\(\s*"user_id"\s*,\s*"student_uid"\s*\)\s*do nothing/i);
  });
});
