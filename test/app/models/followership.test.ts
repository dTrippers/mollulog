import { describe, expect, it } from "@jest/globals";
import { getFollowerIds, getFollowershipSummary, getFollowingIds } from "~/models/followership";

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

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    return { results: this.db.selectRows(this.sql, this.params) };
  }

  async raw(): Promise<unknown[][]> {
    return this.db.selectRows(this.sql, this.params).map((row) => Object.values(row));
  }

  async get(): Promise<Record<string, unknown> | undefined> {
    return this.db.selectRows(this.sql, this.params)[0];
  }

  async first(): Promise<Record<string, unknown> | undefined> {
    return this.get();
  }

  execute(): { success: true; results: Record<string, unknown>[]; meta: { changes: 0 } } {
    return { success: true, results: this.db.selectRows(this.sql, this.params), meta: { changes: 0 } };
  }
}

class FakeD1Database {
  readonly followerships = [
    { followerId: 1, followeeId: 2 },
    { followerId: 1, followeeId: 3 },
    { followerId: 2, followeeId: 1 },
    { followerId: 4, followeeId: 1 },
  ];
  readonly executedSql: string[] = [];
  batchCalls = 0;

  async batch(statements: FakeD1Statement[]) {
    this.batchCalls += 1;
    return statements.map((statement) => statement.execute());
  }

  prepare(sql: string): FakeD1Statement {
    this.executedSql.push(sql);
    return new FakeD1Statement(this, sql);
  }

  selectRows(sql: string, params: unknown[]): Record<string, unknown>[] {
    const normalizedSql = sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();

    const userId = Number(params[0]);
    if (normalizedSql.includes("select count(*)") && normalizedSql.includes(".followeeid =")) {
      return [{ count: this.followerships.filter((row) => row.followeeId === userId).length }];
    }
    if (normalizedSql.includes("select count(*)") && normalizedSql.includes(".followerid =")) {
      return [{ count: this.followerships.filter((row) => row.followerId === userId).length }];
    }
    if (normalizedSql.includes("select id from followerships")) {
      const otherId = Number(params[1]);
      return this.followerships.some((row) => row.followerId === userId && row.followeeId === otherId)
        ? [{ id: 1 }]
        : [];
    }
    if (normalizedSql.includes("select followerid from followerships")) {
      return this.followerships
        .filter((row) => row.followeeId === userId)
        .map((row) => ({ followerId: row.followerId }));
    }
    if (normalizedSql.includes("select followeeid from followerships")) {
      return this.followerships
        .filter((row) => row.followerId === userId)
        .map((row) => ({ followeeId: row.followeeId }));
    }

    throw new Error(`Unexpected SQL: ${sql}\nparams: ${JSON.stringify(params)}`);
  }
}

function createEnv() {
  const db = new FakeD1Database();
  return { db, env: { DB: db } as unknown as Env };
}

describe("followership query shape", () => {
  it("returns counts and viewer relationships in one ORM batch", async () => {
    const { db, env } = createEnv();

    await expect(getFollowershipSummary(env, 1, 2)).resolves.toEqual({
      followerCount: 2,
      followingCount: 2,
      followed: true,
      following: true,
    });
    expect(db.batchCalls).toBe(1);
    expect(db.executedSql).toHaveLength(4);
  });

  it("selects only the required id column for list callers", async () => {
    const { db, env } = createEnv();

    await expect(getFollowerIds(env, 1)).resolves.toEqual([2, 4]);
    await expect(getFollowingIds(env, 1)).resolves.toEqual([2, 3]);
    expect(db.executedSql[0]).toMatch(/select "followerId" from "followerships"/i);
    expect(db.executedSql[1]).toMatch(/select "followeeId" from "followerships"/i);
  });
});
