import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  applyPostgresFavoriteState,
  getPostgresFavoritedCounts,
  getPostgresUserFavoritedStudents,
  setPostgresFavoriteState,
} from "~/db/postgres/favorite-students";

function createClient(rowsFor: (sql: string) => unknown[][]) {
  const query = jest.fn(async (config: { text: string }, _values?: unknown[]) => ({
    rows: rowsFor(config.text),
    rowCount: 1,
  }));
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
    query,
  } as unknown as Client;
  return { client, query };
}

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive };

describe("PostgreSQL favorite students", () => {
  it("reads signed-in favorites from canonical rows", async () => {
    const { client, query } = createClient(() => [["favorite-1", "student-1", "content-1"]]);

    await expect(
      getPostgresUserFavoritedStudents(env, 10, "content-1", { createClient: () => client }),
    ).resolves.toEqual([{ uid: "favorite-1", studentId: "student-1", contentId: "content-1" }]);

    const sql = (query.mock.calls[0]?.[0] as { text: string }).text;
    expect(sql).toContain('from "content_favorite_students"');
    expect(sql).toContain('"user_id" = $1');
    expect(sql).toContain('"student_uid"');
    expect(sql).toContain('"timeline_content_uid" = $2');
    expect(sql).not.toContain('"student_id"');
    expect(sql).not.toContain('"content_id"');
  });

  it("aggregates public counts directly from canonical rows", async () => {
    const { client, query } = createClient(() => [["student-1", "content-1", 3]]);

    await expect(
      getPostgresFavoritedCounts(env, ["student-1", "student-1"], { createClient: () => client }),
    ).resolves.toEqual([{ studentId: "student-1", contentId: "content-1", count: 3 }]);

    const sql = (query.mock.calls[0]?.[0] as { text: string }).text;
    expect(sql).toContain("count(*)");
    expect(sql).toContain('from "content_favorite_students"');
    expect(sql).toContain('"student_uid"');
    expect(sql).toContain('"timeline_content_uid"');
    expect(sql).not.toContain("content_favorite_counts");
    expect((query.mock.calls[0]?.[1] as unknown[]).filter((value) => value === "student-1")).toHaveLength(1);
  });

  it("applies shadow state with the D1 row identity", async () => {
    const { client, query } = createClient(() => []);
    const record = {
      id: 42,
      uid: "favorite-42",
      userId: 10,
      studentId: "student-1",
      contentId: "content-1",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    } as const;

    await applyPostgresFavoriteState(env, record, record, { createClient: () => client });

    const sql = (query.mock.calls[0]?.[0] as { text: string }).text;
    expect(sql).toContain('insert into "content_favorite_students"');
    expect(sql).toContain('on conflict ("user_id","timeline_content_uid","student_uid") do update');
  });

  it("keeps direct PostgreSQL favorite and unfavorite idempotent", async () => {
    const { client, query } = createClient(() => []);
    const options = { createClient: () => client };
    const key = { userId: 10, studentId: "student-1", contentId: "content-1" };

    await setPostgresFavoriteState(env, key, true, options);
    await setPostgresFavoriteState(env, key, false, options);

    const sqlTexts = query.mock.calls.map(([config]) => (config as { text: string }).text);
    expect(sqlTexts[0]).toContain("do nothing");
    expect(sqlTexts[1]).toContain('delete from "content_favorite_students"');
  });
});
