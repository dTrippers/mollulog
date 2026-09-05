import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  createPostgresWalkthroughTimeline,
  createPostgresWalkthroughTimelineWithCommunityPost,
  deletePostgresWalkthroughTimelineWithCommunityPost,
  getPostgresWalkthroughTimeline,
  getPostgresWalkthroughTimelineVisibilitiesByUids,
  listPostgresPublicWalkthroughTimelines,
  listPostgresPublicWalkthroughTimelinesByBoss,
  listPostgresVisibleWalkthroughTimelines,
  listPostgresWalkthroughTimelinesByUser,
  updatePostgresWalkthroughTimelineWithCommunityPost,
} from "~/db/postgres/walkthrough-timelines";
import type { WalkthroughTimelineDocument } from "~/domain/walkthrough-timeline";

const document: WalkthroughTimelineDocument = {
  type: "walkthrough_timeline",
  schemaVersion: 1,
  partySize: 6,
  context: { bossUid: "boss-1", terrain: "indoor", defenseType: "heavy", maxDifficulty: "torment" },
  parties: [],
};

function postgresRow(uid = "timeline-1", visibility: "private" | "unlisted" | "public" = "public"): unknown[] {
  return [
    1,
    uid,
    10,
    "공략",
    "공략 설명",
    visibility,
    "boss-1",
    "indoor",
    "heavy",
    "torment",
    document,
    new Date("2026-07-14T00:00:00Z"),
    new Date("2026-07-14T00:00:00Z"),
  ];
}

function createClient(rowsFor: (sql: string) => unknown[], options: { failOn?: string; failOnlyOnce?: boolean } = {}) {
  let injectedFailure = false;
  const query = jest.fn(async (config: { text: string } | string, _values?: unknown[]) => ({
    rows: (() => {
      const text = typeof config === "string" ? config : config.text;
      if (options.failOn && text.includes(options.failOn) && (!options.failOnlyOnce || !injectedFailure)) {
        injectedFailure = true;
        throw new Error(`projection failed: ${options.failOn}`);
      }
      return rowsFor(text);
    })(),
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

    await expect(listPostgresPublicWalkthroughTimelines(env, { likedByUserId: 10 }, options)).resolves.toHaveLength(1);
    const likedListSql = (query.mock.calls[3]?.[0] as { text: string }).text;
    expect(likedListSql).toContain("exists");
    expect(likedListSql).toContain('from "raid_walkthrough_likes"');
    expect(likedListSql).toContain('"raid_walkthrough_likes"."user_id" = $2');

    await expect(listPostgresVisibleWalkthroughTimelines(env, { viewerUserId: 10 }, options)).resolves.toHaveLength(1);
    const visibleListSql = (query.mock.calls[4]?.[0] as { text: string }).text;
    expect(visibleListSql).toContain('"raid_walkthroughs"."visibility" = $1');
    expect(visibleListSql).toContain('"raid_walkthroughs"."user_id" = $2');
    expect(visibleListSql).toContain(" or ");
  });

  it("applies mute policy to public and profile walkthrough lists", async () => {
    const { client, query } = createClient(() => [postgresRow()]);
    const options = { createClient: () => client };

    await expect(listPostgresWalkthroughTimelinesByUser(env, 10, false, options)).resolves.toHaveLength(1);
    const profileListCall = query.mock.calls.at(-1);
    const profileListSql = (profileListCall?.[0] as { text: string }).text;
    expect(profileListSql).toContain("community_author_mutes");
    expect(profileListSql).toContain("NOT EXISTS");

    await expect(listPostgresPublicWalkthroughTimelines(env, { bossUid: "boss-1" }, options)).resolves.toHaveLength(1);
    const publicListCall = query.mock.calls.at(-1);
    const publicListSql = (publicListCall?.[0] as { text: string }).text;
    expect(publicListSql).toContain("community_author_mutes");
    expect(publicListSql).toContain("NOT EXISTS");

    await expect(listPostgresVisibleWalkthroughTimelines(env, { viewerUserId: 10 }, options)).resolves.toHaveLength(1);
    const visibleListCall = query.mock.calls.at(-1);
    const visibleListSql = (visibleListCall?.[0] as { text: string }).text;
    expect(visibleListSql).toContain("community_author_mutes");
    expect(visibleListSql).toContain("NOT EXISTS");
    expect(visibleListSql).toContain('"raid_walkthroughs"."user_id" = $2');
    expect(visibleListSql).toContain(" or ");
    expect(visibleListCall?.[1]).toContain(10);
  });

  it("reads only UID and visibility for the community feed guard", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes('from "raid_walkthroughs"') && sql.includes('"uid"') && sql.includes('"visibility"')) {
        return [["timeline-1", "public"]];
      }
      return [];
    });

    await expect(
      getPostgresWalkthroughTimelineVisibilitiesByUids(env, ["timeline-1"], { createClient: () => client }),
    ).resolves.toEqual([{ uid: "timeline-1", visibility: "public" }]);

    const sql = (query.mock.calls[0]?.[0] as { text: string }).text;
    expect(sql).toContain('select "uid", "visibility"');
    expect(sql).toContain('from "raid_walkthroughs"');
    expect(sql).not.toContain('"raid_walkthroughs"."document"');
  });

  it("scopes transactional updates and deletes to the owner", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes('update "raid_walkthroughs"')) return [postgresRow()];
      if (sql.includes('delete from "raid_walkthroughs"')) return [{ uid: "timeline-1" }];
      return [];
    });
    const options = { createClient: () => client };

    await expect(
      updatePostgresWalkthroughTimelineWithCommunityPost(env, "timeline-1", 10, input, options),
    ).resolves.toMatchObject({ uid: "timeline-1" });
    await expect(deletePostgresWalkthroughTimelineWithCommunityPost(env, "timeline-1", 10, options)).resolves.toBe(
      true,
    );

    const timelineQueries = query.mock.calls
      .map(([call]) => (call as { text: string }).text)
      .filter((sql) => sql.includes('"raid_walkthroughs"'));
    expect(timelineQueries.some((sql) => sql.includes('"uid" = $') && sql.includes('"user_id" = $'))).toBe(true);
  });

  it("rejects a malformed JSONB document instead of rendering fallback data", async () => {
    const malformed = postgresRow();
    malformed[10] = { type: "walkthrough_timeline", schemaVersion: 999 };
    const { client } = createClient(() => [malformed]);
    await expect(getPostgresWalkthroughTimeline(env, "timeline-1", { createClient: () => client })).rejects.toThrow(
      "schemaVersion",
    );
  });

  it("writes the canonical timeline and public projection in one transaction", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes('insert into "raid_walkthroughs"')) return [postgresRow()];
      return [];
    });

    await expect(
      createPostgresWalkthroughTimelineWithCommunityPost(env, 10, input, { createClient: () => client }),
    ).resolves.toMatchObject({ uid: "timeline-1" });

    const sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
    expect(sqlTexts).toContain("begin");
    expect(sqlTexts.some((sql) => sql.includes('insert into "raid_walkthroughs"'))).toBe(true);
    expect(sqlTexts.some((sql) => sql.includes('insert into "community_posts"'))).toBe(true);
    expect(sqlTexts).toContain("commit");
  });

  it("rolls back the canonical write when projection creation fails", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes('insert into "raid_walkthroughs"')) return [postgresRow()];
      if (sql.includes('insert into "community_posts"')) throw new Error("projection failed");
      return [];
    });

    await expect(
      createPostgresWalkthroughTimelineWithCommunityPost(env, 10, input, { createClient: () => client }),
    ).rejects.toThrow('insert into "community_posts"');

    const sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
    expect(sqlTexts).toContain("rollback");
    expect(sqlTexts).not.toContain("commit");
  });

  it("uses the same transaction boundary for update and delete projections", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes('update "raid_walkthroughs"')) return [postgresRow()];
      if (sql.includes('delete from "raid_walkthroughs"')) return [{ uid: "timeline-1" }];
      return [];
    });
    const options = { createClient: () => client };

    await expect(
      updatePostgresWalkthroughTimelineWithCommunityPost(env, "timeline-1", 10, input, options),
    ).resolves.toMatchObject({
      uid: "timeline-1",
    });
    await expect(deletePostgresWalkthroughTimelineWithCommunityPost(env, "timeline-1", 10, options)).resolves.toBe(
      true,
    );

    const sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
    expect(sqlTexts.filter((sql) => sql === "begin")).toHaveLength(2);
    expect(sqlTexts.filter((sql) => sql === "commit")).toHaveLength(2);
  });

  it("rolls back an update projection failure and succeeds on retry", async () => {
    const { client, query } = createClient(
      (sql) => {
        if (sql.includes('update "raid_walkthroughs"')) return [postgresRow()];
        return [];
      },
      { failOn: 'insert into "community_posts"', failOnlyOnce: true },
    );
    const options = { createClient: () => client };

    await expect(
      updatePostgresWalkthroughTimelineWithCommunityPost(env, "timeline-1", 10, input, options),
    ).rejects.toThrow('insert into "community_posts"');
    let sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
    expect(sqlTexts).toContain("rollback");
    expect(sqlTexts).not.toContain("commit");

    await expect(
      updatePostgresWalkthroughTimelineWithCommunityPost(env, "timeline-1", 10, input, options),
    ).resolves.toMatchObject({
      uid: "timeline-1",
    });
    sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
    expect(sqlTexts.filter((sql) => sql === "begin")).toHaveLength(2);
    expect(sqlTexts.filter((sql) => sql === "rollback")).toHaveLength(1);
    expect(sqlTexts.filter((sql) => sql === "commit")).toHaveLength(1);
  });

  it.each([
    "private",
    "unlisted",
  ] as const)("rolls back a public-to-%s projection update when the existing projection update fails", async (visibility) => {
    const { client, query } = createClient(
      (sql) => {
        if (sql.includes('update "raid_walkthroughs"')) return [postgresRow("timeline-1", visibility)];
        if (sql.includes('select "uid" from "community_posts"')) return [{ uid: "timeline-1" }];
        return [];
      },
      { failOn: 'update "community_posts"' },
    );
    const options = { createClient: () => client };

    await expect(
      updatePostgresWalkthroughTimelineWithCommunityPost(env, "timeline-1", 10, { ...input, visibility }, options),
    ).rejects.toThrow('update "community_posts"');

    const sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
    expect(sqlTexts.some((sql) => sql.includes('update "raid_walkthroughs"'))).toBe(true);
    expect(sqlTexts.some((sql) => sql.includes('update "community_posts"'))).toBe(true);
    expect(sqlTexts).toContain("rollback");
    expect(sqlTexts).not.toContain("commit");
  });

  it("rolls back a delete projection failure and succeeds on retry", async () => {
    const { client, query } = createClient(
      (sql) => {
        if (sql.includes('delete from "raid_walkthroughs"')) return [{ uid: "timeline-1" }];
        if (sql.includes('select "uid" from "community_posts"')) return [{ uid: "timeline-1" }];
        return [];
      },
      { failOn: 'delete from "community_posts"', failOnlyOnce: true },
    );
    const options = { createClient: () => client };

    await expect(deletePostgresWalkthroughTimelineWithCommunityPost(env, "timeline-1", 10, options)).rejects.toThrow(
      'delete from "community_posts"',
    );
    let sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
    expect(sqlTexts).toContain("rollback");
    expect(sqlTexts).not.toContain("commit");

    await expect(deletePostgresWalkthroughTimelineWithCommunityPost(env, "timeline-1", 10, options)).resolves.toBe(
      true,
    );
    sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
    expect(sqlTexts.filter((sql) => sql === "begin")).toHaveLength(2);
    expect(sqlTexts.filter((sql) => sql === "rollback")).toHaveLength(1);
    expect(sqlTexts.filter((sql) => sql === "commit")).toHaveLength(1);
  });

  it("keeps concurrent edits inside independent atomic transaction boundaries", async () => {
    const clients = [
      createClient((sql) => (sql.includes('update "raid_walkthroughs"') ? [postgresRow()] : [])),
      createClient((sql) => (sql.includes('update "raid_walkthroughs"') ? [postgresRow()] : [])),
    ];
    await expect(
      Promise.all(
        clients.map(({ client }) =>
          updatePostgresWalkthroughTimelineWithCommunityPost(env, "timeline-1", 10, input, {
            createClient: () => client,
          }),
        ),
      ),
    ).resolves.toHaveLength(2);

    for (const { query } of clients) {
      const sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
      const beginIndex = sqlTexts.indexOf("begin");
      const updateIndex = sqlTexts.findIndex((sql) => sql.includes('update "raid_walkthroughs"'));
      const projectionIndex = sqlTexts.findIndex((sql) => sql.includes('insert into "community_posts"'));
      const commitIndex = sqlTexts.indexOf("commit");
      expect(beginIndex).toBeGreaterThanOrEqual(0);
      expect(beginIndex).toBeLessThan(updateIndex);
      expect(updateIndex).toBeLessThan(projectionIndex);
      expect(projectionIndex).toBeLessThan(commitIndex);
    }
  });
});
