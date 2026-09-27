import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { savePostgresIntegratedRecruitmentPlan } from "~/db/postgres/integrated-planner";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;

function createClient(options: { failOn?: string } = {}) {
  const queries: string[] = [];
  const query = jest.fn(async (config: { text: string } | string) => {
    const text = typeof config === "string" ? config : config.text;
    queries.push(text);
    if (options.failOn && text.toLowerCase().includes(options.failOn.toLowerCase())) {
      throw new Error("query failed");
    }
    return { rows: [], rowCount: 1 };
  });
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
    query,
  } as unknown as Client;
  return { client, queries };
}

describe("PostgreSQL integrated planner", () => {
  it("rolls back favorite changes when saving favorites fails", async () => {
    const { client, queries } = createClient({ failOn: 'insert into "content_favorite_students"' });

    await expect(
      savePostgresIntegratedRecruitmentPlan(env, 7, "event-1", ["student-1"], {
        createClient: () => client,
      }),
    ).rejects.toThrow();

    const normalizedQueries = queries.map((query) => query.toLowerCase());
    const favoriteInsertIndex = normalizedQueries.findIndex((query) =>
      query.includes('insert into "content_favorite_students"'),
    );
    expect(normalizedQueries).toContain("begin");
    expect(favoriteInsertIndex).toBeGreaterThan(-1);
    expect(normalizedQueries.some((query) => query.includes('"pyroxene_event_data"'))).toBe(false);
    expect(normalizedQueries).toContain("rollback");
    expect(normalizedQueries).not.toContain("commit");
  });

  it("saves event-specific favorites without writing recruitment counts", async () => {
    const { client, queries } = createClient();

    await expect(
      savePostgresIntegratedRecruitmentPlan(env, 7, "event-1", ["student-1"], {
        createClient: () => client,
      }),
    ).resolves.toBeUndefined();

    const normalizedQueries = queries.map((query) => query.toLowerCase());
    const favoriteInsertIndex = normalizedQueries.findIndex((query) =>
      query.includes('insert into "content_favorite_students"'),
    );
    expect(normalizedQueries).toContain("begin");
    expect(favoriteInsertIndex).toBeGreaterThan(-1);
    expect(normalizedQueries.some((query) => query.includes('"pyroxene_event_data"'))).toBe(false);
    expect(normalizedQueries).toContain("commit");
    expect(normalizedQueries).not.toContain("rollback");
  });
});
