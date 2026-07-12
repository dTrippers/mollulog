import { describe, expect, it, jest } from "@jest/globals";
import { favoriteStudent, getFavoritedCounts, unfavoriteStudent } from "../../../app/models/favorite-students";

class PreparedStatement {
  constructor(
    private readonly db: FakeD1Database,
    readonly sql: string,
    readonly params: unknown[],
  ) {}

  async raw(): Promise<unknown[][]> {
    return this.db.selectRows(this.sql, this.params);
  }

  async all(): Promise<{ results: unknown[][] }> {
    return { results: await this.raw() };
  }
}

class FakeD1Statement {
  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]): PreparedStatement {
    return new PreparedStatement(this.db, this.sql, params);
  }
}

class FakeD1Database {
  readonly favorites = new Set<string>();
  readonly counts = new Map<string, number>();
  activeReads = 0;
  maxConcurrentReads = 0;
  readDelayMs = 0;
  private lastChanges = 0;

  readonly batch = jest.fn(async (statements: PreparedStatement[]) => {
    for (const statement of statements) {
      this.execute(statement);
    }
    return statements.map(() => ({ success: true, results: [], meta: { changes: this.lastChanges } }));
  });

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  async selectRows(sql: string, _params: unknown[]): Promise<unknown[][]> {
    const normalizedSql = sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalizedSql.includes("from content_favorite_counts")) {
      throw new Error(`Unexpected SELECT SQL: ${sql}`);
    }

    this.activeReads += 1;
    this.maxConcurrentReads = Math.max(this.maxConcurrentReads, this.activeReads);
    try {
      if (this.readDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.readDelayMs));
      }
      return [];
    } finally {
      this.activeReads -= 1;
    }
  }

  private favoriteKey(userId: unknown, studentId: unknown, contentId: unknown): string {
    return `${userId}:${contentId}:${studentId}`;
  }

  private countKey(studentId: unknown, contentId: unknown): string {
    return `${studentId}:${contentId}`;
  }

  private execute(statement: PreparedStatement): void {
    const normalizedSql = statement.sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();

    if (normalizedSql.startsWith("insert into content_favorite_students")) {
      const [, userId, studentId, contentId] = statement.params;
      const key = this.favoriteKey(userId, studentId, contentId);
      this.lastChanges = this.favorites.has(key) ? 0 : 1;
      this.favorites.add(key);
      return;
    }

    if (normalizedSql.startsWith("insert into content_favorite_counts")) {
      const [studentId, contentId] = statement.params;
      const key = this.countKey(studentId, contentId);
      this.counts.set(key, (this.counts.get(key) ?? 0) + this.lastChanges);
      this.lastChanges = 1;
      return;
    }

    if (normalizedSql.startsWith("delete from content_favorite_students")) {
      const [userId, studentId, contentId] = statement.params;
      const key = this.favoriteKey(userId, studentId, contentId);
      this.lastChanges = this.favorites.delete(key) ? 1 : 0;
      return;
    }

    if (normalizedSql.startsWith("update content_favorite_counts")) {
      const [studentId, contentId] = statement.params;
      const key = this.countKey(studentId, contentId);
      if (this.counts.has(key)) {
        this.counts.set(key, Math.max((this.counts.get(key) ?? 0) - this.lastChanges, 0));
        this.lastChanges = 1;
      } else {
        this.lastChanges = 0;
      }
      return;
    }

    throw new Error(`Unexpected SQL: ${statement.sql}`);
  }
}

function createEnv() {
  const db = new FakeD1Database();
  return {
    db,
    env: { DB: db } as unknown as Env,
  };
}

describe("favorite-students", () => {
  it("increments the cached count only when a favorite row is inserted", async () => {
    const { db, env } = createEnv();

    await favoriteStudent(env, 1, "student-a", "event-a");
    await favoriteStudent(env, 1, "student-a", "event-a");
    await favoriteStudent(env, 2, "student-a", "event-a");

    expect(db.counts.get("student-a:event-a")).toBe(2);
    expect(db.batch).toHaveBeenCalledTimes(3);
    expect(db.batch.mock.calls.every(([statements]) => statements.length === 2)).toBe(true);
  });

  it("decrements the cached count only when a favorite row is deleted", async () => {
    const { db, env } = createEnv();

    await favoriteStudent(env, 1, "student-a", "event-a");
    await favoriteStudent(env, 2, "student-a", "event-a");
    await unfavoriteStudent(env, 1, "student-a", "event-a");
    await unfavoriteStudent(env, 1, "student-a", "event-a");

    expect(db.counts.get("student-a:event-a")).toBe(1);
    expect(db.favorites.has("2:event-a:student-a")).toBe(true);
  });

  it("keeps the cached count from going below zero", async () => {
    const { db, env } = createEnv();

    await favoriteStudent(env, 1, "student-a", "event-a");
    await unfavoriteStudent(env, 1, "student-a", "event-a");
    await unfavoriteStudent(env, 1, "student-a", "event-a");

    expect(db.counts.get("student-a:event-a")).toBe(0);
  });

  it("limits concurrent favorite-count batch reads", async () => {
    const { db, env } = createEnv();
    db.readDelayMs = 5;
    const studentIds = Array.from({ length: 451 }, (_, index) => `student-${index}`);

    await expect(getFavoritedCounts(env, studentIds)).resolves.toEqual([]);

    expect(db.maxConcurrentReads).toBe(4);
  });
});
