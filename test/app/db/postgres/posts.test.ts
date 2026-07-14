import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { getPostgresLatestPostTime, getPostgresNewsPosts, getPostgresPosts } from "~/db/postgres/posts";

function postRow(uid = "post-1", createdAt = "2026-07-14T00:00:00.000Z") {
  return [1, uid, "제목", "본문", "news", new Date(createdAt), new Date(createdAt)];
}

describe("PostgreSQL posts read", () => {
  it("maps timestamps and keeps all-post ordering deterministic", async () => {
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query: jest.fn(async () => ({ rows: [postRow()], rowCount: 1 })),
    } as unknown as Client;

    await expect(
      getPostgresPosts({ HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive }, "news", {
        createClient: () => client,
      }),
    ).resolves.toEqual([
      {
        uid: "post-1",
        title: "제목",
        content: "본문",
        board: "news",
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z",
      },
    ]);

    const [{ text }, values] = (client.query as jest.Mock).mock.calls[0] as [{ text: string }, unknown[]];
    expect(text).toContain('where "posts"."board" = $1');
    expect(text).toContain('order by "posts"."created_at" desc, "posts"."uid" desc');
    expect(values).toEqual(["news"]);
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("preserves page clamping and uses one Hyperdrive connection for count and rows", async () => {
    const query = jest.fn(async (config: { text: string }, _values?: unknown[]) =>
      config.text.includes("count") ? { rows: [[6]], rowCount: 1 } : { rows: [postRow("post-6")], rowCount: 1 },
    );
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query,
    } as unknown as Client;

    await expect(
      getPostgresNewsPosts({ HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive }, 99, 5, {
        createClient: () => client,
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ uid: "post-6" })],
      page: 2,
      pageSize: 5,
      totalCount: 6,
      totalPages: 2,
    });

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
    expect(client.end).toHaveBeenCalledTimes(1);
    const pageQuery = query.mock.calls[1]?.[0] as { text: string };
    const pageValues = query.mock.calls[1]?.[1];
    expect(pageQuery.text).toContain("limit $2");
    expect(pageQuery.text).toContain("offset $3");
    expect(pageValues).toEqual(["news", 5, 5]);
  });

  it("returns the latest post time as a Date and null for an empty board", async () => {
    const query = jest
      .fn<(config: { text: string }) => Promise<{ rows: unknown[][]; rowCount: number }>>()
      .mockResolvedValueOnce({ rows: [[new Date("2026-07-14T00:00:00.000Z")]], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query,
    } as unknown as Client;
    const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive };
    const options = { createClient: () => client };

    await expect(getPostgresLatestPostTime(env, "news", options)).resolves.toEqual(
      new Date("2026-07-14T00:00:00.000Z"),
    );
    await expect(getPostgresLatestPostTime(env, "empty", options)).resolves.toBeNull();
  });
});
