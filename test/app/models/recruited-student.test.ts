import { describe, expect, it, jest } from "@jest/globals";
import {
  addRecruitedStudents,
  getRecruitedStudents,
  getRecruitedStudentTiers,
  removeRecruitedStudent,
  updateRecruitedStudentCurrentState,
  upsertRecruitedStudent,
  validateRecruitedStudentCurrentStateInput,
} from "~/models/recruited-student";
import { FakePostgresClient } from "../../helpers/fake-postgres";
import { studentStateRow, studentTargetRow } from "../../helpers/student-state";

jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));
function setup() {
  const db = new FakePostgresClient({}, "student_states");
  return { db, env: { __pgClient: db } as unknown as Env };
}
describe("canonical recruited students", () => {
  it("applies partial current changes while preserving ownership, equipment, goals and another account", async () => {
    const { db, env } = setup();
    db.rows.push(
      studentStateRow({ equip1Level: 45 }),
      studentStateRow({ id: 2, userId: 2, uid: "state-b", level: 40 }),
    );
    db.tables.student_targets.push(studentTargetRow());
    await updateRecruitedStudentCurrentState(env, 1, "student-a", { level: null, skillEx: 4 });
    expect(db.rows[0]).toMatchObject({
      recruitedStudentUid: "recruited-a",
      tier: 7,
      level: null,
      skillEx: 4,
      equip1Level: 45,
    });
    expect(db.rows[1].level).toBe(40);
    expect(db.tables.student_targets[0].targetLevel).toBe(60);
    expect(db.tables.student_state_audits).toHaveLength(1);
    expect(db.statements.some((s) => s.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(db.statements.some((s) => s.includes("migration_control"))).toBe(false);
  });
  it("does not create ownership when updating a student that is not recruited", async () => {
    const { db, env } = setup();
    await updateRecruitedStudentCurrentState(env, 1, "student-a", { level: 80 });
    expect(db.rows).toEqual([]);
    expect(db.tables.student_state_audits).toEqual([]);
  });
  it("preserves the identity and current state when changing tier", async () => {
    const { db, env } = setup();
    db.rows.push(studentStateRow());
    await upsertRecruitedStudent(env, 1, "student-a", 8);
    expect(db.rows[0]).toMatchObject({ uid: "state-a", recruitedStudentUid: "recruited-a", tier: 8, level: 80 });
  });
  it("rolls back a tier change that would invalidate stored ability release", async () => {
    const { db, env } = setup();
    db.rows.push(studentStateRow({ abilityHp: 1 }));
    await expect(upsertRecruitedStudent(env, 1, "student-a", 5)).rejects.toThrow();
    expect(db.rows[0].tier).toBe(7);
    expect(db.tables.student_state_audits).toEqual([]);
  });
  it("normalizes duplicate batch UIDs and preserves existing ownership", async () => {
    const { db, env } = setup();
    db.rows.push(studentStateRow());
    await addRecruitedStudents(env, 1, [
      { studentUid: "student-a", tier: 3 },
      { studentUid: "student-b", tier: 3 },
      { studentUid: "student-b", tier: 5 },
    ]);
    expect(db.rows).toHaveLength(2);
    expect(db.rows[0].tier).toBe(7);
    expect(db.rows[1].tier).toBe(3);
    expect(db.tables.student_state_audits).toHaveLength(1);
  });
  it("rejects invalid and oversized batches before opening a transaction", async () => {
    const { db, env } = setup();
    await expect(addRecruitedStudents(env, 1, [{ studentUid: "student-a", tier: 10 }])).rejects.toThrow();
    await expect(
      addRecruitedStudents(
        env,
        1,
        Array.from({ length: 501 }, (_, i) => ({ studentUid: `s-${i}`, tier: 3 })),
      ),
    ).rejects.toThrow();
    await addRecruitedStudents(env, 1, []);
    expect(db.statements).toEqual([]);
  });
  it("reads account-scoped ownership and ignores relationship-only rows and tombstones", async () => {
    const { db, env } = setup();
    db.rows.push(
      studentStateRow(),
      studentStateRow({ id: 2, studentUid: "relationship-only", recruitedStudentUid: null }),
      studentStateRow({ id: 3, studentUid: "deleted", deletedAt: new Date() }),
    );
    expect(await getRecruitedStudents(env, 1)).toHaveLength(1);
    expect(await getRecruitedStudentTiers(env, 1)).toEqual({ "student-a": 7 });
  });
  it("chunks a large UID filter without mixing accounts", async () => {
    const { db, env } = setup();
    const ids = Array.from({ length: 501 }, (_, i) => `s-${i}`);
    db.rows.push(...ids.map((studentUid, id) => studentStateRow({ studentUid, id, uid: `state-${id}` })));
    expect(await getRecruitedStudents(env, 1, ids)).toHaveLength(501);
    expect(db.selectParameterCounts).toEqual([501, 2]);
  });
  it("removes ownership without deleting goals or a relationship", async () => {
    const { db, env } = setup();
    db.rows.push(studentStateRow({ relationshipLevelUid: "rel", relationshipCurrentLevel: 20 }));
    db.tables.student_targets.push(studentTargetRow());
    await removeRecruitedStudent(env, 1, "student-a");
    expect(db.rows[0]).toMatchObject({ recruitedStudentUid: null, relationshipCurrentLevel: 20, deletedAt: null });
    expect(db.tables.student_targets[0].targetLevel).toBe(60);
  });
  it("validates every current field range and explicit nulls", () => {
    expect(() => validateRecruitedStudentCurrentStateInput({ level: 91 })).toThrow();
    expect(() => validateRecruitedStudentCurrentStateInput({ skillEx: 1.5 })).toThrow();
    expect(() =>
      validateRecruitedStudentCurrentStateInput({ level: null, equip1Level: null, weaponLevel: 0 }),
    ).not.toThrow();
  });
});
