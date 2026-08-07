import { describe, expect, it, jest } from "@jest/globals";
import {
  getRelationshipLevels,
  resolveRelationshipLevelInput,
  upsertRelationshipLevel,
} from "../../../app/models/relationship-level";
import { FakePostgresClient } from "../../helpers/fake-postgres";

jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));

type RelationshipLevelRow = {
  id: number;
  uid: string;
  userId: number;
  studentId: string;
  currentLevel: number;
  currentExp: number | null;
  targetLevel: number;
  items: string;
  createdAt: string;
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

  async all(): Promise<{ results: RelationshipLevelRow[] }> {
    return { results: this.db.selectRows(this.sql, this.params) };
  }

  async raw(): Promise<unknown[][]> {
    return this.db.selectRows(this.sql, this.params).map((row) => Object.values(row));
  }
}

class FakeD1Database {
  readonly rows: RelationshipLevelRow[] = [];
  readonly selectParameterCounts: number[] = [];

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  selectRows(sql: string, params: unknown[]): RelationshipLevelRow[] {
    const normalizedSql = sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalizedSql.includes("from user_relationship_levels")) {
      throw new Error(`Unexpected SQL: ${sql}`);
    }

    this.selectParameterCounts.push(params.length);
    const userId = Number(params[0]);
    const requestedStudentIds = normalizedSql.includes("studentid in") ? new Set(params.slice(1).map(String)) : null;
    return this.rows.filter(
      (row) => row.userId === userId && (!requestedStudentIds || requestedStudentIds.has(row.studentId)),
    );
  }
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
    const db = new FakePostgresClient({}, "user_relationship_levels");
    const studentIds = Array.from({ length: 181 }, (_, index) => `student-${index}`);
    db.rows.push(
      ...studentIds.map((studentId, index) => ({
        id: index + 1,
        uid: `relationship-${index}`,
        userId: 1,
        studentId,
        currentLevel: 1,
        currentExp: null,
        targetLevel: 1,
        items: "{}",
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
      })),
    );

    await expect(
      getRelationshipLevels(
        { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
        1,
        [...studentIds, studentIds[0]],
      ),
    ).resolves.toHaveLength(181);
    expect(db.selectParameterCounts).toEqual([182]);
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
});
