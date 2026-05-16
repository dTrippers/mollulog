import { describe, expect, it, jest } from "@jest/globals";
import { getTimelineContents, getTimelineContentsByContentTypes, getUpcomingEvent } from "~/models/timeline-content";

jest.mock("~/models/content-name", () => ({
  resolveContentName: jest.fn(async (_env, raw: { uid: string }) => raw.uid),
}));

type TimelineContentRow = {
  id: number;
  uid: string;
  start_at: string;
  end_at: string | null;
  endless: number;
  image_url: string | null;
  videos: string;
  content_type: string;
  run_type: string;
  occurrence: number | null;
  content_uid: string | null;
  shop_content_uid: string | null;
  recruitment_group_uid: string | null;
  confirmed: number;
  is_spoiler: number;
  tags: string;
  earnable_pyroxene: number | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
};

class FakeD1Statement {
  private params: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]): FakeD1Statement {
    this.params = params;
    return this;
  }

  async raw(): Promise<unknown[][]> {
    return this.db.selectRows(this.sql, this.params).map(rowToArray);
  }
}

class FakeD1Database {
  constructor(private readonly rows: TimelineContentRow[]) {}

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  selectRows(sql: string, params: unknown[]): TimelineContentRow[] {
    let rows = [...this.rows];

    if (sql.includes('"content_type" = ?')) {
      rows = rows.filter((row) => row.content_type === params[0]);
    }

    if (sql.includes('"content_type" in')) {
      const contentTypeParams = params.filter(
        (param): param is string => typeof param === "string" && !param.includes("T"),
      );
      rows = rows.filter((row) => contentTypeParams.includes(row.content_type));
    }

    if (sql.includes("\"run_type\" != 'permanent'")) {
      rows = rows.filter((row) => row.run_type !== "permanent");
    }

    const endAtParams = params.filter((param): param is string => typeof param === "string" && param.includes("T"));
    if (sql.includes('"end_at" is null') && sql.includes('"end_at" >= ?')) {
      const endAfter = endAtParams[0];
      rows = rows.filter((row) => row.end_at === null || (endAfter != null && row.end_at >= endAfter));
    } else if (sql.includes('"end_at" >= ?')) {
      const endAfter = endAtParams.at(-1);
      rows = rows.filter((row) => row.end_at != null && endAfter != null && row.end_at >= endAfter);
    }

    rows.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return sql.includes("limit ?") ? rows.slice(0, Number(params.at(-1))) : rows;
  }
}

function createEnv(rows: TimelineContentRow[]): Env {
  return { DB: new FakeD1Database(rows) } as unknown as Env;
}

function row(overrides: Partial<TimelineContentRow>): TimelineContentRow {
  return {
    id: 1,
    uid: "future-unsynced-event",
    start_at: "2099-08-25T02:00:00.000Z",
    end_at: "2099-09-15T02:00:00.000Z",
    endless: 0,
    image_url: null,
    videos: "[]",
    content_type: "event",
    run_type: "first",
    occurrence: null,
    content_uid: "future-unsynced-event",
    shop_content_uid: null,
    recruitment_group_uid: "future-unsynced-event",
    confirmed: 1,
    is_spoiler: 0,
    tags: "[]",
    earnable_pyroxene: null,
    created_at: "2026-05-14T16:05:43.888Z",
    updated_at: "2026-05-14T16:05:43.888Z",
    synced_at: null,
    ...overrides,
  };
}

function rowToArray(row: TimelineContentRow): unknown[] {
  return [
    row.id,
    row.uid,
    row.start_at,
    row.end_at,
    row.endless,
    row.image_url,
    row.videos,
    row.content_type,
    row.run_type,
    row.occurrence,
    row.content_uid,
    row.shop_content_uid,
    row.recruitment_group_uid,
    row.confirmed,
    row.is_spoiler,
    row.tags,
    row.earnable_pyroxene,
    row.created_at,
    row.updated_at,
    row.synced_at,
  ];
}

describe("timeline-content synced_at visibility", () => {
  it("includes future timeline contents even when synced_at is empty", async () => {
    const contents = await getTimelineContents(createEnv([row({})]));

    expect(contents.map((content) => content.uid)).toEqual(["future-unsynced-event"]);
  });

  it("can pick an upcoming event even when synced_at is empty", async () => {
    const content = await getUpcomingEvent(createEnv([row({})]));

    expect(content?.uid).toBe("future-unsynced-event");
  });

  it("includes future content-type results even when synced_at is empty", async () => {
    const contents = await getTimelineContentsByContentTypes(
      createEnv([row({})]),
      ["event"],
      "2099-08-01T00:00:00.000Z",
    );

    expect(contents.map((content) => content.uid)).toEqual(["future-unsynced-event"]);
  });
});
