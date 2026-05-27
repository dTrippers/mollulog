import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { RecruitmentRepository } from "../../../app/repositories/recruitment";
import { runQuery } from "~/lib/baql";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

type RepositoryEnv = ConstructorParameters<typeof RecruitmentRepository>[0];
const mockedRunQuery = runQuery as unknown as {
  mockReset: () => void;
  mockResolvedValueOnce: (value: unknown) => unknown;
  mockImplementation: (fn: () => Promise<unknown>) => unknown;
};

function createEnv(disableCache = "true"): RepositoryEnv {
  return {
    DISABLE_CACHE: disableCache,
    KV_CACHE: {
      get: jest.fn(async () => null),
      put: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      list: jest.fn(async () => ({ keys: [] })),
    },
  } as unknown as RepositoryEnv;
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

afterEach(() => {
  jest.restoreAllMocks();
  mockedRunQuery.mockReset();
});

describe("RecruitmentRepository.refresh", () => {
  it("passes a seven-day endAfter bound to BAQL", async () => {
    jest.spyOn(Date, "now").mockReturnValue(new Date("2026-05-11T00:00:00.000Z").getTime());
    mockedRunQuery.mockResolvedValueOnce(createResult([]));

    const repository = new RecruitmentRepository(createEnv());

    await expect(repository.refresh()).resolves.toEqual([]);

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
    mockedRunQuery.mockResolvedValueOnce(createResult(firstGroups));
    mockedRunQuery.mockResolvedValueOnce(createResult(secondGroups));

    const repository = new RecruitmentRepository(createEnv());

    await expect(repository.refresh()).resolves.toEqual(firstGroups);
    await expect(repository.refresh()).resolves.toEqual(secondGroups);

    expect(runQuery).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent refresh requests while one is in flight", async () => {
    let releaseRefreshPromise!: (value: ReturnType<typeof createResult>) => void;
    mockedRunQuery.mockImplementation(
      () =>
        new Promise<ReturnType<typeof createResult>>((resolve) => {
          releaseRefreshPromise = resolve as (value: ReturnType<typeof createResult>) => void;
        }),
    );

    const repository = new RecruitmentRepository(createEnv());
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

    const firstRefresh = repository.refresh();
    const secondRefresh = repository.refresh();

    expect(runQuery).toHaveBeenCalledTimes(1);

    releaseRefreshPromise(createResult(expectedGroups));

    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([expectedGroups, expectedGroups]);
  });
});

describe("RecruitmentRepository historical lookups", () => {
  it("fetches historical recruitment groups without the seven-day endAfter bound", async () => {
    mockedRunQuery.mockResolvedValueOnce(createResult([]));

    const repository = new RecruitmentRepository(createEnv());

    await expect(repository.getAllHistorical()).resolves.toEqual([]);

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

    const repository = new RecruitmentRepository(createEnv());

    await expect(repository.getByUids(["magical-heavy-caliber"])).resolves.toEqual([oldPickupGroup]);
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

    const repository = new RecruitmentRepository(createEnv());

    await expect(repository.getByUid("magical-heavy-caliber")).resolves.toEqual(oldPickupGroup);
    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      endAfter: null,
      uids: null,
    });
  });
});
