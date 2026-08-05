import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  canPostgresWalkthroughTimelineReceiveLike,
  getPostgresWalkthroughTimelineLikeSummaries,
  setPostgresWalkthroughTimelineLike,
} from "~/db/postgres/walkthrough-timeline-likes";

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

describe("PostgreSQL walkthrough timeline likes", () => {
  it("reads counts and the current user's state from the walkthrough like model", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes("count(*)")) return [["timeline-1", 3]];
      return [["timeline-1"]];
    });

    await expect(
      getPostgresWalkthroughTimelineLikeSummaries(env, ["timeline-1", "timeline-2"], 10, {
        createClient: () => client,
      }),
    ).resolves.toEqual({
      "timeline-1": { liked: true, likeCount: 3 },
      "timeline-2": { liked: false, likeCount: 0 },
    });

    const calls = query.mock.calls.map(([config, values]) => ({
      text: (config as { text: string }).text,
      values,
    }));
    const sqlTexts = calls.map(({ text }) => text);
    expect(sqlTexts).toHaveLength(2);
    expect(sqlTexts[0]).toContain('from "raid_walkthrough_likes"');
    expect(sqlTexts[0]).toContain('inner join "raid_walkthroughs"');
    expect(sqlTexts[0]).toContain('"raid_walkthroughs"."visibility"');
    expect(sqlTexts[0]).not.toContain("community_author_mutes");
    expect(sqlTexts[0]).toContain("count(*)");
    expect(sqlTexts[1]).toContain('"user_id" = $1');
    expect(sqlTexts[1]).not.toContain("community_author_mutes");
    expect(calls[1].values).toContain(10);
  });

  it("checks whether the viewer may add a like without hiding existing engagement", async () => {
    const { client, query } = createClient(() => [["timeline-1"]]);

    await expect(
      canPostgresWalkthroughTimelineReceiveLike(env, "timeline-1", 10, { createClient: () => client }),
    ).resolves.toBe(true);

    const sql = (query.mock.calls[0]?.[0] as { text: string }).text;
    expect(sql).toContain('from "raid_walkthroughs"');
    expect(sql).toContain("community_author_mutes");
    expect(sql).toContain("NOT EXISTS");
    expect(query.mock.calls[0]?.[1]).toContain(10);
  });

  it("keeps like and unlike operations idempotent for public walkthroughs", async () => {
    const { client, query } = createClient((sql) => (sql.includes('from "raid_walkthroughs"') ? [["timeline-1"]] : []));
    const options = { createClient: () => client };

    await expect(setPostgresWalkthroughTimelineLike(env, "timeline-1", 10, true, options)).resolves.toBe(true);
    await expect(setPostgresWalkthroughTimelineLike(env, "timeline-1", 10, false, options)).resolves.toBe(true);

    const sqlTexts = query.mock.calls.map(([config]) => (config as { text: string }).text);
    const targetQueries = query.mock.calls.filter(([config]) =>
      (config as { text: string }).text.includes('from "raid_walkthroughs"'),
    );
    expect(targetQueries).toHaveLength(2);
    expect(targetQueries[0]?.[0].text).toContain("community_author_mutes");
    expect(targetQueries[0]?.[0].text).toContain("NOT EXISTS");
    expect(targetQueries[0]?.[1]).toContain(10);
    expect(targetQueries[1]?.[0].text).not.toContain("community_author_mutes");
    expect(sqlTexts.find((sql) => sql.startsWith('insert into "raid_walkthrough_likes"'))).toContain("do nothing");
    expect(sqlTexts.find((sql) => sql.startsWith('delete from "raid_walkthrough_likes"'))).toContain(
      '"walkthrough_uid" = $1',
    );
  });

  it("does not mutate likes when the walkthrough is missing or private", async () => {
    const { client, query } = createClient(() => []);

    await expect(
      setPostgresWalkthroughTimelineLike(env, "timeline-private", 10, true, { createClient: () => client }),
    ).resolves.toBe(false);

    expect(query).toHaveBeenCalledTimes(1);
    const sql = (query.mock.calls[0]?.[0] as { text: string }).text;
    expect(sql).toContain('from "raid_walkthroughs"');
    expect(sql).toContain('"visibility" = $2');
    expect(sql).toContain("community_author_mutes");
    expect(sql).toContain("NOT EXISTS");
  });
});
