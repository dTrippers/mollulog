import { describe, expect, it } from "@jest/globals";
import {
  getRecruitedStudents,
  updateRecruitedStudentCurrentState,
  upsertRecruitedStudent,
} from "~/models/recruited-student";

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
  equipSpecial: number | null;
  weaponLevel: number | null;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
  createdAt: string;
  updatedAt: string;
};

const currentStateFields = [
  "level",
  "skillEx",
  "skillNormal",
  "skillEnhanced",
  "skillSub",
  "equip1",
  "equip2",
  "equip3",
  "equipSpecial",
  "weaponLevel",
  "abilityHp",
  "abilityAtk",
  "abilityHeal",
] as const;

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

  async all(): Promise<{ results: RecruitedStudentRow[] }> {
    return { results: this.db.selectRows(this.sql, this.params) };
  }

  async raw(): Promise<unknown[][]> {
    return this.db.selectRows(this.sql, this.params).map((row) => Object.values(row));
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    return { success: true, meta: { changes: this.db.execute(this.sql, this.params) } };
  }
}

class FakeD1Database {
  readonly rows: RecruitedStudentRow[] = [];

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  selectRows(sql: string, params: unknown[]): RecruitedStudentRow[] {
    const normalizedSql = normalizeSql(sql);
    if (normalizedSql.includes("from recruited_students")) {
      const userId = Number(params[0]);
      return this.rows.filter((row) => row.userId === userId);
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  }

  execute(sql: string, params: unknown[]): number {
    const normalizedSql = normalizeSql(sql);
    if (normalizedSql.startsWith("update recruited_students set")) {
      const userId = Number(params.at(-2));
      const studentUid = String(params.at(-1));
      const row = this.rows.find((candidate) => candidate.userId === userId && candidate.studentUid === studentUid);
      if (!row) return 0;

      currentStateFields.forEach((field, index) => {
        row[field] = params[index] == null ? null : Number(params[index]);
      });
      row.updatedAt = "current_timestamp";
      return 1;
    }

    if (normalizedSql.startsWith("insert into recruited_students")) {
      const userId = Number(params[1]);
      const studentUid = String(params[2]);
      const tier = Number(params.at(-1));
      const recruitedRow = this.rows.find(
        (candidate) => candidate.userId === userId && candidate.studentUid === studentUid,
      );
      if (recruitedRow) {
        recruitedRow.tier = tier;
        recruitedRow.updatedAt = "current_timestamp";
        return 1;
      }

      this.rows.push(createRecruitedStudentRow({ uid: String(params[0]), userId, studentUid, tier }));
      return 1;
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

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

function createEnv(db = new FakeD1Database()): { db: FakeD1Database; env: Env } {
  return { db, env: { DB: db } as unknown as Env };
}

function normalizeSql(sql: string): string {
  return sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("recruited-student current state", () => {
  it("updates current fields for an existing recruited student without changing tier", async () => {
    const { db, env } = createEnv();
    db.rows.push(createRecruitedStudentRow({ tier: 4 }));

    await updateRecruitedStudentCurrentState(env, 1, "student-a", {
      level: 87,
      skillEx: 5,
      skillNormal: 10,
      skillEnhanced: 9,
      skillSub: 8,
      equip1: 10,
      equip2: 9,
      equip3: 8,
      equipSpecial: 2,
      weaponLevel: 50,
      abilityHp: 25,
      abilityAtk: 26,
      abilityHeal: 27,
    });

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      tier: 4,
      level: 87,
      skillEx: 5,
      skillNormal: 10,
      skillEnhanced: 9,
      skillSub: 8,
      equip1: 10,
      equip2: 9,
      equip3: 8,
      equipSpecial: 2,
      weaponLevel: 50,
      abilityHp: 25,
      abilityAtk: 26,
      abilityHeal: 27,
    });
  });

  it("does not create a recruited row when updating current state for a non-recruited student", async () => {
    const { db, env } = createEnv();

    await updateRecruitedStudentCurrentState(env, 1, "student-a", {
      level: 80,
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
    });

    expect(db.rows).toHaveLength(0);
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
  });

  it("rejects out-of-range current values", async () => {
    const { env } = createEnv();

    await expect(
      updateRecruitedStudentCurrentState(env, 1, "student-a", {
        level: 91,
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
      }),
    ).rejects.toThrow("레벨은(는) 1부터 90 사이만 입력할 수 있어요");
  });

  it("loads recruited current fields with the tier", async () => {
    const { db, env } = createEnv();
    db.rows.push(createRecruitedStudentRow({ level: 80, skillEx: 4, equip1: 7, weaponLevel: 50, abilityAtk: 12 }));

    await expect(getRecruitedStudents(env, 1)).resolves.toEqual([
      expect.objectContaining({
        studentUid: "student-a",
        tier: 3,
        level: 80,
        skillEx: 4,
        equip1: 7,
        weaponLevel: 50,
        abilityAtk: 12,
      }),
    ]);
  });
});
