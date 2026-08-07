import { describe, expect, it, jest } from "@jest/globals";
import {
  getRecruitedStudents,
  updateRecruitedStudentCurrentState,
  upsertRecruitedStudent,
  upsertRecruitedStudentState,
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
  readonly selectParameterCounts: number[] = [];

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  selectRows(sql: string, params: unknown[]): RecruitedStudentRow[] {
    const normalizedSql = normalizeSql(sql);
    if (normalizedSql.includes("from recruited_students")) {
      this.selectParameterCounts.push(params.length);
      const userId = Number(params[0]);
      const requestedStudentUids = normalizedSql.includes("studentuid in")
        ? new Set(params.slice(1).map(String))
        : null;
      const rows = this.rows.filter(
        (row) => row.userId === userId && (!requestedStudentUids || requestedStudentUids.has(row.studentUid)),
      );
      if (normalizedSql.includes("select tier")) {
        return rows.map((row) => ({ tier: row.tier }) as RecruitedStudentRow);
      }
      if (normalizedSql.includes("select weaponlevel")) {
        return rows.map(
          (row) =>
            ({
              weaponLevel: row.weaponLevel,
              abilityHp: row.abilityHp,
              abilityAtk: row.abilityAtk,
              abilityHeal: row.abilityHeal,
            }) as RecruitedStudentRow,
        );
      }
      return rows;
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
      const writesCurrentState = params.length > 5;
      const tier = Number(writesCurrentState ? params[4 + currentStateFields.length] : params.at(-1));
      const recruitedRow = this.rows.find(
        (candidate) => candidate.userId === userId && candidate.studentUid === studentUid,
      );
      if (recruitedRow) {
        recruitedRow.tier = tier;
        if (writesCurrentState) {
          currentStateFields.forEach((field, index) => {
            const value = params[5 + currentStateFields.length + index];
            recruitedRow[field] = value == null ? null : Number(value);
          });
        }
        recruitedRow.updatedAt = "current_timestamp";
        return 1;
      }

      const currentState = writesCurrentState
        ? Object.fromEntries(
            currentStateFields.map((field, index) => [
              field,
              params[4 + index] == null ? null : Number(params[4 + index]),
            ]),
          )
        : {};
      this.rows.push(createRecruitedStudentRow({ uid: String(params[0]), userId, studentUid, tier, ...currentState }));
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

function createEnv(db = new FakePostgresClient()): { db: FakePostgresClient; env: Env } {
  return {
    db,
    env: { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
  };
}

function normalizeSql(sql: string): string {
  return sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
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

  it("creates a recruited student with its nullable current state", async () => {
    const { db, env } = createEnv();

    await upsertRecruitedStudentState(env, 1, "student-a", 6, {
      level: 80,
      weaponLevel: 20,
      abilityHp: null,
      abilityAtk: 10,
      abilityHeal: null,
      skillEx: 5,
      skillNormal: null,
      skillEnhanced: 8,
      skillSub: null,
      equip1: 10,
      equip2: null,
      equip3: 8,
      equipSpecial: null,
    });

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      studentUid: "student-a",
      tier: 6,
      level: 80,
      weaponLevel: 20,
      abilityHp: null,
      abilityAtk: 10,
      skillEx: 5,
      skillNormal: null,
      equip1: 10,
      equip2: null,
    });
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

  it("rejects tier updates that would leave ability release levels without a unique weapon", async () => {
    const { db, env } = createEnv();
    db.rows.push(createRecruitedStudentRow({ tier: 6, abilityHp: 1 }));

    await expect(upsertRecruitedStudent(env, 1, "student-a", 5)).rejects.toThrow(
      "능력 해방은(는) 고유무기 장착 후 입력할 수 있어요",
    );
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
  });

  it("loads recruited current fields with the tier", async () => {
    const { db, env } = createEnv();
    db.rows.push(createRecruitedStudentRow({ level: 80, skillEx: 4, equip1: 7 }));

    await expect(getRecruitedStudents(env, 1)).resolves.toEqual([
      expect.objectContaining({
        studentUid: "student-a",
        tier: 3,
        level: 80,
        skillEx: 4,
        equip1: 7,
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
});
