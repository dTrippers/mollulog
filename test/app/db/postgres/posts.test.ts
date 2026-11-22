import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  getPostgresLatestPostTime,
  getPostgresNewsPosts,
  getPostgresPostByTimelineContentUid,
  getPostgresPostByUid,
  getPostgresPosts,
  getPostgresRecentNewsPosts,
} from "~/db/postgres/posts";

function postRow(
  uid = "post-1",
  createdAt = "2026-07-14T00:00:00.000Z",
  timelineContentUid: string | null = null,
  board = "news",
  publishedAt: string | null = createdAt,
) {
  return [
    1,
    uid,
    "제목",
    "본문",
    board,
    timelineContentUid,
    null,
    publishedAt ? new Date(publishedAt) : null,
    new Date(createdAt),
    new Date(createdAt),
  ];
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
        timelineContentUid: null,
        thumbnailImageUrl: null,
        publishedAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z",
      },
    ]);

    const [{ text }, values] = (client.query as jest.Mock).mock.calls[0] as [{ text: string }, unknown[]];
    expect(text).toContain('where ("posts"."published_at" is not null and "posts"."board" = $1)');
    expect(text).toContain('order by "posts"."published_at" desc, "posts"."uid" desc');
    expect(values).toEqual(["news"]);
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("loads the operationally unique post linked to a timeline content", async () => {
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query: jest.fn(async () => ({
        rows: [postRow("live-post", "2026-07-26T00:00:00.000Z", "live-stream-1")],
        rowCount: 1,
      })),
    } as unknown as Client;

    await expect(
      getPostgresPostByTimelineContentUid(
        { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive },
        "live-stream-1",
        { createClient: () => client },
      ),
    ).resolves.toMatchObject({
      uid: "live-post",
      timelineContentUid: "live-stream-1",
    });

    const [{ text }, values] = (client.query as jest.Mock).mock.calls[0] as [{ text: string }, unknown[]];
    expect(text).toContain('where ("posts"."published_at" is not null and "posts"."timeline_content_uid" = $1)');
    expect(text).toContain('order by "posts"."published_at" desc, "posts"."uid" desc');
    expect(values).toEqual(["live-stream-1", 1]);
  });

  it("loads a post directly by uid without filtering by board", async () => {
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query: jest.fn(async () => ({
        rows: [postRow("notice-1", "2026-07-26T00:00:00.000Z", null, "notice")],
        rowCount: 1,
      })),
    } as unknown as Client;

    await expect(
      getPostgresPostByUid({ HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive }, "notice-1", {
        createClient: () => client,
      }),
    ).resolves.toMatchObject({
      uid: "notice-1",
      board: "notice",
    });

    const [{ text }, values] = (client.query as jest.Mock).mock.calls[0] as [{ text: string }, unknown[]];
    expect(text).toContain('where ("posts"."published_at" is not null and "posts"."uid" = $1)');
    expect(text).toContain("limit $2");
    expect(values).toEqual(["notice-1", 1]);
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

  it("loads recent news excluding the current post, newest first, limited to the requested count", async () => {
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query: jest.fn(async () => ({ rows: [postRow("post-2")], rowCount: 1 })),
    } as unknown as Client;

    await expect(
      getPostgresRecentNewsPosts({ HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive }, "post-1", 3, {
        createClient: () => client,
      }),
    ).resolves.toMatchObject([{ uid: "post-2", board: "news" }]);

    const [{ text }, values] = (client.query as jest.Mock).mock.calls[0] as [{ text: string }, unknown[]];
    expect(text).toContain('"posts"."uid" <> $2');
    expect(text).toContain('order by "posts"."published_at" desc, "posts"."uid" desc');
    expect(text).toContain("limit $3");
    expect(values).toEqual(["news", "post-1", 3]);
    expect(client.end).toHaveBeenCalledTimes(1);
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

    // The news badge counts from the publish time, so a draft saved later must not move it.
    const [{ text }] = query.mock.calls[0] as [{ text: string }];
    expect(text).toContain('select "published_at" from "posts"');
    expect(text).toContain('where ("posts"."published_at" is not null and "posts"."board" = $1)');
    expect(text).toContain('order by "posts"."published_at" desc, "posts"."uid" desc');
  });

  it("counts and lists only published news posts", async () => {
    const query = jest.fn(async (config: { text: string }, _values?: unknown[]) =>
      config.text.includes("count") ? { rows: [[1]], rowCount: 1 } : { rows: [postRow("post-1")], rowCount: 1 },
    );
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query,
    } as unknown as Client;

    await getPostgresNewsPosts({ HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive }, 1, 5, {
      createClient: () => client,
    });

    for (const [config] of query.mock.calls) {
      expect((config as { text: string }).text).toContain('"posts"."published_at" is not null');
    }
  });

  it("fails instead of exposing a draft row that reaches a public read", async () => {
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query: jest.fn(async () => ({
        rows: [postRow("draft-1", "2026-07-26T00:00:00.000Z", null, "news", null)],
        rowCount: 1,
      })),
    } as unknown as Client;

    await expect(
      getPostgresPostByUid({ HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive }, "draft-1", {
        createClient: () => client,
      }),
    ).rejects.toThrow("Draft post draft-1 reached a public read");
  });
});
