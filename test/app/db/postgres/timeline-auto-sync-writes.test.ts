import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  applyPostgresTimelineAutoSyncPlan,
  applyPostgresTimelineRecruitmentGroupWrites,
} from "~/db/postgres/timeline-contents";
import type { TimelineAutoSyncCreate, TimelineAutoSyncPlan } from "~/domain/timeline-auto-sync";
import { toUtcIso } from "~/lib/date-time";

type QueryConfig = string | { text: string; values?: unknown[] };
type QueryResult = { rows: unknown[]; rowCount: number };

/** Records every statement; `answer` gives a statement's rows (in `rowMode: "array"` shape for drizzle selects). */
function recordingClient(answer: (text: string) => unknown[] = () => []) {
  const query = jest.fn(async (config: QueryConfig, _values?: unknown[]): Promise<QueryResult> => {
    const rows = answer(typeof config === "string" ? config : config.text);
    return { rows, rowCount: rows.length };
  });
  const client = { connect: jest.fn(async () => undefined), end: jest.fn(async () => undefined), query };
  const statements = () =>
    query.mock.calls.map(([config, values]) =>
      typeof config === "string"
        ? { text: config, values: values ?? [] }
        : { text: config.text, values: config.values ?? values ?? [] },
    );
  return { options: { createClient: () => client as unknown as Client }, statements };
}

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive };
const NOW = toUtcIso("2099-11-28T00:00:00Z");

type PlanInput = Pick<TimelineAutoSyncPlan, "creates" | "updates" | "updateStartedRows" | "matchBy">;

function raidCreate(overrides: Partial<TimelineAutoSyncCreate> = {}): TimelineAutoSyncCreate {
  return {
    uid: "raid-new",
    contentType: "raid",
    contentUid: "gl_unlimit_32",
    runType: "first",
    occurrence: null,
    nameI18n: { ko: "세트의 분노" },
    confirmed: false,
    startAt: toUtcIso("2100-02-10T02:00:00Z"),
    endAt: toUtcIso("2100-03-08T19:00:00Z"),
    endless: false,
    jpRaidType: "unlimit",
    jpRaidSeasonIndex: 32,
    ...overrides,
  };
}

/** The schedule a plan was computed from: a story-like row with an exposure end. */
const READ_SCHEDULE = { startAt: toUtcIso("2099-12-01T02:00:00Z"), endAt: null, endless: true };

const RECHECK_SELECT = 'select "uid", "jp_raid_type", "jp_raid_season_index" from "timeline_contents"';

describe("applyPostgresTimelineAutoSyncPlan", () => {
  it("updates a raid row only while it still has the matched JP season and has not started, never confirmed", async () => {
    const { options, statements } = recordingClient();
    const plan: PlanInput = {
      updateStartedRows: false,
      matchBy: "jpRaidSeason",
      creates: [],
      updates: [
        {
          uid: "unlimit_30",
          startAt: toUtcIso("2099-12-16T02:00:00Z"),
          endAt: toUtcIso("2100-01-11T19:00:00Z"),
          endless: false,
          match: { kind: "jpRaidSeason", contentType: "raid", raidType: "unlimit", seasonIndex: 30 },
          readSchedule: {
            startAt: toUtcIso("2099-12-15T02:00:00Z"),
            endAt: toUtcIso("2100-01-10T19:00:00Z"),
            endless: false,
          },
          contentUid: "gl_unlimit_30",
        },
      ],
    };

    await applyPostgresTimelineAutoSyncPlan(env, plan, NOW, options);

    const [update] = statements().filter((statement) => statement.text.startsWith("update"));
    expect(update?.text).toBe(
      `update "timeline_contents" set "start_at" = $1, "end_at" = $2, "endless" = $3, "content_uid" = $4, "synced_at" = $5, "updated_at" = $6 where ("timeline_contents"."uid" = $7 and ("timeline_contents"."content_type" = $8 and "timeline_contents"."jp_raid_type" = $9 and "timeline_contents"."jp_raid_season_index" = $10) and (date_trunc('milliseconds', "timeline_contents"."start_at") = $11::timestamptz and date_trunc('milliseconds', "timeline_contents"."end_at") = $12::timestamptz and "timeline_contents"."endless" = $13) and "timeline_contents"."start_at" > $14) returning "uid"`,
    );
    expect(update?.values.slice(6, 13)).toEqual([
      "unlimit_30",
      "raid",
      "unlimit",
      30,
      "2099-12-15T02:00:00.000Z",
      "2100-01-10T19:00:00.000Z",
      false,
    ]);
    expect(update?.text).not.toContain("confirmed");
  });

  it("updates a content-key row only while it still has the matched content, comparing a null occurrence", async () => {
    const { options, statements } = recordingClient();

    await applyPostgresTimelineAutoSyncPlan(
      env,
      {
        updateStartedRows: false,
        matchBy: "content",
        creates: [],
        updates: [
          {
            uid: "pandemic-hazard-rerun",
            startAt: toUtcIso("2099-12-02T02:00:00Z"),
            endAt: null,
            endless: true,
            match: { kind: "content", contentType: "event", contentUid: "844", runType: "rerun", occurrence: null },
            readSchedule: READ_SCHEDULE,
          },
          {
            uid: "schale_settlement_20",
            startAt: toUtcIso("2099-12-02T02:00:00Z"),
            endAt: null,
            endless: true,
            match: {
              kind: "content",
              contentType: "mini_event",
              contentUid: "60000",
              runType: "first",
              occurrence: 20,
            },
            readSchedule: {
              startAt: toUtcIso("2099-12-08T02:00:00Z"),
              endAt: toUtcIso("2099-12-15T02:00:00Z"),
              endless: false,
            },
          },
        ],
      },
      NOW,
      options,
    );

    const updates = statements().filter((statement) => statement.text.startsWith("update"));
    expect(updates.map((statement) => statement.text.slice(statement.text.indexOf(" where ")))).toEqual([
      ` where ("timeline_contents"."uid" = $6 and ("timeline_contents"."content_type" = $7 and "timeline_contents"."content_uid" = $8 and "timeline_contents"."run_type" = $9 and "timeline_contents"."occurrence" is null) and (date_trunc('milliseconds', "timeline_contents"."start_at") = $10::timestamptz and "timeline_contents"."end_at" is null and "timeline_contents"."endless" = $11) and "timeline_contents"."start_at" > $12) returning "uid"`,
      ` where ("timeline_contents"."uid" = $6 and ("timeline_contents"."content_type" = $7 and "timeline_contents"."content_uid" = $8 and "timeline_contents"."run_type" = $9 and "timeline_contents"."occurrence" = $10) and (date_trunc('milliseconds', "timeline_contents"."start_at") = $11::timestamptz and date_trunc('milliseconds', "timeline_contents"."end_at") = $12::timestamptz and "timeline_contents"."endless" = $13) and "timeline_contents"."start_at" > $14) returning "uid"`,
    ]);
    expect(updates[0]?.values.slice(9, 11)).toEqual(["2099-12-01T02:00:00.000Z", true]);
    expect(updates[1]?.values.slice(5, 13)).toEqual([
      "schale_settlement_20",
      "mini_event",
      "60000",
      "first",
      20,
      "2099-12-08T02:00:00.000Z",
      "2099-12-15T02:00:00.000Z",
      false,
    ]);
  });

  it("updates a campaign or drill row by its content key without requiring it to start after now", async () => {
    const { options, statements } = recordingClient();

    await applyPostgresTimelineAutoSyncPlan(
      env,
      {
        updateStartedRows: true,
        matchBy: "content",
        creates: [],
        updates: [
          {
            uid: "campaign-1",
            startAt: toUtcIso("2099-11-01T02:00:00Z"),
            endAt: null,
            endless: true,
            match: { kind: "content", contentType: "campaign", contentUid: "1", runType: "first", occurrence: null },
            readSchedule: READ_SCHEDULE,
          },
        ],
      },
      NOW,
      options,
    );

    expect(
      statements()
        .filter((statement) => statement.text.startsWith("update"))
        .map((s) => s.text),
    ).toEqual([
      `update "timeline_contents" set "start_at" = $1, "end_at" = $2, "endless" = $3, "synced_at" = $4, "updated_at" = $5 where ("timeline_contents"."uid" = $6 and ("timeline_contents"."content_type" = $7 and "timeline_contents"."content_uid" = $8 and "timeline_contents"."run_type" = $9 and "timeline_contents"."occurrence" is null) and (date_trunc('milliseconds', "timeline_contents"."start_at") = $10::timestamptz and "timeline_contents"."end_at" is null and "timeline_contents"."endless" = $11)) returning "uid"`,
    ]);
  });

  it("reports which planned rows the write actually created and updated", async () => {
    const { options } = recordingClient((text) => {
      if (text.startsWith('insert into "timeline_contents"')) return [["raid-new"]];
      return [];
    });

    const result = await applyPostgresTimelineAutoSyncPlan(
      env,
      {
        updateStartedRows: false,
        matchBy: "content",
        creates: [raidCreate({ contentType: "campaign", jpRaidType: null, jpRaidSeasonIndex: null })],
        updates: [
          {
            uid: "changed-by-admin",
            startAt: toUtcIso("2099-12-02T02:00:00Z"),
            endAt: null,
            endless: true,
            match: { kind: "content", contentType: "event", contentUid: "844", runType: "rerun", occurrence: null },
            readSchedule: READ_SCHEDULE,
          },
        ],
      },
      NOW,
      options,
    );

    expect(result).toEqual({ createdUids: ["raid-new"], updatedUids: [], creationBlockedByUids: [] });
  });

  describe("raid creation re-check inside the transaction", () => {
    function raidPlan(creates: TimelineAutoSyncCreate[]): PlanInput {
      return { updateStartedRows: false, matchBy: "jpRaidSeason", creates, updates: [] };
    }

    function inserts(statements: () => Array<{ text: string; values: unknown[] }>) {
      return statements().filter((statement) => statement.text.startsWith('insert into "timeline_contents"'));
    }

    it("reads the future raid rows again and inserts none when one has no JP season", async () => {
      const { options, statements } = recordingClient((text) =>
        text.startsWith(RECHECK_SELECT)
          ? [
              ["unlimit_31", "unlimit", 31],
              ["unlimit_32_admin", null, null],
            ]
          : [],
      );

      const result = await applyPostgresTimelineAutoSyncPlan(env, raidPlan([raidCreate()]), NOW, options);

      const recheck = statements().find((statement) => statement.text.startsWith(RECHECK_SELECT));
      expect(recheck?.text).toBe(
        `${RECHECK_SELECT} where ("timeline_contents"."content_type" in ($1) and "timeline_contents"."start_at" > $2)`,
      );
      expect(statements()[0]?.text).toBe("begin");
      expect(inserts(statements)).toEqual([]);
      expect(result.createdUids).toEqual([]);
      expect(result.creationBlockedByUids).toEqual(["unlimit_32_admin"]);
    });

    it("skips a row whose JP season a row already has and inserts the others", async () => {
      const { options, statements } = recordingClient((text) => {
        if (text.startsWith(RECHECK_SELECT)) return [["unlimit_32", "unlimit", 32]];
        if (text.startsWith('insert into "timeline_contents"')) return [["raid-other"]];
        return [];
      });

      const result = await applyPostgresTimelineAutoSyncPlan(
        env,
        raidPlan([raidCreate(), raidCreate({ uid: "raid-other", contentUid: "gl_unlimit_33", jpRaidSeasonIndex: 33 })]),
        NOW,
        options,
      );

      const [insert] = inserts(statements);
      expect(insert?.values).toContain("raid-other");
      expect(insert?.values).not.toContain("raid-new");
      expect(result.createdUids).toEqual(["raid-other"]);
      expect(result.creationBlockedByUids).toEqual([]);
    });

    it("does not re-check for sources matched by content", async () => {
      const { options, statements } = recordingClient();

      await applyPostgresTimelineAutoSyncPlan(
        env,
        {
          ...raidPlan([raidCreate({ contentType: "campaign", jpRaidType: null, jpRaidSeasonIndex: null })]),
          matchBy: "content",
        },
        NOW,
        options,
      );

      expect(statements().some((statement) => statement.text.startsWith(RECHECK_SELECT))).toBe(false);
      expect(inserts(statements)).toHaveLength(1);
    });
  });
});

describe("applyPostgresTimelineRecruitmentGroupWrites", () => {
  it("upserts the group and replaces its recruitments as a set, keeping a recruitment without a student uid", async () => {
    const { options, statements } = recordingClient();

    await applyPostgresTimelineRecruitmentGroupWrites(
      env,
      [
        {
          group: {
            uid: "dive-into-ocean",
            startAt: toUtcIso("2099-12-15T02:00:00Z"),
            endAt: null,
            recruitmentType: "limited",
          },
          recruitments: [
            { studentUid: null, studentName: "새 학생", recruitmentType: "limited", pickup: true, rerun: false },
          ],
        },
        {
          group: {
            uid: "kept-recruitments",
            startAt: toUtcIso("2099-12-15T02:00:00Z"),
            endAt: null,
            recruitmentType: "usual",
          },
          recruitments: null,
        },
      ],
      NOW,
      options,
    );

    const writes = statements().filter((statement) => /^(insert|delete|update)/.test(statement.text));
    expect(writes.map((statement) => statement.text.split(" (")[0]?.split(" where")[0])).toEqual([
      'insert into "timeline_recruitment_groups"',
      'delete from "timeline_recruitments"',
      'insert into "timeline_recruitments"',
      'insert into "timeline_recruitment_groups"',
    ]);
    expect(writes[0]?.text).toContain('on conflict ("uid") do update set');
    expect(writes[1]?.values).toEqual(["dive-into-ocean"]);
    expect(writes[2]?.values).toEqual(
      expect.arrayContaining(["dive-into-ocean", null, "새 학생", "limited", true, false]),
    );
  });
});
