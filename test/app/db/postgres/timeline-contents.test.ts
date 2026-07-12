import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { getPostgresTimelineContents } from "~/db/postgres/timeline-contents";

describe("PostgreSQL timeline contents read", () => {
  it("queries the future window, maps PG-native types, and releases the client", async () => {
    const connect = jest.fn(async () => undefined);
    const end = jest.fn(async () => undefined);
    const query = jest.fn(async (_query: unknown, _values: unknown[]) => ({
      rows: [
        [
          "future-event",
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
        ],
      ],
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
    expect(ctx.tracing.enterSpan).toHaveBeenCalledWith("postgres.timeline_contents.select", expect.any(Function));
    expect(ctx.tracing.enterSpan).toHaveBeenCalledWith("postgres.end", expect.any(Function));
    expect(setAttribute).toHaveBeenCalledWith("db.response.returned_rows", 1);
  });
});
