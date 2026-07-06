import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Defense, Difficulty } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import type { RaidDefenseTypeSet } from "../../../app/models/raid";
import {
  findRaidScheduleSummaryByTypeAndSeason,
  getAllRaidSchedules,
  getRaidDefenseTypeSetByQuery,
  getRaidScheduleByTypeAndSeason,
} from "../../../app/models/raid";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;

function createEnv(): Env {
  return {
    DISABLE_CACHE: "true",
    KV_CACHE: {
      get: jest.fn(async () => null),
      put: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      list: jest.fn(async () => ({ keys: [], list_complete: true })),
    },
  } as unknown as Env;
}

afterEach(() => {
  jest.restoreAllMocks();
  mockedRunQuery.mockReset();
});

describe("getAllRaidSchedules", () => {
  it("does not pass an endAfter bound so historical raid routes stay linkable", async () => {
    mockedRunQuery.mockResolvedValueOnce({
      data: { raidSchedules: { nodes: [] } },
      error: undefined,
    } as Awaited<ReturnType<typeof runQuery>>);

    await expect(getAllRaidSchedules(createEnv(), true)).resolves.toEqual([]);

    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      region: "gl",
      endAfter: null,
      raidType: null,
    });
  });

  it("passes raidType when a schedule type filter is requested", async () => {
    mockedRunQuery.mockResolvedValueOnce({
      data: { raidSchedules: { nodes: [] } },
      error: undefined,
    } as Awaited<ReturnType<typeof runQuery>>);

    await expect(getAllRaidSchedules(createEnv(), true, { raidType: "total_assault" })).resolves.toEqual([]);

    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      region: "gl",
      endAfter: null,
      raidType: "total_assault",
    });
  });
});

describe("getRaidDefenseTypeSetByQuery", () => {
  const lightSet: RaidDefenseTypeSet = {
    difficulty: Difficulty.Torment,
    defenseTypes: [Defense.Light],
    primaryDefenseType: Defense.Light,
    secondaryDefenseTypes: [],
  };
  const specialSet: RaidDefenseTypeSet = {
    difficulty: Difficulty.Insane,
    defenseTypes: [Defense.Special, Defense.Elastic],
    primaryDefenseType: Defense.Special,
    secondaryDefenseTypes: [Defense.Elastic],
  };

  it("uses the full defense type set key when present", () => {
    expect(getRaidDefenseTypeSetByQuery([lightSet, specialSet], "insane:special,elastic", Defense.Light)).toBe(
      specialSet,
    );
  });

  it("falls back to the legacy primary defense type query", () => {
    expect(getRaidDefenseTypeSetByQuery([lightSet, specialSet], null, Defense.Special)).toBe(specialSet);
  });

  it("uses the first available set when the query does not match", () => {
    expect(getRaidDefenseTypeSetByQuery([lightSet, specialSet], "unknown", "unknown")).toBe(lightSet);
  });

  it("returns null when no defense type set exists", () => {
    expect(getRaidDefenseTypeSetByQuery([], null, null)).toBeNull();
  });
});

function raidScheduleNode({
  uid = "gl_elimination_42",
  raidType = "elimination",
  seasonIndex = 42,
  bossUid = "hovercraft",
  bossName = "호버크래프트",
  terrain = "urban",
  jpSeasonIndex = 49,
}: {
  uid?: string;
  raidType?: string;
  seasonIndex?: number;
  bossUid?: string;
  bossName?: string;
  terrain?: string;
  jpSeasonIndex?: number;
} = {}) {
  return {
    uid,
    raidType,
    seasonIndex,
    region: "gl",
    terrain,
    startAt: "2026-04-01T03:00:00Z",
    endAt: "2026-04-08T03:00:00Z",
    attackType: null,
    raidBoss: { uid: bossUid, name: bossName },
    defenseTypeSets: [],
    jpSchedule: { uid: `jp_${raidType}_${jpSeasonIndex}`, seasonIndex: jpSeasonIndex, startAt: "2026-03-01T03:00:00Z" },
  };
}

function mockAllRaidSchedules(nodes: ReturnType<typeof raidScheduleNode>[]) {
  mockedRunQuery.mockResolvedValueOnce({
    data: { raidSchedules: { nodes } },
    error: undefined,
  } as Awaited<ReturnType<typeof runQuery>>);
}

function mockRaidSchedule(schedule: ReturnType<typeof raidScheduleNode>) {
  mockedRunQuery.mockResolvedValueOnce({
    data: { raidSchedule: schedule },
    error: undefined,
  } as Awaited<ReturnType<typeof runQuery>>);
}

describe("raid schedule lookup helpers", () => {
  it("finds a summary by internal raidType and seasonIndex from the cached schedule list", async () => {
    const env = createEnv();
    const schedule = raidScheduleNode();
    mockAllRaidSchedules([schedule]);

    await expect(findRaidScheduleSummaryByTypeAndSeason(env, "elimination", 42)).resolves.toMatchObject({
      uid: "gl_elimination_42",
      raidType: "elimination",
      seasonIndex: 42,
      raidBoss: { uid: "hovercraft", name: "호버크래프트" },
    });

    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      region: "gl",
      endAfter: null,
      raidType: null,
    });
  });

  it("resolves a schedule by internal raidType and seasonIndex via the matching summary uid", async () => {
    const env = createEnv();
    const summary = raidScheduleNode();
    const detail = raidScheduleNode({ ...summary, bossName: "상세 호버크래프트" });
    mockAllRaidSchedules([summary]);
    mockRaidSchedule(detail);

    await expect(getRaidScheduleByTypeAndSeason(env, "elimination", 42)).resolves.toMatchObject({
      uid: "gl_elimination_42",
      raidType: "elimination",
      raidBoss: { uid: "hovercraft", name: "상세 호버크래프트" },
    });

    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      uid: "gl_elimination_42",
    });
  });

  it("returns null when the matching season exists only for a different raidType", async () => {
    const env = createEnv();
    mockAllRaidSchedules([
      raidScheduleNode({
        uid: "gl_total_assault_42",
        raidType: "total_assault",
        bossUid: "binah",
        bossName: "비나",
        terrain: "outdoor",
      }),
    ]);

    await expect(getRaidScheduleByTypeAndSeason(env, "elimination", 42)).resolves.toBeNull();
    expect(runQuery).toHaveBeenCalledTimes(1);
  });

  it("picks the elimination schedule when total assault and elimination share the same seasonIndex", async () => {
    const env = createEnv();
    const totalAssaultSummary = raidScheduleNode({
      uid: "gl_total_assault_42",
      raidType: "total_assault",
      bossUid: "binah",
      bossName: "비나",
      terrain: "outdoor",
    });
    const eliminationSummary = raidScheduleNode();
    const eliminationDetail = raidScheduleNode({ bossName: "상세 호버크래프트" });
    mockAllRaidSchedules([totalAssaultSummary, eliminationSummary]);
    mockRaidSchedule(eliminationDetail);

    await expect(getRaidScheduleByTypeAndSeason(env, "elimination", 42)).resolves.toMatchObject({
      uid: "gl_elimination_42",
      raidType: "elimination",
      raidBoss: { uid: "hovercraft", name: "상세 호버크래프트" },
    });
    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      uid: "gl_elimination_42",
    });
  });
});
