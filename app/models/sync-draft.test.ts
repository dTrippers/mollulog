import { describe, expect, it } from "@jest/globals";
import { applySyncDraft, normalizeSyncDraftEntryValue } from "./sync-draft";

type SyncDraftRow = {
  id: number;
  uid: string;
  userId: number;
  apiKeyUid: string | null;
  source: string;
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
};

type RecruitedStudentRow = {
  uid: string;
  userId: number;
  studentUid: string;
  tier: number;
  level: number | null;
  weaponLevel: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
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
  updatedAt: string;
};

class FakeD1Statement {
  private params: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]): FakeD1Statement {
    this.params = params;
    return this;
  }

  async all(): Promise<{ results: unknown[] }> {
    return { results: this.db.selectRows(this.sql, this.params) };
  }

  async raw(): Promise<unknown[][]> {
    return this.db.selectRows(this.sql, this.params).map((row) => Object.values(row as Record<string, unknown>));
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    return { success: true, meta: { changes: this.db.execute(this.sql, this.params) } };
  }
}

class FakeD1Database {
  readonly drafts: SyncDraftRow[] = [];
  readonly entries: SyncDraftEntryRow[] = [];
  readonly recruitedStudents: RecruitedStudentRow[] = [];
  readonly relationshipLevels: RelationshipLevelRow[] = [];
  readonly studentGrowths: StudentGrowthRow[] = [];

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  async batch(statements: FakeD1Statement[]) {
    const results = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  selectRows(sql: string, params: unknown[]): unknown[] {
    const normalizedSql = normalizeSql(sql);
    if (normalizedSql.includes("from sync_drafts")) {
      const [draftUid, userId] = params;
      return this.drafts.filter((draft) => draft.uid === draftUid && draft.userId === Number(userId));
    }
    if (normalizedSql.includes("from sync_draft_entries")) {
      const [draftUid] = params;
      return this.entries.filter((entry) => entry.draftUid === draftUid).sort((a, b) => a.id - b.id);
    }

    throw new Error(`Unexpected select SQL: ${sql}`);
  }

  execute(sql: string, params: unknown[]): number {
    const normalizedSql = normalizeSql(sql);
    if (normalizedSql.startsWith("insert into recruited_students")) {
      return this.upsertRecruitedStudent(params);
    }
    if (normalizedSql.startsWith("insert into user_relationship_levels")) {
      if (normalizedSql.includes("targetlevel = excluded.targetlevel")) {
        return this.upsertRelationshipTargetLevel(params);
      }
      return this.upsertRelationshipLevel(params);
    }
    if (normalizedSql.startsWith("insert into student_growth")) {
      return this.upsertStudentGrowth(params);
    }
    if (normalizedSql.startsWith("update sync_drafts")) {
      const [draftUid, userId] = params;
      const draft = this.drafts.find(
        (candidate) =>
          candidate.uid === draftUid && candidate.userId === Number(userId) && candidate.status === "pending",
      );
      if (!draft) return 0;
      draft.status = "applied";
      draft.updatedAt = "current_timestamp";
      draft.appliedAt = "current_timestamp";
      return 1;
    }

    throw new Error(`Unexpected execute SQL: ${sql}`);
  }

  private hasPendingStudentStateDraft(userId: number, draftUid: string): boolean {
    return this.drafts.some(
      (draft) =>
        draft.uid === draftUid &&
        draft.userId === userId &&
        draft.status === "pending" &&
        draft.type === "student_state",
    );
  }

  private upsertRecruitedStudent(params: unknown[]): number {
    const userId = Number(params[1]);
    const studentUid = String(params[2]);
    const draftUid = String(params[17]);
    if (!this.hasPendingStudentStateDraft(userId, draftUid)) {
      return 0;
    }

    const row =
      this.recruitedStudents.find((candidate) => candidate.userId === userId && candidate.studentUid === studentUid) ??
      createRecruitedStudentRow({ uid: String(params[0]), userId, studentUid });

    row.tier = Number(params[3]);
    row.level = toNullableNumber(params[4]);
    row.weaponLevel = toNullableNumber(params[5]);
    row.skillEx = toNullableNumber(params[6]);
    row.skillNormal = toNullableNumber(params[7]);
    row.skillEnhanced = toNullableNumber(params[8]);
    row.skillSub = toNullableNumber(params[9]);
    row.equip1 = toNullableNumber(params[10]);
    row.equip2 = toNullableNumber(params[11]);
    row.equip3 = toNullableNumber(params[12]);
    row.equipSpecial = toNullableNumber(params[13]);
    row.abilityHp = toNullableNumber(params[14]);
    row.abilityAtk = toNullableNumber(params[15]);
    row.abilityHeal = toNullableNumber(params[16]);
    row.updatedAt = "current_timestamp";

    if (!this.recruitedStudents.includes(row)) {
      this.recruitedStudents.push(row);
    }
    return 1;
  }

  private upsertRelationshipLevel(params: unknown[]): number {
    const userId = Number(params[1]);
    const studentId = String(params[2]);
    const currentLevel = Number(params[3]);
    const draftUid = String(params[4]);
    if (!this.hasPendingStudentStateDraft(userId, draftUid)) {
      return 0;
    }

    const row =
      this.relationshipLevels.find((candidate) => candidate.userId === userId && candidate.studentId === studentId) ??
      createRelationshipLevelRow({
        uid: String(params[0]),
        userId,
        studentId,
        targetLevel: currentLevel,
        items: "{}",
      });

    row.currentLevel = currentLevel;
    row.currentExp = null;
    row.updatedAt = "current_timestamp";

    if (!this.relationshipLevels.includes(row)) {
      this.relationshipLevels.push(row);
    }
    return 1;
  }

  private upsertRelationshipTargetLevel(params: unknown[]): number {
    const userId = Number(params[1]);
    const studentId = String(params[2]);
    const targetLevel = Number(params[3]);
    const draftUid = String(params[4]);
    if (!this.hasPendingStudentStateDraft(userId, draftUid)) {
      return 0;
    }

    const row =
      this.relationshipLevels.find((candidate) => candidate.userId === userId && candidate.studentId === studentId) ??
      createRelationshipLevelRow({
        uid: String(params[0]),
        userId,
        studentId,
        currentLevel: 1,
        currentExp: null,
        items: "{}",
      });

    row.targetLevel = targetLevel;
    row.updatedAt = "current_timestamp";

    if (!this.relationshipLevels.includes(row)) {
      this.relationshipLevels.push(row);
    }
    return 1;
  }

  private upsertStudentGrowth(params: unknown[]): number {
    const userId = Number(params[1]);
    const studentUid = String(params[2]);
    const draftUid = String(params[13]);
    if (!this.hasPendingStudentStateDraft(userId, draftUid)) {
      return 0;
    }

    const row =
      this.studentGrowths.find((candidate) => candidate.userId === userId && candidate.studentUid === studentUid) ??
      createStudentGrowthRow({ uid: String(params[0]), userId, studentUid });

    row.targetLevel = toNullableNumber(params[3]);
    row.targetSkillEx = toNullableNumber(params[4]);
    row.targetSkillNormal = toNullableNumber(params[5]);
    row.targetSkillEnhanced = toNullableNumber(params[6]);
    row.targetSkillSub = toNullableNumber(params[7]);
    row.targetEquip1 = toNullableNumber(params[8]);
    row.targetEquip2 = toNullableNumber(params[9]);
    row.targetEquip3 = toNullableNumber(params[10]);
    row.targetEquipSpecial = toNullableNumber(params[11]);
    row.targetTier = toNullableNumber(params[12]);
    row.updatedAt = "current_timestamp";

    if (!this.studentGrowths.includes(row)) {
      this.studentGrowths.push(row);
    }
    return 1;
  }
}

function createDraftRow(overrides: Partial<SyncDraftRow> = {}): SyncDraftRow {
  return {
    id: 1,
    uid: "draft-a",
    userId: 1,
    apiKeyUid: null,
    source: "web",
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
        weaponLevel: null,
        skillEx: 1,
        skillNormal: 2,
        skillEnhanced: 3,
        skillSub: 4,
        equip1: 1,
        equip2: 2,
        equip3: 3,
        equipSpecial: null,
        abilityHp: null,
        abilityAtk: null,
        abilityHeal: null,
        bond: 1,
      },
      target: null,
    }),
    meta: null,
    createdAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function createRecruitedStudentRow(overrides: Partial<RecruitedStudentRow> = {}): RecruitedStudentRow {
  return {
    uid: "recruited-a",
    userId: 1,
    studentUid: "20048",
    tier: 3,
    level: null,
    weaponLevel: null,
    skillEx: null,
    skillNormal: null,
    skillEnhanced: null,
    skillSub: null,
    equip1: null,
    equip2: null,
    equip3: null,
    equipSpecial: null,
    abilityHp: null,
    abilityAtk: null,
    abilityHeal: null,
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
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function createEnv(db = new FakeD1Database()): { db: FakeD1Database; env: Env } {
  return { db, env: { DB: db } as unknown as Env };
}

function toNullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function normalizeSql(sql: string): string {
  return sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
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
            weaponLevel: 50,
            skillEx: 5,
            skillNormal: 10,
            skillEnhanced: 10,
            skillSub: 10,
            equip1: 10,
            equip2: 9,
            equip3: 8,
            equipSpecial: 2,
            abilityHp: 25,
            abilityAtk: 26,
            abilityHeal: 27,
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
          weaponLevel: 50,
          skillEx: 5,
          equipSpecial: 2,
          abilityHp: 25,
          abilityAtk: 26,
          abilityHeal: 27,
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
            weaponLevel: null,
            skillEx: 1,
            skillNormal: 2,
            skillEnhanced: 3,
            skillSub: 4,
            equip1: 1,
            equip2: 2,
            equip3: 3,
            equipSpecial: null,
            abilityHp: null,
            abilityAtk: null,
            abilityHeal: null,
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
});
