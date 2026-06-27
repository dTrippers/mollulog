import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { runQuery } from "~/lib/baql";
import {
  getAllHistoricalRecruitmentGroups,
  getRecruitmentGroupByUid,
  getRecruitmentGroupsByUids,
  warmRecruitmentCache,
} from "../../../app/models/recruitment";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

type ModelEnv = Env;
const mockedRunQuery = runQuery as unknown as {
  mockReset: () => void;
  mockResolvedValueOnce: (value: unknown) => unknown;
  mockImplementation: (fn: () => Promise<unknown>) => unknown;
};

function createEnv(disableCache = "true"): ModelEnv {
  return {
    DISABLE_CACHE: disableCache,
    KV_CACHE: {
      get: jest.fn(async () => null),
      put: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      list: jest.fn(async () => ({ keys: [] })),
    },
  } as unknown as ModelEnv;
}

function createResult(groups: unknown[]) {
  return {
    data: { recruitmentGroups: groups },
    error: undefined,
    extensions: undefined,
    operation: {} as never,
    stale: false,
    hasNext: false,
  };
}

function createPoolResult(students: unknown[]) {
  return {
    data: { students },
    error: undefined,
    extensions: undefined,
    operation: {} as never,
    stale: false,
    hasNext: false,
  };
}

function mockRefreshResults(groups: unknown[]) {
  mockedRunQuery.mockResolvedValueOnce(createResult(groups));
  mockedRunQuery.mockResolvedValueOnce(createResult([]));
  mockedRunQuery.mockResolvedValueOnce(createPoolResult([]));
}

async function waitForRunQueryCall() {
  for (let i = 0; i < 10; i += 1) {
    if ((runQuery as jest.Mock).mock.calls.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => {
  jest.restoreAllMocks();
  mockedRunQuery.mockReset();
});

describe("warmRecruitmentCache", () => {
  it("passes a seven-day endAfter bound to BAQL", async () => {
    jest.spyOn(Date, "now").mockReturnValue(new Date("2026-05-11T00:00:00.000Z").getTime());
    mockRefreshResults([]);

    await expect(warmRecruitmentCache(createEnv())).resolves.toEqual([]);

    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      endAfter: new Date("2026-05-04T00:00:00.000Z"),
      uids: null,
    });
  });

  it("refreshes again after a successful refresh completes", async () => {
    const firstGroups = [
      {
        uid: "pickup-a",
        startAt: "2026-04-01T00:00:00Z",
        endAt: null,
        contentType: "pickup",
        contentUid: null,
        recruitmentType: "pickup",
        recruitments: [],
      },
    ];
    const secondGroups = [
      {
        uid: "pickup-b",
        startAt: "2026-04-02T00:00:00Z",
        endAt: null,
        contentType: "pickup",
        contentUid: null,
        recruitmentType: "pickup",
        recruitments: [],
      },
    ];
    mockRefreshResults(firstGroups);
    mockRefreshResults(secondGroups);

    const env = createEnv();

    await expect(warmRecruitmentCache(env)).resolves.toEqual(firstGroups);
    await expect(warmRecruitmentCache(env)).resolves.toEqual(secondGroups);

    expect(runQuery).toHaveBeenCalledTimes(6);
  });

  it("uses source-cache in-flight deduplication for concurrent non-force list requests", async () => {
    let callCount = 0;
    let releaseListPromise!: (value: ReturnType<typeof createResult>) => void;
    mockedRunQuery.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<ReturnType<typeof createResult>>((resolve) => {
          releaseListPromise = resolve as (value: ReturnType<typeof createResult>) => void;
        });
      }

      return Promise.resolve(createResult([]));
    });

    const env = createEnv("false");
    const expectedGroups = [
      {
        uid: "pickup-a",
        startAt: "2026-04-01T00:00:00Z",
        endAt: null,
        contentType: "pickup",
        contentUid: null,
        recruitmentType: "pickup",
        recruitments: [],
      },
    ];

    const firstRequest = getAllHistoricalRecruitmentGroups(env);
    const secondRequest = getAllHistoricalRecruitmentGroups(env);
    await waitForRunQueryCall();

    expect(runQuery).toHaveBeenCalledTimes(1);

    releaseListPromise(createResult(expectedGroups));

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([expectedGroups, expectedGroups]);
    expect(runQuery).toHaveBeenCalledTimes(1);
  });
});

describe("recruitment historical lookups", () => {
  it("fetches historical recruitment groups without the seven-day endAfter bound", async () => {
    mockedRunQuery.mockResolvedValueOnce(createResult([]));

    await expect(getAllHistoricalRecruitmentGroups(createEnv())).resolves.toEqual([]);

    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      endAfter: null,
      uids: null,
    });
  });

  it("resolves requested uids from historical groups so old pickup histories keep their pickup metadata", async () => {
    const oldPickupGroup = {
      uid: "magical-heavy-caliber",
      startAt: "2026-03-10T02:00:00Z",
      endAt: "2026-03-24T02:00:00Z",
      contentType: "event",
      contentUid: "851",
      recruitmentType: "usual",
      recruitments: [
        {
          recruitmentType: "usual",
          pickup: true,
          rerun: false,
          since: "2026-03-10T02:00:00Z",
          until: "2026-03-24T02:00:00Z",
          studentName: "스즈미(매지컬)",
          student: {
            uid: "10129",
            attackType: "explosive",
            defenseType: "light",
            role: "striker",
            name: "스즈미(매지컬)",
            schaleDbId: null,
            initialTier: 3,
            releaseAt: null,
            archiveAt: null,
          },
        },
      ],
    };
    mockedRunQuery.mockResolvedValueOnce(createResult([oldPickupGroup]));

    await expect(getRecruitmentGroupsByUids(createEnv(), ["magical-heavy-caliber"])).resolves.toEqual([oldPickupGroup]);
    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      endAfter: null,
      uids: null,
    });
  });

  it("resolves a single requested uid from historical groups", async () => {
    const oldPickupGroup = {
      uid: "magical-heavy-caliber",
      startAt: "2026-03-10T02:00:00Z",
      endAt: "2026-03-24T02:00:00Z",
      contentType: "event",
      contentUid: "851",
      recruitmentType: "usual",
      recruitments: [],
    };
    mockedRunQuery.mockResolvedValueOnce(createResult([oldPickupGroup]));

    await expect(getRecruitmentGroupByUid(createEnv(), "magical-heavy-caliber")).resolves.toEqual(oldPickupGroup);
    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      endAfter: null,
      uids: null,
    });
  });
});
