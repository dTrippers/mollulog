import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  createPostgresAttendance,
  getPostgresLatestPyroxeneOwnedResource,
  getPostgresPyroxeneTimelineItems,
  getPostgresPyroxeneUserState,
  upsertPostgresCollectedSources,
  upsertPostgresPyroxeneEventData,
  upsertPostgresPyroxenePlannerOptions,
} from "~/db/postgres/pyroxene-planner";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;

const ownedRow = [
  1,
  "owned-1",
  7,
  new Date("2026-08-01T00:00:00.000Z"),
  1200,
  3,
  4,
  new Date("2026-08-01T00:00:00.000Z"),
  new Date("2026-08-01T00:00:00.000Z"),
];

const timelineRow = [
  2,
  "timeline-1",
  7,
  new Date("2026-08-02T19:00:00.000Z"),
  "buy",
  null,
  null,
  null,
  false,
  "청휘석 구매",
  6600,
  0,
  0,
  new Date("2026-08-02T00:00:00.000Z"),
  new Date("2026-08-02T00:00:00.000Z"),
];

const eventRow = [
  3,
  "event-data-1",
  7,
  "event-1",
  true,
  200,
  new Date("2026-08-03T00:00:00.000Z"),
  new Date("2026-08-03T00:00:00.000Z"),
];

function createClient(options: { failOn?: string } = {}) {
  const events: string[] = [];
  const query = jest.fn(async (config: { text: string } | string) => {
    const text = typeof config === "string" ? config : config.text;
    events.push(text);
    if (options.failOn && text.toLowerCase().includes(options.failOn.toLowerCase())) {
      throw new Error("query failed");
    }
    if (text.includes('from "pyroxene_owned_resources"')) return { rows: [ownedRow], rowCount: 1 };
    if (text.includes('from "pyroxene_timeline_items"')) return { rows: [timelineRow], rowCount: 1 };
    if (text.includes('from "pyroxene_event_data"')) return { rows: [eventRow], rowCount: 1 };
    if (text.includes('from "pyroxene_planner_options"')) {
      return { rows: [[4, 7, JSON.stringify(defaultPyroxenePlannerOptions), new Date(), new Date()]], rowCount: 1 };
    }
    if (text.includes('from "pyroxene_collected_sources"')) {
      return { rows: [["source-1"], ["source-2"]], rowCount: 2 };
    }
    return { rows: [], rowCount: 0 };
  });
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
    query,
  } as unknown as Client;
  return { client, events, query };
}

describe("PostgreSQL Pyroxene repository", () => {
  it("maps PostgreSQL timestamps and booleans at the model boundary", async () => {
    const { client, query } = createClient();
    await expect(getPostgresLatestPyroxeneOwnedResource(env, 7, { createClient: () => client })).resolves.toMatchObject(
      {
        uid: "owned-1",
        inputAt: "2026-08-01T00:00:00.000Z",
      },
    );
    await expect(getPostgresPyroxeneTimelineItems(env, 7, { createClient: () => client })).resolves.toMatchObject([
      { uid: "timeline-1", autoRepurchase: false, eventAt: "2026-08-02T19:00:00.000Z" },
    ]);

    const readSql = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text)).join("\n");
    expect(readSql).toContain('order by "pyroxene_owned_resources"."input_at" desc');
    expect(readSql).toContain('order by "pyroxene_timeline_items"."event_at" asc');
  });

  it("reads all Pyroxene user state through one held PostgreSQL client", async () => {
    const { client } = createClient();
    const result = await getPostgresPyroxeneUserState(env, 7, { createClient: () => client });

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(result.latestResources?.uid).toBe("owned-1");
    expect(result.options).toEqual(defaultPyroxenePlannerOptions);
    expect(result.eventData[0]).toMatchObject({ eventUid: "event-1", completed: true });
    expect(result.timelineItems[0]?.uid).toBe("timeline-1");
    expect(result.collectedSourceKeys).toEqual(new Set(["source-1", "source-2"]));
  });

  it("uses one deduplicated bulk statement for collected sources", async () => {
    const { client, query } = createClient();
    await upsertPostgresCollectedSources(env, 7, ["source-1", "", "source-1", "source-2"], {
      createClient: () => client,
    });

    const inserts = query.mock.calls.filter(([config]) => {
      const text = typeof config === "string" ? config : config.text;
      return text.includes('insert into "pyroxene_collected_sources"');
    });
    expect(inserts).toHaveLength(1);
    expect((inserts[0]?.[0] as { text: string }).text).toContain('on conflict ("user_id","source_key") do update');
  });

  it("preserves planner and event conflict targets in PostgreSQL", async () => {
    const planner = createClient();
    await upsertPostgresPyroxenePlannerOptions(env, 7, defaultPyroxenePlannerOptions, {
      createClient: () => planner.client,
    });
    expect(planner.events.join("\n")).toContain('on conflict ("user_id") do update');

    const event = createClient();
    await upsertPostgresPyroxeneEventData(
      env,
      7,
      "event-1",
      { expectedTrials: 3 },
      {
        createClient: () => event.client,
      },
    );
    expect(event.events.join("\n")).toContain('on conflict ("user_id","event_uid") do update');
  });

  it("rolls back attendance replacement when the bulk insert fails", async () => {
    const { client, events } = createClient({ failOn: 'insert into "pyroxene_timeline_items"' });

    await expect(
      createPostgresAttendance(env, 7, "2026-08-04T00:00:00.000Z", "attendance-1", { createClient: () => client }),
    ).rejects.toThrow('Failed query: insert into "pyroxene_timeline_items"');

    expect(events.map((event) => event.toLowerCase())).toEqual(expect.arrayContaining(["begin", "rollback"]));
    expect(events.map((event) => event.toLowerCase())).not.toContain("commit");
  });
});
