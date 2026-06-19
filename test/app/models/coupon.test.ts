import { describe, expect, it } from "@jest/globals";
import { hasUnregisteredActiveCoupons } from "~/models/coupon";

type CouponRow = {
  id: number;
  expiresAt: string | null;
};

class FakeD1Statement {
  private params: unknown[] = [];

  constructor(
    private readonly db: FakeCouponD1Database,
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
}

class FakeCouponD1Database {
  readonly coupons: CouponRow[] = [];
  readonly registrations = new Set<string>();

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  selectRows(sql: string, params: unknown[]): Record<string, unknown>[] {
    const normalizedSql = normalizeSql(sql);
    if (!normalizedSql.includes("from coupons")) {
      throw new Error(`Unexpected SELECT SQL: ${sql}\nparams: ${JSON.stringify(params)}`);
    }

    const nowIso = params.find((param): param is string => typeof param === "string") ?? new Date().toISOString();
    const userId = Number(params.find((param) => typeof param === "number" && Number(param) > 1));
    return this.coupons.some(
      (coupon) =>
        (coupon.expiresAt === null || coupon.expiresAt > nowIso) && !this.registrations.has(`${userId}:${coupon.id}`),
    )
      ? [{ exists: 1 }]
      : [];
  }
}

function createEnv() {
  const db = new FakeCouponD1Database();
  return {
    db,
    env: { DB: db } as unknown as Env,
  };
}

function normalizeSql(sql: string): string {
  return sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("coupon personal navigation state", () => {
  it("returns true only when the user has an active coupon without a registration record", async () => {
    const { db, env } = createEnv();
    db.coupons.push(
      { id: 1, expiresAt: "2000-01-01T00:00:00.000Z" },
      { id: 2, expiresAt: null },
      { id: 3, expiresAt: "2999-01-01T00:00:00.000Z" },
    );
    db.registrations.add("7:2");
    db.registrations.add("7:3");

    await expect(hasUnregisteredActiveCoupons(env, 7)).resolves.toBe(false);

    db.registrations.delete("7:3");
    await expect(hasUnregisteredActiveCoupons(env, 7)).resolves.toBe(true);
  });
});
