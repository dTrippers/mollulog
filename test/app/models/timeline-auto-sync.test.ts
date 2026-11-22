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

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetRows.mockResolvedValue([]);
  mockedApply.mockResolvedValue();
});

describe("syncTimelineContentsFromSources", () => {
  it("creates confirmed campaign rows in the existing uid and name format, asking BAQL for GL campaigns", async () => {
    mockedRunQuery.mockResolvedValue({
      data: { campaigns: [campaign("20991103", ["mission_normal", "mission_hard"])] },
    });

    await syncTimelineContentsFromSources(env);

    expect(mockedRunQuery.mock.calls[0]?.[1]).toEqual({ region: "gl", endAfter: expect.any(Date) });
    const plan = mockedApply.mock.calls[0]?.[1];
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
    mockedRunQuery.mockResolvedValue({
      data: { campaigns: [campaign("20991103", ["exp"]), campaign("20991104", ["new_category"])] },
    });

    await expect(syncTimelineContentsFromSources(env)).rejects.toThrow(AggregateError);

    const plan = mockedApply.mock.calls[0]?.[1];
    expect(plan?.creates.map((row) => row.uid)).toEqual(["campaign-20991103"]);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Timeline auto sync rejected source items",
      expect.objectContaining({
        message: expect.stringContaining("20991104 (unknown campaign category: new_category)"),
      }),
      { contentType: "campaign" },
    );
  });

  it("writes nothing and fails the run when BAQL fails", async () => {
    mockedRunQuery.mockResolvedValue({ error: new Error("baql down") });

    await expect(syncTimelineContentsFromSources(env)).rejects.toThrow(AggregateError);

    expect(mockedApply).not.toHaveBeenCalled();
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
