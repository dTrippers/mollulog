import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  getPostgresAllTimelineContentsMeta,
  getPostgresContentUidsByRecruitmentGroup,
  getPostgresFutureRaidContents,
  getPostgresTimelineContent,
  getPostgresTimelineContentDatesByContentUids,
  getPostgresTimelineContents,
  getPostgresTimelineContentsByContentTypes,
  getPostgresTimelineContentsByContentUids,
  getPostgresTimelineContentsByRecruitmentGroupUids,
  getPostgresTimelineContentsByUids,
  getPostgresUpcomingEvent,
} from "~/db/postgres/timeline-contents";

function postgresRow(uid = "future-event") {
  return [
    uid,
    new Date("2099-08-25T02:00:00.000Z"),
    new Date("2099-09-15T02:00:00.000Z"),
    false,
    null,
    [],
    "event",
    "first",
    "event-1",
    "group-1",
    true,
    ["event"],
    null,
    null,
    false,
    1200,
    null,
    { ko: "미래 이벤트" },
    ["student-a"],
    new Date("2026-07-13T00:00:00.000Z"),
    new Date("2026-07-13T00:00:00.000Z"),
  ];
}

describe("PostgreSQL timeline contents read", () => {
  it("queries the future window, maps PG-native types, and releases the client", async () => {
    const connect = jest.fn(async () => undefined);
    const end = jest.fn(async () => undefined);
    const query = jest.fn(async (_query: unknown, _values: unknown[]) => ({
      rows: [postgresRow()],
      rowCount: 1,
    }));
    const client = { connect, end, query } as unknown as Client;
    const now = "2099-08-01T00:00:00.000Z";
    const setAttribute = jest.fn();
    const ctx = {
      tracing: {
        enterSpan: jest.fn(async (_name: string, fn: (span: { setAttribute: typeof setAttribute }) => unknown) =>
          fn({ setAttribute }),
        ),
      },
    } as unknown as ExecutionContext;

    const result = await getPostgresTimelineContents(
      { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive },
      now,
      { ctx, createClient: () => client },
    );

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('where ("timeline_contents"."end_at" is null or'),
        rowMode: "array",
      }),
      [now],
    );
    expect(result).toEqual([
      expect.objectContaining({
        uid: "future-event",
        name: "미래 이벤트",
        startAt: "2099-08-25T02:00:00.000Z",
        endAt: "2099-09-15T02:00:00.000Z",
        recruitmentStudentUids: ["student-a"],
        confirmed: true,
        tags: ["event"],
      }),
    ]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(ctx.tracing.enterSpan).toHaveBeenCalledWith("postgres.connect", expect.any(Function));
    expect(ctx.tracing.enterSpan).toHaveBeenCalledWith(
      "postgres.timeline_contents.get_future_timeline_contents",
      expect.any(Function),
    );
    expect(ctx.tracing.enterSpan).toHaveBeenCalledWith("postgres.end", expect.any(Function));
    expect(setAttribute).toHaveBeenCalledWith("db.response.returned_rows", 1);
  });

  it("covers every Phase 3.5 lookup shape with deterministic PostgreSQL queries", async () => {
    const connect = jest.fn(async () => undefined);
    const end = jest.fn(async () => undefined);
    const query = jest.fn(async (queryConfig: { text: string }) => {
      if (queryConfig.text.includes('select "content_uid", "start_at", "end_at"')) {
        return {
          rows: [["event-1", new Date("2099-08-25T02:00:00.000Z"), new Date("2099-09-15T02:00:00.000Z")]],
          rowCount: 1,
        };
      }
      if (queryConfig.text.startsWith('select "uid", "content_type", "content_uid"')) {
        return { rows: [["future-event", "event", "event-1"]], rowCount: 1 };
      }
      return { rows: [postgresRow()], rowCount: 1 };
    });
    const client = { connect, end, query } as unknown as Client;
    const options = { createClient: () => client };
    const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive };
    const now = "2099-08-01T00:00:00.000Z";

    await expect(getPostgresTimelineContent(env, "future-event", options)).resolves.toMatchObject({
      uid: "future-event",
    });
    await expect(getPostgresUpcomingEvent(env, now, options)).resolves.toMatchObject({ uid: "future-event" });
    await expect(getPostgresTimelineContentsByUids(env, ["future-event"], options)).resolves.toHaveLength(1);
    await expect(getPostgresFutureRaidContents(env, ["raid"], now, options)).resolves.toHaveLength(1);
    await expect(getPostgresTimelineContentsByContentTypes(env, ["event"], now, options)).resolves.toHaveLength(1);
    await expect(getPostgresTimelineContentsByContentUids(env, ["event-1"], options)).resolves.toHaveLength(1);
    await expect(getPostgresTimelineContentsByRecruitmentGroupUids(env, ["group-1"], options)).resolves.toHaveLength(1);
    await expect(getPostgresAllTimelineContentsMeta(env, options)).resolves.toHaveLength(1);
    await expect(getPostgresTimelineContentDatesByContentUids(env, ["event-1"], options)).resolves.toEqual(
      new Map([["event-1", { startAt: "2099-08-25T02:00:00.000Z", endAt: "2099-09-15T02:00:00.000Z" }]]),
    );
    await expect(getPostgresContentUidsByRecruitmentGroup(env, options)).resolves.toEqual(
      new Map([["future-event", { contentType: "event", contentUid: "event-1" }]]),
    );

    const sqlTexts = query.mock.calls.map(([queryConfig]) => queryConfig.text);
    expect(sqlTexts).toEqual(
      expect.arrayContaining([
        expect.stringContaining('where "timeline_contents"."uid" = $1'),
        expect.stringContaining('"timeline_contents"."run_type" <> $2'),
        expect.stringContaining('"timeline_contents"."uid" in ($1)'),
        expect.stringContaining('"timeline_contents"."content_type" in ($1)'),
        expect.stringContaining('"timeline_contents"."content_uid" in ($1)'),
        expect.stringContaining('"timeline_contents"."recruitment_group_uid" in ($1)'),
        expect.stringContaining('"timeline_contents"."recruitment_group_uid" is not null'),
      ]),
    );
    expect(connect).toHaveBeenCalledTimes(10);
    expect(end).toHaveBeenCalledTimes(10);
  });

  it("merges split date ranges and preserves an open-ended range", async () => {
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query: jest.fn(async () => ({
        rows: [
          ["event-1", new Date("2026-05-26T02:00:00.000Z"), new Date("2026-06-09T02:00:00.000Z")],
          ["event-1", new Date("2026-06-09T02:00:00.000Z"), new Date("2026-06-29T19:00:00.000Z")],
          ["open-event", new Date("2026-05-01T02:00:00.000Z"), new Date("2026-05-08T02:00:00.000Z")],
          ["open-event", new Date("2026-05-08T02:00:00.000Z"), null],
        ],
        rowCount: 4,
      })),
    } as unknown as Client;
    const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive };

    await expect(
      getPostgresTimelineContentDatesByContentUids(env, ["event-1", "open-event"], {
        createClient: () => client,
      }),
    ).resolves.toEqual(
      new Map([
        ["event-1", { startAt: "2026-05-26T02:00:00.000Z", endAt: "2026-06-29T19:00:00.000Z" }],
        ["open-event", { startAt: "2026-05-01T02:00:00.000Z", endAt: null }],
      ]),
    );
  });

  it("rejects a row without a localized name", async () => {
    const unnamedRow = postgresRow();
    unnamedRow[17] = {};
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query: jest.fn(async () => ({ rows: [unnamedRow], rowCount: 1 })),
    } as unknown as Client;

    await expect(
      getPostgresTimelineContents(
        { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive },
        "2099-08-01T00:00:00.000Z",
        { createClient: () => client },
      ),
    ).rejects.toThrow("timeline content name is missing: uid=future-event");
  });
});
