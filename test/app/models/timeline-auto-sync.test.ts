import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { applyPostgresTimelineAutoSyncPlan, getPostgresTimelineAutoSyncRows } from "~/db/postgres/timeline-contents";
import type { TimelineAutoSyncExistingRow } from "~/domain/timeline-auto-sync";
import { runQuery } from "~/lib/baql";
import { toUtcIso } from "~/lib/date-time";
import { syncTimelineContentsFromSources, type TimelineAutoSyncSource } from "~/models/timeline-auto-sync.server";

const mockLoggerError = jest.fn();
const mockLoggerInfo = jest.fn();

jest.mock("~/db/postgres/timeline-contents", () => ({
  applyPostgresTimelineAutoSyncPlan: jest.fn(),
  getPostgresTimelineAutoSyncRows: jest.fn(),
}));
jest.mock("~/lib/baql", () => ({ runQuery: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => ({ info: mockLoggerInfo, error: mockLoggerError })),
}));

const mockedRunQuery = runQuery as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockedGetRows = getPostgresTimelineAutoSyncRows as jest.MockedFunction<typeof getPostgresTimelineAutoSyncRows>;
const mockedApply = applyPostgresTimelineAutoSyncPlan as jest.MockedFunction<typeof applyPostgresTimelineAutoSyncPlan>;

const env = {} as Env;

function campaign(uid: string, category: string[]) {
  return { uid, category, multiplier: 2, startAt: "2099-11-02T19:00:00Z", endAt: "2099-11-09T19:00:00Z" };
}

function drill(
  uid: string,
  drillType: string,
  schedules: Array<{ region: string; startAt: string; endAt: string | null }> = [
    { region: "gl", startAt: "2099-11-24T02:00:00Z", endAt: "2099-11-30T19:00:00Z" },
  ],
) {
  return { uid, season: Number(uid), drillType, schedules };
}

type BaqlResult = { data?: unknown; error?: Error };

function operationName(document: unknown): string | undefined {
  const definitions = (document as { definitions?: Array<{ name?: { value?: string } }> }).definitions;
  return definitions?.[0]?.name?.value;
}

type BaqlResults = {
  campaigns?: BaqlResult;
  jointFiringDrills?: BaqlResult;
  raidSchedules?: BaqlResult;
  eventContents?: BaqlResult;
  miniEventContents?: BaqlResult;
  mainStories?: BaqlResult;
  miniStories?: BaqlResult;
};

/** Answers each source's query separately; a source left out gets an empty list. */
function mockBaql(results: BaqlResults) {
  mockedRunQuery.mockImplementation(async (document) => {
    switch (operationName(document)) {
      case "TimelineAutoSyncCampaigns":
        return results.campaigns ?? { data: { campaigns: [] } };
      case "TimelineAutoSyncJointFiringDrills":
        return results.jointFiringDrills ?? { data: { jointFiringDrills: [] } };
      case "TimelineAutoSyncRaidSchedules":
        return results.raidSchedules ?? { data: { raidSchedules: { nodes: [], pageInfo: { hasNextPage: false } } } };
      case "TimelineAutoSyncEventContents":
        return results.eventContents ?? { data: { eventContents: [] } };
      case "TimelineAutoSyncMiniEventContents":
        return results.miniEventContents ?? { data: { miniEventContents: [] } };
      case "TimelineAutoSyncMainStories":
        return results.mainStories ?? { data: { mainStories: [] } };
      case "TimelineAutoSyncMiniStories":
        return results.miniStories ?? { data: { miniStories: [] } };
      default:
        throw new Error(`unexpected BAQL query: ${operationName(document)}`);
    }
  });
}

const appliedPlans = new Map<string, Parameters<typeof applyPostgresTimelineAutoSyncPlan>[1]>();

/** The plan applied for a content type, keyed by the type whose rows were read last. */
function planFor(contentType: string) {
  return appliedPlans.get(contentType);
}

function existingRow(overrides: Partial<TimelineAutoSyncExistingRow>): TimelineAutoSyncExistingRow {
  return {
    uid: "row",
    contentType: "event",
    contentUid: "844",
    runType: "first",
    occurrence: null,
    startAt: toUtcIso("2099-12-01T02:00:00Z"),
    endAt: toUtcIso("2099-12-15T02:00:00Z"),
    endless: false,
    raidType: null,
    jpRaidSeasonIndex: null,
    ...overrides,
  };
}

/** Rows of each content type the sync reads; other types have none. */
function mockRows(rowsByType: Record<string, TimelineAutoSyncExistingRow[]>) {
  mockedGetRows.mockImplementation(async (_env, contentType, uids) =>
    uids.length > 0 ? [] : (rowsByType[contentType] ?? []),
  );
}

function raidSchedule(
  uid: string,
  raidType: string,
  overrides: Partial<{
    startAt: string | null;
    endAt: string | null;
    jpSchedule: { raidType: string; seasonIndex: number } | null;
  }> = {},
) {
  return {
    uid,
    region: "gl",
    raidType,
    startAt: "2099-12-16T02:00:00Z",
    endAt: "2099-12-22T19:00:00Z",
    raidBoss: { name: "호크마" },
    // The JP season is three seasons ahead of the GL uid's number, as BAQL maps total assaults today.
    jpSchedule: { raidType, seasonIndex: Number(uid.split("_").at(-1)) + 3 },
    ...overrides,
  };
}

function raidSchedules(nodes: unknown[], hasNextPage = false): BaqlResult {
  return { data: { raidSchedules: { nodes, pageInfo: { hasNextPage } } } };
}

function queryVariables(name: string) {
  return mockedRunQuery.mock.calls.find((call) => operationName(call[0]) === name)?.[1];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRows({});
  appliedPlans.clear();
  mockedApply.mockImplementation(async (_env, plan) => {
    const typeCalls = mockedGetRows.mock.calls.filter((call) => call[2].length === 0);
    const contentType = typeCalls[typeCalls.length - 1]?.[1];
    if (contentType) appliedPlans.set(contentType, plan);
    return {
      createdUids: plan.creates.map((row) => row.uid),
      updatedUids: plan.updates.map((row) => row.uid),
      creationBlockedByUids: [],
    };
  });
  mockBaql({});
});

describe("syncTimelineContentsFromSources", () => {
  it("creates confirmed campaign rows in the existing uid and name format, asking BAQL for GL campaigns", async () => {
    mockBaql({ campaigns: { data: { campaigns: [campaign("20991103", ["mission_normal", "mission_hard"])] } } });

    await syncTimelineContentsFromSources(env);

    expect(queryVariables("TimelineAutoSyncCampaigns")).toEqual({ region: "gl", endAfter: expect.any(Date) });
    const plan = planFor("campaign");
    expect(plan?.creates).toEqual([
      {
        uid: "campaign-20991103",
        contentType: "campaign",
        contentUid: "20991103",
        runType: "first",
        occurrence: null,
        nameI18n: { ko: "임무(Normal)/임무(Hard) 보상량 2배" },
        startAt: toUtcIso("2099-11-02T19:00:00Z"),
        endAt: toUtcIso("2099-11-09T19:00:00Z"),
        endless: false,
        confirmed: true,
        raidType: null,
        jpRaidSeasonIndex: null,
      },
    ]);
  });

  it("syncs valid campaigns but fails the run for an unknown category instead of inventing a name", async () => {
    mockBaql({
      campaigns: { data: { campaigns: [campaign("20991103", ["exp"]), campaign("20991104", ["new_category"])] } },
    });

    await expect(syncTimelineContentsFromSources(env)).rejects.toThrow(AggregateError);

    const plan = planFor("campaign");
    expect(plan?.creates.map((row) => row.uid)).toEqual(["campaign-20991103"]);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Timeline auto sync rejected source items",
      expect.objectContaining({
        message: expect.stringContaining("20991104 (unknown campaign category: new_category)"),
      }),
      { contentType: "campaign" },
    );
  });

  it("creates unconfirmed joint firing drill rows in the existing uid and name format from the GL schedule", async () => {
    mockBaql({
      jointFiringDrills: {
        data: {
          jointFiringDrills: [
            drill("98", "escort", [
              { region: "jp", startAt: "2099-10-01T02:00:00Z", endAt: "2099-10-07T19:00:00Z" },
              { region: "gl", startAt: "2099-11-24T02:00:00Z", endAt: "2099-11-30T19:00:00Z" },
            ]),
          ],
        },
      },
    });

    await syncTimelineContentsFromSources(env);

    expect(queryVariables("TimelineAutoSyncJointFiringDrills")).toEqual({ endAfter: expect.any(Date) });
    expect(planFor("joint_firing_drill")?.creates).toEqual([
      {
        uid: "jfd-98",
        contentType: "joint_firing_drill",
        contentUid: "98",
        runType: "first",
        occurrence: null,
        nameI18n: { ko: "98차: 호위시험" },
        startAt: toUtcIso("2099-11-24T02:00:00Z"),
        endAt: toUtcIso("2099-11-30T19:00:00Z"),
        endless: false,
        confirmed: false,
        raidType: null,
        jpRaidSeasonIndex: null,
      },
    ]);
  });

  it("skips drills without a GL schedule or whose GL schedule has ended", async () => {
    mockBaql({
      jointFiringDrills: {
        data: {
          jointFiringDrills: [
            drill("97", "shooting", [{ region: "jp", startAt: "2099-10-01T02:00:00Z", endAt: "2099-10-07T19:00:00Z" }]),
            drill("96", "defense", [
              { region: "gl", startAt: "2000-01-01T02:00:00Z", endAt: "2000-01-07T19:00:00Z" },
              { region: "jp", startAt: "2099-10-01T02:00:00Z", endAt: "2099-10-07T19:00:00Z" },
            ]),
            drill("95", "assault"),
          ],
        },
      },
    });

    await syncTimelineContentsFromSources(env);

    expect(planFor("joint_firing_drill")?.creates.map((row) => row.uid)).toEqual(["jfd-95"]);
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("syncs valid drills but fails the run for an unknown drill type instead of inventing a name", async () => {
    mockBaql({
      jointFiringDrills: { data: { jointFiringDrills: [drill("95", "assault"), drill("94", "new_type")] } },
    });

    await expect(syncTimelineContentsFromSources(env)).rejects.toThrow(AggregateError);

    expect(planFor("joint_firing_drill")?.creates.map((row) => row.uid)).toEqual(["jfd-95"]);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Timeline auto sync rejected source items",
      expect.objectContaining({ message: expect.stringContaining("94 (unknown drill type: new_type)") }),
      { contentType: "joint_firing_drill" },
    );
  });

  it("writes nothing for a source and fails the run when its BAQL query fails", async () => {
    mockBaql({
      campaigns: { error: new Error("baql down") },
      jointFiringDrills: { data: { jointFiringDrills: [drill("95", "assault")] } },
    });

    await expect(syncTimelineContentsFromSources(env)).rejects.toThrow(AggregateError);

    expect(planFor("campaign")).toBeUndefined();
    expect(planFor("joint_firing_drill")?.creates.map((row) => row.uid)).toEqual(["jfd-95"]);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Timeline auto sync source failed",
      expect.objectContaining({ message: "baql down" }),
      { contentType: "campaign" },
    );
  });

  it("keeps running the remaining sources after one fails", async () => {
    const failing: TimelineAutoSyncSource = {
      contentType: "campaign",
      fetchCandidates: async () => {
        throw new Error("source failed");
      },
    };
    const working: TimelineAutoSyncSource = {
      contentType: "raid",
      fetchCandidates: async () => ({ candidates: [], rejected: [] }),
    };

    await expect(syncTimelineContentsFromSources(env, undefined, [failing, working])).rejects.toThrow(AggregateError);

    expect(mockedApply).toHaveBeenCalledTimes(1);
  });

  describe("raids", () => {
    function raidRow(overrides: Partial<TimelineAutoSyncExistingRow>) {
      return existingRow({
        contentType: "raid",
        startAt: toUtcIso("2099-12-15T02:00:00Z"),
        endAt: toUtcIso("2099-12-21T19:00:00Z"),
        ...overrides,
      });
    }

    it("asks BAQL for GL raid schedules and creates unconfirmed rows named after the boss, only for three types", async () => {
      mockBaql({
        raidSchedules: raidSchedules([
          raidSchedule("gl_total_assault_93", "total_assault"),
          raidSchedule("gl_elimination_39", "elimination"),
          raidSchedule("gl_unlimit_32", "unlimit"),
          raidSchedule("gl_allied_5", "allied"),
        ]),
      });

      await syncTimelineContentsFromSources(env);

      expect(queryVariables("TimelineAutoSyncRaidSchedules")).toEqual({ region: "gl", endAfter: expect.any(Date) });
      expect(planFor("raid")?.creates).toEqual([
        expect.objectContaining({
          uid: expect.stringMatching(/^raid-[A-Za-z0-9_-]{16}$/),
          contentType: "raid",
          contentUid: "gl_total_assault_93",
          runType: "first",
          occurrence: null,
          nameI18n: { ko: "호크마" },
          confirmed: false,
          raidType: "total_assault",
          jpRaidSeasonIndex: 96,
        }),
        expect.objectContaining({ contentUid: "gl_elimination_39", raidType: "elimination", jpRaidSeasonIndex: 42 }),
        expect.objectContaining({ contentUid: "gl_unlimit_32", raidType: "unlimit", jpRaidSeasonIndex: 35 }),
      ]);
    });

    it("updates the row of the same JP season and copies BAQL's GL uid into it", async () => {
      mockRows({
        raid: [raidRow({ uid: "allied_5", contentUid: "gl_allied_4", raidType: "allied", jpRaidSeasonIndex: 8 })],
      });
      mockBaql({ raidSchedules: raidSchedules([raidSchedule("gl_allied_5", "allied")]) });

      await syncTimelineContentsFromSources(env);

      expect(planFor("raid")).toEqual(
        expect.objectContaining({
          creates: [],
          updates: [
            {
              uid: "allied_5",
              match: expect.any(Object),
              readSchedule: expect.any(Object),
              startAt: toUtcIso("2099-12-16T02:00:00Z"),
              endAt: toUtcIso("2099-12-22T19:00:00Z"),
              endless: false,
              contentUid: "gl_allied_5",
            },
          ],
          missingUids: [],
        }),
      );
    });

    it("creates no row while a future raid row has no JP season, and reports it", async () => {
      mockRows({
        raid: [
          raidRow({ uid: "unlinked", contentUid: "gl_total_assault_93" }),
          raidRow({ uid: "linked", contentUid: "gl_elimination_38", raidType: "elimination", jpRaidSeasonIndex: 42 }),
        ],
      });
      mockBaql({
        raidSchedules: raidSchedules([
          raidSchedule("gl_total_assault_93", "total_assault"),
          raidSchedule("gl_elimination_39", "elimination"),
        ]),
      });

      await syncTimelineContentsFromSources(env);

      expect(planFor("raid")).toEqual(
        expect.objectContaining({
          creates: [],
          updates: [
            expect.objectContaining({ uid: "linked", match: expect.any(Object), contentUid: "gl_elimination_39" }),
          ],
          unlinkedUids: ["unlinked"],
        }),
      );
    });

    it("writes nothing for a JP season that a GL schedule without a start also refers to, and still rejects that one", async () => {
      mockRows({
        raid: [raidRow({ uid: "unlimit_30", contentUid: "gl_unlimit_30", raidType: "unlimit", jpRaidSeasonIndex: 33 })],
      });
      mockBaql({
        raidSchedules: raidSchedules([
          raidSchedule("gl_unlimit_30", "unlimit"),
          raidSchedule("gl_unlimit_31", "unlimit", {
            startAt: null,
            jpSchedule: { raidType: "unlimit", seasonIndex: 33 },
          }),
        ]),
      });

      await expect(syncTimelineContentsFromSources(env)).rejects.toThrow(AggregateError);

      expect(planFor("raid")).toEqual(
        expect.objectContaining({
          creates: [],
          updates: [],
          missingUids: [],
          ambiguousJpRaidSeasonContentUids: ["gl_unlimit_30", "gl_unlimit_31"],
        }),
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Timeline auto sync rejected source items",
        expect.objectContaining({ message: expect.stringContaining("gl_unlimit_31 (raid schedule has no start)") }),
        { contentType: "raid" },
      );
    });

    it("reports the rows that blocked creation at write time with the unlinked rows of the read", async () => {
      mockBaql({ raidSchedules: raidSchedules([raidSchedule("gl_total_assault_93", "total_assault")]) });
      mockedApply.mockResolvedValue({ createdUids: [], updatedUids: [], creationBlockedByUids: ["added-by-admin"] });

      await syncTimelineContentsFromSources(env);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Timeline auto sync completed",
        expect.objectContaining({
          contentType: "raid",
          created: [],
          createsSkippedAtWrite: [expect.stringMatching(/^raid-/)],
          unlinkedRows: ["added-by-admin"],
        }),
      );
    });

    it("writes nothing for a GL schedule without a JP schedule and reports it", async () => {
      mockBaql({
        raidSchedules: raidSchedules([raidSchedule("gl_total_assault_93", "total_assault", { jpSchedule: null })]),
      });

      await syncTimelineContentsFromSources(env);

      expect(planFor("raid")).toEqual(
        expect.objectContaining({ creates: [], updates: [], withoutJpRaidSeasonContentUids: ["gl_total_assault_93"] }),
      );
    });

    it("updates a future row from a GL schedule that has already started, and creates no row for one", async () => {
      mockRows({
        raid: [
          raidRow({
            uid: "unlimit_30",
            contentUid: "gl_unlimit_30",
            raidType: "unlimit",
            jpRaidSeasonIndex: 33,
            startAt: toUtcIso("2099-12-15T02:00:00Z"),
          }),
        ],
      });
      mockBaql({
        raidSchedules: raidSchedules([
          raidSchedule("gl_unlimit_30", "unlimit", { startAt: "2000-11-01T02:00:00Z", endAt: "2099-12-01T19:00:00Z" }),
          raidSchedule("gl_elimination_39", "elimination", { startAt: "2000-11-01T02:00:00Z" }),
        ]),
      });

      await syncTimelineContentsFromSources(env);

      expect(planFor("raid")).toEqual(
        expect.objectContaining({
          creates: [],
          updates: [
            {
              uid: "unlimit_30",
              startAt: toUtcIso("2000-11-01T02:00:00Z"),
              endAt: toUtcIso("2099-12-01T19:00:00Z"),
              endless: false,
              match: { kind: "jpRaidSeason", contentType: "raid", raidType: "unlimit", seasonIndex: 33 },
              readSchedule: {
                startAt: toUtcIso("2099-12-15T02:00:00Z"),
                endAt: toUtcIso("2099-12-21T19:00:00Z"),
                endless: false,
              },
            },
          ],
        }),
      );
    });

    it("gives a created raid row a random uid that does not carry the GL uid", async () => {
      mockBaql({ raidSchedules: raidSchedules([raidSchedule("gl_total_assault_93", "total_assault")]) });

      await syncTimelineContentsFromSources(env);

      const [created] = planFor("raid")?.creates ?? [];
      expect(created?.uid).toMatch(/^raid-[A-Za-z0-9_-]{16}$/);
      expect(created?.uid).not.toContain("93");
      expect(created?.contentUid).toBe("gl_total_assault_93");
    });

    it("creates no row for a started schedule and ignores other regions", async () => {
      mockBaql({
        raidSchedules: raidSchedules([
          raidSchedule("gl_total_assault_92", "total_assault", { startAt: "2000-01-01T02:00:00Z" }),
          { ...raidSchedule("jp_total_assault_99", "total_assault"), region: "jp" },
        ]),
      });

      await syncTimelineContentsFromSources(env);

      expect(planFor("raid")?.creates).toEqual([]);
    });

    it("fails the run instead of reporting the rest as missing when BAQL pages the list", async () => {
      mockBaql({ raidSchedules: raidSchedules([raidSchedule("gl_total_assault_93", "total_assault")], true) });

      await expect(syncTimelineContentsFromSources(env)).rejects.toThrow(AggregateError);

      expect(planFor("raid")).toBeUndefined();
    });

    it("rejects a schedule that cannot become a row and still syncs the others", async () => {
      mockBaql({
        raidSchedules: raidSchedules([
          raidSchedule("gl_total_assault_93", "total_assault"),
          { ...raidSchedule("gl_elimination_39", "elimination"), raidBoss: { name: " " } },
        ]),
      });

      await expect(syncTimelineContentsFromSources(env)).rejects.toThrow(AggregateError);

      expect(planFor("raid")?.creates.map((row) => row.contentUid)).toEqual(["gl_total_assault_93"]);
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Timeline auto sync rejected source items",
        expect.objectContaining({ message: expect.stringContaining("gl_elimination_39 (raid boss has no name)") }),
        { contentType: "raid" },
      );
    });
  });

  describe("campaigns and drills keep their update rules", () => {
    it("updates the row of a running campaign when its end changes", async () => {
      mockRows({
        campaign: [
          existingRow({
            uid: "campaign-20991103",
            contentType: "campaign",
            contentUid: "20991103",
            startAt: toUtcIso("2000-11-02T19:00:00Z"),
            endAt: toUtcIso("2099-11-09T19:00:00Z"),
          }),
        ],
      });
      mockBaql({
        campaigns: {
          data: {
            campaigns: [
              { ...campaign("20991103", ["exp"]), startAt: "2000-11-02T19:00:00Z", endAt: "2099-11-10T19:00:00Z" },
            ],
          },
        },
      });

      await syncTimelineContentsFromSources(env);

      expect(planFor("campaign")).toEqual(
        expect.objectContaining({
          updateStartedRows: true,
          creates: [],
          updates: [
            {
              uid: "campaign-20991103",
              match: expect.any(Object),
              readSchedule: expect.any(Object),
              startAt: toUtcIso("2000-11-02T19:00:00Z"),
              endAt: toUtcIso("2099-11-10T19:00:00Z"),
              endless: false,
            },
          ],
        }),
      );
    });

    it("makes a drill row endless when its GL schedule loses its end, as before", async () => {
      mockRows({
        joint_firing_drill: [existingRow({ uid: "jfd-95", contentType: "joint_firing_drill", contentUid: "95" })],
      });
      mockBaql({
        jointFiringDrills: {
          data: {
            jointFiringDrills: [
              drill("95", "assault", [{ region: "gl", startAt: "2099-12-01T02:00:00Z", endAt: null }]),
            ],
          },
        },
      });

      await syncTimelineContentsFromSources(env);

      expect(planFor("joint_firing_drill")?.updates).toEqual([
        {
          uid: "jfd-95",
          match: expect.any(Object),
          readSchedule: expect.any(Object),
          startAt: toUtcIso("2099-12-01T02:00:00Z"),
          endAt: null,
          endless: true,
        },
      ]);
    });

    it("updates only future rows of the sources added for forecast schedules", async () => {
      mockRows({ event: [existingRow({ uid: "running-event", startAt: toUtcIso("2000-01-01T02:00:00Z") })] });

      await syncTimelineContentsFromSources(env);

      expect(queryVariables("TimelineAutoSyncEventContents")).toBeUndefined();
      expect(planFor("event")?.updateStartedRows).toBe(false);
    });
  });

  describe("mini events", () => {
    function miniEvents(schedules: Array<{ region: string; occurrence: number; startAt: string; endAt: string }>) {
      return { data: { miniEventContents: [{ uid: "60000", schedules }] } };
    }

    it("moves a future row to the GL run with the same occurrence, and never creates one", async () => {
      mockRows({
        mini_event: [
          existingRow({
            uid: "schale_settlement_20",
            contentType: "mini_event",
            contentUid: "60000",
            occurrence: 20,
            startAt: toUtcIso("2099-12-08T02:00:00Z"),
            endAt: toUtcIso("2099-12-15T02:00:00Z"),
          }),
        ],
      });
      mockBaql({
        miniEventContents: miniEvents([
          { region: "jp", occurrence: 20, startAt: "2099-06-01T02:00:00Z", endAt: "2099-06-08T02:00:00Z" },
          { region: "gl", occurrence: 21, startAt: "2099-12-29T02:00:00Z", endAt: "2100-01-05T02:00:00Z" },
          { region: "gl", occurrence: 20, startAt: "2099-12-01T02:00:00Z", endAt: "2099-12-08T02:00:00Z" },
        ]),
      });

      await syncTimelineContentsFromSources(env);

      expect(planFor("mini_event")).toEqual({
        updateStartedRows: false,
        matchBy: "content",
        creates: [],
        updates: [
          {
            uid: "schale_settlement_20",
            match: expect.any(Object),
            readSchedule: expect.any(Object),
            startAt: toUtcIso("2099-12-01T02:00:00Z"),
            endAt: toUtcIso("2099-12-08T02:00:00Z"),
            endless: false,
          },
        ],
        conflictUids: [],
        duplicateUids: [],
        missingUids: [],
        withoutJpRaidSeasonContentUids: [],
        unlinkedUids: [],
        ambiguousJpRaidSeasonContentUids: [],
      });
    });

    it("leaves a row alone and reports it when only another region has its occurrence", async () => {
      mockRows({
        mini_event: [
          existingRow({ uid: "schale_settlement_22", contentType: "mini_event", contentUid: "60000", occurrence: 22 }),
        ],
      });
      mockBaql({
        miniEventContents: miniEvents([
          { region: "jp", occurrence: 22, startAt: "2099-06-01T02:00:00Z", endAt: "2099-06-08T02:00:00Z" },
          { region: "gl", occurrence: 21, startAt: "2099-12-29T02:00:00Z", endAt: "2100-01-05T02:00:00Z" },
        ]),
      });

      await syncTimelineContentsFromSources(env);

      expect(planFor("mini_event")).toEqual(
        expect.objectContaining({ updates: [], creates: [], missingUids: ["schale_settlement_22"] }),
      );
    });

    it("rejects a row without an occurrence when the mini event has several GL runs, instead of moving it", async () => {
      mockRows({
        mini_event: [
          existingRow({ uid: "schale_settlement", contentType: "mini_event", contentUid: "60000", occurrence: null }),
        ],
      });
      mockBaql({
        miniEventContents: miniEvents([
          { region: "gl", occurrence: 1, startAt: "2023-01-01T02:00:00Z", endAt: "2023-01-08T02:00:00Z" },
          { region: "gl", occurrence: 2, startAt: "2099-12-29T02:00:00Z", endAt: "2100-01-05T02:00:00Z" },
        ]),
      });

      await expect(syncTimelineContentsFromSources(env)).rejects.toThrow(AggregateError);

      expect(planFor("mini_event")).toEqual(
        expect.objectContaining({ updates: [], creates: [], missingUids: ["schale_settlement"] }),
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Timeline auto sync rejected source items",
        expect.objectContaining({
          message: expect.stringContaining(
            "60000 (row schale_settlement has no occurrence and the mini event has 2 GL runs)",
          ),
        }),
        { contentType: "mini_event" },
      );
    });

    it("moves a row without an occurrence to the mini event's only GL run", async () => {
      mockRows({
        mini_event: [
          existingRow({ uid: "schale_settlement", contentType: "mini_event", contentUid: "60000", occurrence: null }),
        ],
      });
      mockBaql({
        miniEventContents: miniEvents([
          { region: "jp", occurrence: 1, startAt: "2099-06-01T02:00:00Z", endAt: "2099-06-08T02:00:00Z" },
          { region: "gl", occurrence: 1, startAt: "2099-12-01T02:00:00Z", endAt: "2099-12-08T02:00:00Z" },
        ]),
      });

      await syncTimelineContentsFromSources(env);

      expect(planFor("mini_event")?.updates).toEqual([
        expect.objectContaining({
          uid: "schale_settlement",
          startAt: toUtcIso("2099-12-01T02:00:00Z"),
          endAt: toUtcIso("2099-12-08T02:00:00Z"),
        }),
      ]);
    });

    it("does not ask BAQL for mini events when no future mini event row exists", async () => {
      await syncTimelineContentsFromSources(env);

      expect(queryVariables("TimelineAutoSyncMiniEventContents")).toBeUndefined();
    });
  });

  describe("events and stories", () => {
    it("moves a future event row to its GL schedule of the same run type, and never creates one", async () => {
      mockRows({
        event: [
          existingRow({ uid: "pandemic-hazard-rerun", contentUid: "844", runType: "rerun" }),
          existingRow({ uid: "past-event", contentUid: "800", startAt: toUtcIso("2000-01-01T02:00:00Z") }),
        ],
      });
      mockBaql({
        eventContents: {
          data: {
            eventContents: [
              {
                uid: "844",
                schedules: [
                  { region: "jp", runType: "rerun", startAt: "2099-10-01T02:00:00Z", endAt: "2099-10-15T02:00:00Z" },
                  { region: "gl", runType: "first", startAt: "2098-10-01T02:00:00Z", endAt: "2098-10-15T02:00:00Z" },
                  { region: "gl", runType: "rerun", startAt: "2099-12-02T02:00:00Z", endAt: "2099-12-16T02:00:00Z" },
                ],
              },
              {
                uid: "999",
                schedules: [{ region: "gl", runType: "first", startAt: "2099-12-02T02:00:00Z", endAt: null }],
              },
            ],
          },
        },
      });

      await syncTimelineContentsFromSources(env);

      expect(queryVariables("TimelineAutoSyncEventContents")).toEqual({ uids: ["844"] });
      expect(planFor("event")).toEqual({
        updateStartedRows: false,
        matchBy: "content",
        creates: [],
        updates: [
          {
            uid: "pandemic-hazard-rerun",
            match: expect.any(Object),
            readSchedule: expect.any(Object),
            startAt: toUtcIso("2099-12-02T02:00:00Z"),
            endAt: toUtcIso("2099-12-16T02:00:00Z"),
            endless: false,
          },
        ],
        conflictUids: [],
        duplicateUids: [],
        missingUids: [],
        withoutJpRaidSeasonContentUids: [],
        unlinkedUids: [],
        ambiguousJpRaidSeasonContentUids: [],
      });
    });

    it("leaves an event row alone when BAQL has only another region's schedule", async () => {
      mockRows({ event: [existingRow({ uid: "jp-only", contentUid: "844" })] });
      mockBaql({
        eventContents: {
          data: {
            eventContents: [
              {
                uid: "844",
                schedules: [
                  { region: "jp", runType: "first", startAt: "2099-10-01T02:00:00Z", endAt: "2099-10-15T02:00:00Z" },
                ],
              },
            ],
          },
        },
      });

      await syncTimelineContentsFromSources(env);

      expect(planFor("event")).toEqual(expect.objectContaining({ updates: [], missingUids: ["jp-only"] }));
    });

    it("does not ask BAQL for events when no future event row exists", async () => {
      await syncTimelineContentsFromSources(env);

      expect(queryVariables("TimelineAutoSyncEventContents")).toBeUndefined();
    });

    it("moves main and mini story rows to their GL release and keeps each row's own length", async () => {
      mockRows({
        main_story: [
          existingRow({
            uid: "mainstory-s2-vol1-1",
            contentType: "main_story",
            contentUid: "2-1-1-1",
            startAt: toUtcIso("2099-12-01T02:00:00Z"),
            endAt: toUtcIso("2099-12-08T02:00:00Z"),
            endless: true,
          }),
        ],
        mini_story: [
          existingRow({
            uid: "ibukis-runaway",
            contentType: "mini_story",
            contentUid: "ibukis-runaway",
            startAt: toUtcIso("2099-12-08T02:00:00Z"),
            endAt: toUtcIso("2099-12-15T02:00:00Z"),
            endless: true,
          }),
        ],
      });
      mockBaql({
        mainStories: {
          data: {
            mainStories: [
              {
                chapters: [
                  {
                    parts: [
                      {
                        uid: "2-1-1-1",
                        schedules: [
                          { region: "jp", releasedAt: "2099-06-01T02:00:00Z" },
                          { region: "gl", releasedAt: "2099-12-02T02:00:00Z" },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        miniStories: {
          data: {
            miniStories: [{ uid: "ibukis-runaway", schedules: [{ region: "gl", releasedAt: "2099-12-09T02:00:00Z" }] }],
          },
        },
      });

      await syncTimelineContentsFromSources(env);

      expect(planFor("main_story")?.updates).toEqual([
        {
          uid: "mainstory-s2-vol1-1",
          match: expect.any(Object),
          readSchedule: expect.any(Object),
          startAt: toUtcIso("2099-12-02T02:00:00Z"),
          endAt: toUtcIso("2099-12-09T02:00:00Z"),
          endless: true,
        },
      ]);
      expect(planFor("mini_story")?.updates).toEqual([
        {
          uid: "ibukis-runaway",
          match: expect.any(Object),
          readSchedule: expect.any(Object),
          startAt: toUtcIso("2099-12-09T02:00:00Z"),
          endAt: toUtcIso("2099-12-16T02:00:00Z"),
          endless: true,
        },
      ]);
    });
  });
});
