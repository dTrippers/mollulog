import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  createPostgresWalkthroughTimeline,
  deletePostgresWalkthroughTimeline,
  getPostgresWalkthroughTimeline,
  listPostgresPublicWalkthroughTimelines,
  listPostgresPublicWalkthroughTimelinesByBoss,
  updatePostgresWalkthroughTimeline,
} from "~/db/postgres/walkthrough-timelines";
import type { WalkthroughTimelineDocument } from "~/domain/walkthrough-timeline";

const document: WalkthroughTimelineDocument = {
  type: "walkthrough_timeline",
  schemaVersion: 1,
  partySize: 6,
  context: { bossUid: "boss-1", terrain: "indoor", defenseType: "heavy", maxDifficulty: "torment" },
  parties: [],
};

function postgresRow(uid = "timeline-1"): unknown[] {
  return [
    uid,
    10,
    "공략",
    "공략 설명",
    "public",
    "boss-1",
    "indoor",
    "heavy",
    "torment",
    document,
    new Date("2026-07-14T00:00:00Z"),
    new Date("2026-07-14T00:00:00Z"),
  ];
}

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
const input = {
  title: "공략",
  description: "공략 설명",
  visibility: "public" as const,
  bossUid: "boss-1",
  terrain: "indoor" as const,
  defenseType: "heavy" as const,
  maxDifficulty: "torment" as const,
  document,
};

describe("PostgreSQL walkthrough timelines", () => {
  it("creates and parses a timeline using only the PostgreSQL table", async () => {
    const { client, query } = createClient(() => [postgresRow()]);
    const result = await createPostgresWalkthroughTimeline(env, 10, input, { createClient: () => client });
    expect(result.uid).toBe("timeline-1");
    expect(result.description).toBe("공략 설명");
    expect(result.terrain).toBe("indoor");
    const sql = (query.mock.calls[0]?.[0] as { text: string }).text;
    expect(sql).toContain('insert into "raid_walkthroughs"');
    expect(sql).not.toContain("community_posts");
    expect(sql).not.toContain("party_info");
  });

  it("reads and lists public boss timelines in latest-update order", async () => {
    const { client, query } = createClient(() => [postgresRow()]);
    const options = { createClient: () => client };
    await expect(getPostgresWalkthroughTimeline(env, "timeline-1", options)).resolves.toMatchObject({
      uid: "timeline-1",
    });
    await expect(
      listPostgresPublicWalkthroughTimelinesByBoss(
        env,
        { bossUid: "boss-1", terrain: "indoor", defenseType: "heavy" },
        options,
      ),
    ).resolves.toHaveLength(1);
    const listSql = (query.mock.calls[1]?.[0] as { text: string }).text;
    expect(listSql).toContain('"visibility" = $2');
    expect(listSql).toContain('"terrain" = $3');
    expect(listSql).toContain('order by "raid_walkthroughs"."updated_at" desc');

    await expect(
      listPostgresPublicWalkthroughTimelines(env, { maxDifficulty: "torment" }, options),
    ).resolves.toHaveLength(1);
    const filteredListSql = (query.mock.calls[2]?.[0] as { text: string }).text;
    expect(filteredListSql).toContain('"visibility" = $1');
    expect(filteredListSql).toContain('"max_difficulty" = $2');
  });

  it("scopes updates and deletes to the owner", async () => {
    const { client, query } = createClient((sql) => (sql.includes("returning") ? [postgresRow()] : []));
    const options = { createClient: () => client };
    await expect(updatePostgresWalkthroughTimeline(env, "timeline-1", 10, input, options)).resolves.toMatchObject({
      uid: "timeline-1",
    });
    await expect(deletePostgresWalkthroughTimeline(env, "timeline-1", 10, options)).resolves.toBe(true);
    for (const call of query.mock.calls) {
      const sql = (call[0] as { text: string }).text;
      expect(sql).toContain('"uid" = $');
      expect(sql).toContain('"user_id" = $');
    }
  });

  it("rejects a malformed JSONB document instead of rendering fallback data", async () => {
    const malformed = postgresRow();
    malformed[9] = { type: "walkthrough_timeline", schemaVersion: 999 };
    const { client } = createClient(() => [malformed]);
    await expect(getPostgresWalkthroughTimeline(env, "timeline-1", { createClient: () => client })).rejects.toThrow(
      "schemaVersion",
    );
  });
});
