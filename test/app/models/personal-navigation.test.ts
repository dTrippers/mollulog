import { describe, expect, it, jest } from "@jest/globals";
import { getPersonalNavigationState } from "~/models/personal-navigation";

type PreparedStatement = {
  sql: string;
  params: unknown[];
};

class FakeD1Statement {
  constructor(private readonly sql: string) {}

  bind(...params: unknown[]): PreparedStatement {
    return { sql: this.sql, params };
  }
}

class FakeD1Database {
  readonly executedSql: string[] = [];
  readonly batch = jest.fn(async (statements: PreparedStatement[]) =>
    statements.map((statement) => ({
      success: true,
      results: this.selectRows(statement.sql),
      meta: { changes: 0 },
    })),
  );

  prepare(sql: string): FakeD1Statement {
    this.executedSql.push(sql);
    return new FakeD1Statement(sql);
  }

  selectRows(sql: string): Record<string, unknown>[] {
    const normalizedSql = sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
    if (normalizedSql.includes("from coupons") || normalizedSql.includes("from feedback_tickets")) {
      return [{ exists: 1 }];
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

describe("personal navigation query shape", () => {
  it("loads both personal red dots in one D1 statement", async () => {
    const db = new FakeD1Database();
    const env = { DB: db } as unknown as Env;

    await expect(getPersonalNavigationState(env, 42)).resolves.toEqual({
      hasUnconsumedCoupons: true,
      hasUnreadFeedbackReplies: true,
    });
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.executedSql).toHaveLength(2);
  });
});
