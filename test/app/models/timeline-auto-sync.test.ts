import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { applyPostgresTimelineAutoSyncPlan, getPostgresTimelineAutoSyncRows } from "~/db/postgres/timeline-contents";
import { runQuery } from "~/lib/baql";
import { toUtcIso } from "~/lib/date-time";
import { syncTimelineContentsFromSources, type TimelineAutoSyncSource } from "~/models/timeline-auto-sync.server";

const mockLoggerError = jest.fn();

jest.mock("~/db/postgres/timeline-contents", () => ({
  applyPostgresTimelineAutoSyncPlan: jest.fn(),
  getPostgresTimelineAutoSyncRows: jest.fn(),
}));
jest.mock("~/lib/baql", () => ({ runQuery: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => ({ info: jest.fn(), error: mockLoggerError })),
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

/** Answers each source's query separately; a source left out gets an empty list. */
function mockBaql(results: { campaigns?: BaqlResult; jointFiringDrills?: BaqlResult }) {
  mockedRunQuery.mockImplementation(async (document) => {
    switch (operationName(document)) {
      case "TimelineAutoSyncCampaigns":
        return results.campaigns ?? { data: { campaigns: [] } };
      case "TimelineAutoSyncJointFiringDrills":
        return results.jointFiringDrills ?? { data: { jointFiringDrills: [] } };
      default:
        throw new Error(`unexpected BAQL query: ${operationName(document)}`);
    }
  });
}

function planFor(contentType: string) {
  return mockedApply.mock.calls.find((call) => call[1].creates.some((row) => row.contentType === contentType))?.[1];
}

function queryVariables(name: string) {
  return mockedRunQuery.mock.calls.find((call) => operationName(call[0]) === name)?.[1];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetRows.mockResolvedValue([]);
  mockedApply.mockResolvedValue();
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

    expect(mockedApply).toHaveBeenCalledTimes(1);
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
});
