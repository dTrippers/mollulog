import { describe, expect, it, jest } from "@jest/globals";
import {
  findEventsForRecruitmentStudent,
  getTimelineContentDatesByContentUid,
  getTimelineContentDatesByContentUids,
  getTimelineContents,
  getTimelineContentsByContentTypes,
  getUpcomingEvent,
  groupTimelineContentsByRecruitmentGroupUid,
  type TimelineContent,
} from "~/models/timeline-content";

type TimelineContentRow = {
  id: number;
  uid: string;
  name_i18n: string;
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
  recruitment_student_uids: string | null;
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
    return this.db.selectRows(this.sql, this.params).map((row) => rowToSelectedArray(this.sql, row));
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

    if (sql.includes('"content_uid" = ?')) {
      rows = rows.filter((row) => row.content_uid === params[0]);
    }

    if (sql.includes('"content_uid" in')) {
      rows = rows.filter((row) => row.content_uid != null && params.includes(row.content_uid));
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
    name_i18n: JSON.stringify({ ko: "미래 이벤트" }),
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
    recruitment_student_uids: null,
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
    row.name_i18n,
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
    row.recruitment_student_uids,
    row.confirmed,
    row.is_spoiler,
    row.tags,
    row.earnable_pyroxene,
    row.created_at,
    row.updated_at,
    row.synced_at,
  ];
}

function rowToSelectedArray(sql: string, row: TimelineContentRow): unknown[] {
  if (
    !sql.includes('"id"') &&
    sql.includes('"content_uid"') &&
    sql.includes('"start_at"') &&
    sql.includes('"end_at"')
  ) {
    return [row.content_uid, row.start_at, row.end_at];
  }
  return rowToArray(row);
}

describe("timeline-content synced_at visibility", () => {
  it("includes future timeline contents even when synced_at is empty", async () => {
    const contents = await getTimelineContents(createEnv([row({})]));

    expect(contents.map((content) => content.uid)).toEqual(["future-unsynced-event"]);
    expect(contents.map((content) => content.name)).toEqual(["미래 이벤트"]);
  });

  it("can pick an upcoming event even when synced_at is empty", async () => {
    const content = await getUpcomingEvent(createEnv([row({})]));

    expect(content?.uid).toBe("future-unsynced-event");
    expect(content?.name).toBe("미래 이벤트");
  });

  it("includes future content-type results even when synced_at is empty", async () => {
    const contents = await getTimelineContentsByContentTypes(
      createEnv([row({})]),
      ["event"],
      "2099-08-01T00:00:00.000Z",
    );

    expect(contents.map((content) => content.uid)).toEqual(["future-unsynced-event"]);
  });

  it("throws when a timeline content has no localized name", async () => {
    await expect(getTimelineContents(createEnv([row({ name_i18n: "{}" })]))).rejects.toThrow(
      "timeline content name is missing: uid=future-unsynced-event",
    );
  });
});

describe("timeline content dates by content_uid", () => {
  it("merges split timeline rows that share one content UID", async () => {
    const env = createEnv([
      row({
        id: 1,
        uid: "steel-continent",
        content_uid: "854",
        start_at: "2026-05-26T02:00:00.000Z",
        end_at: "2026-06-09T02:00:00.000Z",
      }),
      row({
        id: 2,
        uid: "steel-continent-malkuth",
        content_uid: "854",
        start_at: "2026-06-09T02:00:00.000Z",
        end_at: "2026-06-22T19:00:00.000Z",
      }),
      row({
        id: 3,
        uid: "decagrammaton",
        content_uid: "854",
        start_at: "2026-06-23T02:00:00.000Z",
        end_at: "2026-06-29T19:00:00.000Z",
      }),
    ]);

    await expect(getTimelineContentDatesByContentUid(env, "854")).resolves.toEqual({
      startAt: "2026-05-26T02:00:00.000Z",
      endAt: "2026-06-29T19:00:00.000Z",
    });
  });

  it("keeps an open-ended date range open when any row has no end", async () => {
    const dates = await getTimelineContentDatesByContentUids(
      createEnv([
        row({
          id: 1,
          content_uid: "open-event",
          start_at: "2026-05-01T02:00:00.000Z",
          end_at: "2026-05-08T02:00:00.000Z",
        }),
        row({
          id: 2,
          content_uid: "open-event",
          start_at: "2026-05-08T02:00:00.000Z",
          end_at: null,
        }),
      ]),
      ["open-event"],
    );

    expect(dates.get("open-event")).toEqual({
      startAt: "2026-05-01T02:00:00.000Z",
      endAt: null,
    });
  });
});

function timelineContent(overrides: Partial<TimelineContent> & { uid: string }): TimelineContent {
  return {
    name: overrides.uid,
    nameI18n: {},
    startAt: "2026-11-10T02:00:00.000Z",
    endAt: "2026-11-24T02:00:00.000Z",
    endless: false,
    imageUrl: null,
    videos: [],
    contentType: "event",
    runType: "first",
    occurrence: null,
    contentUid: null,
    shopContentUid: null,
    recruitmentGroupUid: null,
    recruitmentStudentUids: null,
    confirmed: true,
    isSpoiler: false,
    tags: [],
    earnablePyroxene: null,
    syncedAt: null,
    ...overrides,
  };
}

describe("groupTimelineContentsByRecruitmentGroupUid", () => {
  it("keeps every event sharing a recruitment group, not just the last one", () => {
    const eventA = timelineContent({ uid: "event-a", recruitmentGroupUid: "shared-group" });
    const eventB = timelineContent({ uid: "event-b", recruitmentGroupUid: "shared-group" });
    const eventC = timelineContent({ uid: "event-c", recruitmentGroupUid: "other-group" });

    const map = groupTimelineContentsByRecruitmentGroupUid([eventA, eventB, eventC]);

    expect(map.get("shared-group")?.map((content) => content.uid)).toEqual(["event-a", "event-b"]);
    expect(map.get("other-group")?.map((content) => content.uid)).toEqual(["event-c"]);
  });

  it("skips events with no recruitment group", () => {
    const map = groupTimelineContentsByRecruitmentGroupUid([timelineContent({ uid: "no-group" })]);
    expect(map.size).toBe(0);
  });
});

describe("findEventsForRecruitmentStudent", () => {
  const eventA = timelineContent({
    uid: "event-a",
    recruitmentGroupUid: "shared-group",
    recruitmentStudentUids: ["a", "b"],
  });
  const eventB = timelineContent({
    uid: "event-b",
    recruitmentGroupUid: "shared-group",
    recruitmentStudentUids: ["c", "d"],
  });

  it("returns the event whose allowlist includes the student", () => {
    expect(findEventsForRecruitmentStudent([eventA, eventB], "a").map((e) => e.uid)).toEqual(["event-a"]);
    expect(findEventsForRecruitmentStudent([eventA, eventB], "c").map((e) => e.uid)).toEqual(["event-b"]);
  });

  it("matches every event with no allowlist, since null means show-all", () => {
    const unfiltered = timelineContent({ uid: "event-c", recruitmentGroupUid: "shared-group" });
    expect(findEventsForRecruitmentStudent([unfiltered], "anyone").map((e) => e.uid)).toEqual(["event-c"]);
  });

  it("falls back to every candidate event when no allowlist matches", () => {
    expect(findEventsForRecruitmentStudent([eventA, eventB], "unlisted").map((e) => e.uid)).toEqual([
      "event-a",
      "event-b",
    ]);
  });

  it("returns an empty list when there are no candidate events", () => {
    expect(findEventsForRecruitmentStudent([], "a")).toEqual([]);
  });
});
