import { describe, expect, it, jest } from "@jest/globals";
import {
  applySyncDraft,
  createAndApplySyncDraft,
  normalizeSyncDraftEntryValue,
  updateSyncDraftEntries,
} from "~/models/sync-draft";
import { FakePostgresClient } from "../../helpers/fake-postgres";

jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));

type SyncDraftRow = {
  id: number;
  uid: string;
  userId: number;
  apiKeyUid: string | null;
  source: string;
  sourceRef: string | null;
  type: string;
  status: string;
  toolName: string | null;
  toolVersion: string | null;
  catalogVersion: string | null;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  expiresAt: string | null;
};

type SyncDraftEntryRow = {
  id: number;
  uid: string;
  draftUid: string;
  entryKey: string;
  value: number;
  valueJson: string | null;
  meta: string | null;
  createdAt: string;
  updatedAt: string;
};

type RelationshipLevelRow = {
  uid: string;
  userId: number;
  studentId: string;
  currentLevel: number;
  currentExp: number | null;
  targetLevel: number;
  items: string;
  updatedAt: string;
};

type StudentGrowthRow = {
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
  updatedAt: string;
};

function createDraftRow(overrides: Partial<SyncDraftRow> = {}): SyncDraftRow {
  return {
    id: 1,
    uid: "draft-a",
    userId: 1,
    apiKeyUid: null,
    source: "web",
    sourceRef: null,
    type: "student_state",
    status: "pending",
    toolName: null,
    toolVersion: null,
    catalogVersion: null,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    appliedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

function createEntryRow(overrides: Partial<SyncDraftEntryRow>): SyncDraftEntryRow {
  return {
    id: 1,
    uid: "entry-a",
    draftUid: "draft-a",
    entryKey: "20048",
    value: 6,
    valueJson: JSON.stringify({
      current: {
        level: 1,
        tier: 6,
        weaponLevel: 30,
        skillEx: 1,
        skillNormal: 2,
        skillEnhanced: 3,
        skillSub: 4,
        equip1: 1,
        equip2: 2,
        equip3: 3,
        equipSpecial: null,
        abilityHp: 0,
        abilityAtk: 1,
        abilityHeal: 2,
        bond: 1,
      },
      target: null,
    }),
    meta: null,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function createRelationshipLevelRow(overrides: Partial<RelationshipLevelRow> = {}): RelationshipLevelRow {
  return {
    uid: "relationship-a",
    userId: 1,
    studentId: "20048",
    currentLevel: 5,
    currentExp: 123,
    targetLevel: 80,
    items: '{"5996":2}',
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function createStudentGrowthRow(overrides: Partial<StudentGrowthRow> = {}): StudentGrowthRow {
  return {
    uid: "growth-a",
    userId: 1,
    studentUid: "20048",
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

describe("sync-draft", () => {
  it("normalizes item inventory quantities", () => {
    expect(normalizeSyncDraftEntryValue("item_inventory", "0")).toBe(0);
    expect(normalizeSyncDraftEntryValue("item_inventory", " 1200 ")).toBe(1200);
    expect(normalizeSyncDraftEntryValue("item_inventory", 42)).toBe(42);
  });

  it("rejects invalid item inventory quantities", () => {
    expect(() => normalizeSyncDraftEntryValue("item_inventory", "-1")).toThrow(
      "아이템 수량은 0 이상의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("item_inventory", "1.5")).toThrow(
      "아이템 수량은 0 이상의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("item_inventory", "")).toThrow(
      "아이템 수량은 0 이상의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("item_inventory", Number.NaN)).toThrow(
      "아이템 수량은 0 이상의 정수만 입력해주세요",
    );
  });

  it("normalizes student tiers", () => {
    expect(normalizeSyncDraftEntryValue("student_tier", "1")).toBe(1);
    expect(normalizeSyncDraftEntryValue("student_tier", " 9 ")).toBe(9);
    expect(normalizeSyncDraftEntryValue("student_tier", 5)).toBe(5);
  });

  it("rejects invalid student tiers", () => {
    expect(() => normalizeSyncDraftEntryValue("student_tier", "0")).toThrow(
      "학생 등급은 1부터 9까지의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("student_tier", "10")).toThrow(
      "학생 등급은 1부터 9까지의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("student_tier", "1.5")).toThrow(
      "학생 등급은 1부터 9까지의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("student_tier", "")).toThrow(
      "학생 등급은 1부터 9까지의 정수만 입력해주세요",
    );
  });

  it("applies owned student_state drafts to recruited students and student growth targets", async () => {
    const { db, env } = createEnv();
    db.drafts.push(createDraftRow());
    db.entries.push(
      createEntryRow({
        id: 1,
        entryKey: "20048",
        value: 6,
        valueJson: JSON.stringify({
          current: {
            level: 90,
            tier: 6,
            skillEx: 5,
            skillNormal: 10,
            skillEnhanced: 10,
            skillSub: 10,
            equip1: 10,
            equip2: 9,
            equip3: 8,
            equipSpecial: 2,
            bond: null,
          },
          target: {
            targetLevel: 90,
            targetTier: 8,
            targetSkillEx: 5,
            targetSkillNormal: 10,
            targetSkillEnhanced: 10,
            targetSkillSub: 10,
            targetEquip1: 10,
            targetEquip2: 10,
            targetEquip3: 10,
            targetEquipSpecial: 2,
          },
        }),
      }),
    );
    db.studentGrowths.push(createStudentGrowthRow({ level: 70, skillEx: 3, targetLevel: 80, targetTier: 5 }));

    await applySyncDraft(env, 1, "draft-a");

    expect(db.drafts[0]).toMatchObject({ status: "applied" });
    expect(db.recruitedStudents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentUid: "20048",
          tier: 6,
          level: 90,
          skillEx: 5,
          equipSpecial: 2,
        }),
      ]),
    );
    expect(db.studentGrowths).toEqual([
      expect.objectContaining({
        studentUid: "20048",
        level: 70,
        skillEx: 3,
        targetLevel: 90,
        targetTier: 8,
        targetSkillEx: 5,
        targetEquipSpecial: 2,
      }),
    ]);
  });

  it("applies unowned student_state drafts to growth and relationship targets", async () => {
    const { db, env } = createEnv();
    db.drafts.push(createDraftRow());
    db.entries.push(
      createEntryRow({
        value: 7,
        valueJson: JSON.stringify({
          current: null,
          target: {
            targetBond: 20,
            targetLevel: 90,
            targetTier: 7,
            targetSkillEx: 5,
            targetSkillNormal: 10,
            targetSkillEnhanced: 10,
            targetSkillSub: 10,
            targetEquip1: 10,
            targetEquip2: 10,
            targetEquip3: 10,
            targetEquipSpecial: 2,
          },
        }),
      }),
    );

    await applySyncDraft(env, 1, "draft-a");

    expect(db.drafts[0]).toMatchObject({ status: "applied" });
    expect(db.recruitedStudents).toEqual([]);
    expect(db.relationshipLevels).toEqual([
      expect.objectContaining({
        studentId: "20048",
        currentLevel: 1,
        currentExp: null,
        targetLevel: 20,
      }),
    ]);
    expect(db.studentGrowths).toEqual([
      expect.objectContaining({
        studentUid: "20048",
        targetLevel: 90,
        targetTier: 7,
        targetSkillNormal: 10,
        targetEquipSpecial: 2,
      }),
    ]);
  });

  it("applies empty student_state drafts without recruiting students", async () => {
    const { db, env } = createEnv();
    db.drafts.push(createDraftRow());
    db.entries.push(
      createEntryRow({
        value: 1,
        valueJson: JSON.stringify({
          current: null,
          target: null,
        }),
      }),
    );

    await applySyncDraft(env, 1, "draft-a");

    expect(db.drafts[0]).toMatchObject({ status: "applied" });
    expect(db.recruitedStudents).toEqual([]);
    expect(db.relationshipLevels).toEqual([]);
    expect(db.studentGrowths).toEqual([]);
  });

  it("applies owned student_state bond while preserving relationship targets", async () => {
    const { db, env } = createEnv();
    db.drafts.push(createDraftRow());
    db.entries.push(
      createEntryRow({
        value: 6,
        valueJson: JSON.stringify({
          current: {
            level: 1,
            tier: 6,
            skillEx: 1,
            skillNormal: 2,
            skillEnhanced: 3,
            skillSub: 4,
            equip1: 1,
            equip2: 2,
            equip3: 3,
            equipSpecial: null,
            bond: 10,
          },
          target: null,
        }),
      }),
    );
    db.relationshipLevels.push(createRelationshipLevelRow({ studentId: "20048", currentLevel: 5, targetLevel: 80 }));

    await applySyncDraft(env, 1, "draft-a");

    expect(db.relationshipLevels).toEqual([
      expect.objectContaining({
        studentId: "20048",
        currentLevel: 10,
        currentExp: null,
        targetLevel: 80,
        items: '{"5996":2}',
      }),
    ]);
  });

  it("updates more than 500 draft entries with bounded VALUES statements", async () => {
    const { db, env } = createEnv();
    db.drafts.push(createDraftRow({ type: "item_inventory" }));
    const entries = Array.from({ length: 1001 }, (_, index) => {
      const entryKey = `item-${index}`;
      db.entries.push(
        createEntryRow({
          id: index + 1,
          entryKey,
          value: index + 1,
          valueJson: null,
        }),
      );
      return { entryKey, value: index + 2 };
    });

    await updateSyncDraftEntries(env, 1, "draft-a", entries);

    const valuesUpdates = db.statements.filter(
      (statement) =>
        statement.toLowerCase().includes('update "sync_draft_entries"') &&
        statement.toLowerCase().includes("from (values"),
    );
    expect(valuesUpdates).toHaveLength(3);
    expect(valuesUpdates.every((statement) => statement.toLowerCase().includes('"updated_at"'))).toBe(true);
    expect(
      valuesUpdates.every((statement) => !statement.toLowerCase().includes('update "sync_draft_entries" set')),
    ).toBe(true);
  });

  it("applies more than 500 student-state entries with bounded bulk statements", async () => {
    const { db, env } = createEnv();
    const input = {
      source: "connect" as const,
      sourceRef: "bulk-student-state",
      type: "student_state" as const,
      entries: Array.from({ length: 1001 }, (_, index) => ({
        entryKey: `student-${index}`,
        value: 7,
        valueJson: JSON.stringify({
          current: { tier: 7, bond: (index % 100) + 1 },
          target: { targetTier: 8, targetBond: (index % 100) + 1 },
        }),
      })),
    };

    await createAndApplySyncDraft(env, 1, input);

    const recruitedStatements = db.statements.filter((statement) =>
      statement.toLowerCase().includes('insert into "recruited_students"'),
    );
    const growthStatements = db.statements.filter((statement) =>
      statement.toLowerCase().includes('insert into "student_growth"'),
    );
    const relationshipStatements = db.statements.filter((statement) =>
      statement.toLowerCase().includes('insert into "user_relationship_levels"'),
    );
    const relationshipReads = db.statements.filter(
      (statement) =>
        statement.toLowerCase().includes("select") && statement.toLowerCase().includes('"user_relationship_levels"'),
    );
    expect(recruitedStatements).toHaveLength(3);
    expect(growthStatements).toHaveLength(3);
    expect(relationshipStatements).toHaveLength(6);
    expect(relationshipReads).toHaveLength(3);
  });
});
