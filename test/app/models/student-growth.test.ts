import { describe, expect, it, jest } from "@jest/globals";
import {
  getStudentGrowth,
  getStudentGrowthsWithMetadata,
  removeStudentGrowth,
  saveStudentGrowthAndCurrentState,
  upsertStudentGrowth,
  validateMergedStudentGrowthTarget,
} from "~/models/student-growth";
import { FakePostgresClient } from "../../helpers/fake-postgres";
import { studentStateRow, studentTargetRow } from "../../helpers/student-state";

jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));
function setup() {
  const db = new FakePostgresClient({}, "student_targets");
  return { db, env: { __pgClient: db } as unknown as Env };
}
const empty = {
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
};
describe("canonical growth targets", () => {
  it("preserves an existing goal when merely registering planner membership", async () => {
    const { db, env } = setup();
    db.rows.push(studentTargetRow({ studentGrowthUid: null, plannerAddedAt: null }));
    await upsertStudentGrowth(env, 1, "student-a", empty);
    expect(db.rows[0]).toMatchObject({ uid: "target-a", targetLevel: 60, studentGrowthUid: expect.any(String) });
  });
  it("keeps partial current and target updates independent", async () => {
    const { db, env } = setup();
    db.tables.student_states.push(studentStateRow());
    db.rows.push(studentTargetRow());
    await saveStudentGrowthAndCurrentState(env, 1, "student-a", { level: null }, { targetLevel: 30 }, 7, "nullable");
    expect(db.tables.student_states[0]).toMatchObject({ level: null, tier: 7 });
    expect(db.rows[0]).toMatchObject({ targetLevel: 30, studentGrowthUid: "growth-a" });
    expect(db.tables.student_state_audits).toHaveLength(1);
  });
  it("rejects pre-cutover forms before writing", async () => {
    const { db, env } = setup();
    db.rows.push(studentTargetRow());
    await expect(saveStudentGrowthAndCurrentState(env, 1, "student-a", null, { targetLevel: 99 }, 7)).rejects.toThrow();
    expect(db.rows[0].targetLevel).toBe(60);
    expect(db.tables.student_state_audits).toEqual([]);
  });
  it("validates the stored target merged with omitted fields and explicit clears", () => {
    expect(() =>
      validateMergedStudentGrowthTarget({ targetTier: 9, targetWeaponLevel: 60 }, { targetTier: 6 }, 3),
    ).toThrow();
    expect(() =>
      validateMergedStudentGrowthTarget(
        { targetTier: 9, targetWeaponLevel: 60 },
        { targetTier: 6, targetWeaponLevel: null },
        3,
      ),
    ).not.toThrow();
  });
  it("validates target patches against the stored tier inside the write transaction", async () => {
    const { db, env } = setup();
    db.rows.push(studentTargetRow({ targetTier: 3 }));
    await expect(
      saveStudentGrowthAndCurrentState(env, 1, "student-a", null, { targetWeaponLevel: 30 }, 9, "nullable"),
    ).rejects.toThrow();
    expect(db.rows[0].targetWeaponLevel).toBeNull();
    expect(db.tables.student_state_audits).toEqual([]);
  });
  it("removes planner membership and goals without clearing relationship targets", async () => {
    const { db, env } = setup();
    db.rows.push(studentTargetRow({ relationshipLevelUid: "rel", relationshipTargetLevel: 10, giftPlan: { gift: 2 } }));
    await removeStudentGrowth(env, 1, "student-a");
    expect(db.rows[0]).toMatchObject({
      studentGrowthUid: null,
      plannerAddedAt: null,
      targetLevel: null,
      relationshipTargetLevel: 10,
      giftPlan: { gift: 2 },
      deletedAt: null,
    });
  });
  it("returns the preserved registration timestamp and ignores tombstones", async () => {
    const { db, env } = setup();
    db.rows.push(studentTargetRow(), studentTargetRow({ id: 2, studentUid: "deleted", deletedAt: new Date() }));
    expect(await getStudentGrowth(env, 1, "student-a")).toMatchObject({ uid: "growth-a", targetLevel: 60 });
    expect(await getStudentGrowthsWithMetadata(env, 1)).toEqual([
      expect.objectContaining({ createdAt: "2026-10-10T00:00:00.234567Z" }),
    ]);
  });
  it("does not audit a no-op canonical save", async () => {
    const { db, env } = setup();
    db.rows.push(studentTargetRow());
    await saveStudentGrowthAndCurrentState(env, 1, "student-a", null, { targetLevel: 60 }, 7, "nullable");
    expect(db.tables.student_state_audits).toEqual([]);
  });
});
