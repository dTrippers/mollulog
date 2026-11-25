import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { RaidRecordBatchRow } from "~/db/postgres/raid-records";
import type { RaidRecord } from "~/domain/raid-record";
import { Terrain } from "~/graphql/graphql";

const mockSaveBatch = jest.fn<(env: unknown, userId: number, rows: RaidRecordBatchRow[]) => Promise<void>>();
const mockApplyChartScore = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/db/postgres/raid-records", () => ({
  savePostgresRaidRecordsBatch: (...args: [unknown, number, RaidRecordBatchRow[]]) => mockSaveBatch(...args),
  applyPostgresRaidRecordChartScore: (...args: unknown[]) => mockApplyChartScore(...args),
}));
jest.mock("~/models/raid", () => ({ getAllRaidSchedules: jest.fn() }));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: jest.fn() }));
jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
  getStudentGrowthVisualsBatch: jest.fn(),
  getStudentWeaponAvailability: jest.fn(),
}));

import { InvalidRaidRecordError } from "~/domain/raid-record";
import { applyRaidRecordChartScore, type RaidRecordSeason, saveRaidRecordTable } from "~/models/raid-record";

const env = {} as Env;
const USER_ID = 7;

function season(
  seasonIndex: number,
  raidType: "total_assault" | "elimination" = "elimination",
  bossUid = "hod",
): RaidRecordSeason {
  return {
    server: "kr",
    raidType,
    seasonIndex,
    boss: { uid: bossUid, name: "호드" },
    terrain: Terrain.Indoor,
    startAt: "2026-11-03T02:00:00.000Z",
    endAt: "2026-11-09T19:00:00.000Z",
    displayDefenseTypes: [],
    scoreDefenseTypes:
      raidType === "elimination"
        ? [
            { defenseType: "heavy", maxDifficulty: "torment" },
            { defenseType: "elastic", maxDifficulty: "torment" },
          ]
        : [{ defenseType: "special", maxDifficulty: "torment" }],
    counterpartSeasonIndex: seasonIndex,
    rankConfirmAt: "2026-11-10T15:00:00.000Z",
  };
}

function record(overrides: Partial<RaidRecord>): RaidRecord {
  return {
    uid: "record-1",
    userId: USER_ID,
    server: "kr",
    raidType: "elimination",
    seasonIndex: 35,
    scoreMode: "defense_type",
    scores: [],
    totalScore: null,
    rank: 1200,
    rankRecordedAt: "2026-11-05T00:00:00.000Z",
    memo: "",
    parties: [],
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockSaveBatch.mockReset().mockResolvedValue(undefined);
  mockApplyChartScore.mockReset().mockResolvedValue({ kind: "deleted" });
});

describe("saveRaidRecordTable", () => {
  // The season's top difficulty in BAQL has been wrong for past seasons, so it does not reject a score.
  it("saves a score above the season's maximum as entered", async () => {
    await saveRaidRecordTable(env, USER_ID, [
      {
        season: season(35),
        current: null,
        scoreMode: "defense_type",
        totalScore: null,
        scores: [
          { defenseType: "heavy", score: 41_000_000 },
          { defenseType: "elastic", score: 42_000_000 },
        ],
        rank: 1,
      },
    ]);
    expect(mockSaveBatch.mock.calls[0][2][0].values.scores).toEqual([
      { defenseType: "heavy", score: 41_000_000 },
      { defenseType: "elastic", score: 42_000_000 },
    ]);
  });

  it("keeps a rank's time unless the rank changed", async () => {
    await saveRaidRecordTable(env, USER_ID, [
      // Only the score changed: the 잠정 rank keeps its time.
      {
        season: season(35),
        current: record({ uid: "kept" }),
        scoreMode: "defense_type",
        totalScore: null,
        scores: [{ defenseType: "heavy", score: 40_000_000 }],
        rank: 1200,
      },
      // The rank changed.
      {
        season: season(34),
        current: record({ uid: "changed" }),
        scoreMode: "defense_type",
        totalScore: null,
        scores: [{ defenseType: "heavy", score: 40_000_000 }],
        rank: 1100,
      },
      // A rank added to a score-only record.
      {
        season: season(33),
        current: record({ uid: "score-only", rank: null, rankRecordedAt: null }),
        scoreMode: "defense_type",
        totalScore: null,
        scores: [{ defenseType: "heavy", score: 40_000_000 }],
        rank: 900,
      },
      {
        season: season(32),
        current: null,
        scoreMode: "defense_type",
        scores: [{ defenseType: "heavy", score: 40_000_000 }],
        totalScore: null,
        rank: 800,
      },
    ]);

    const rows = mockSaveBatch.mock.calls[0][2];
    expect(rows.map((row) => row.current?.uid ?? null)).toEqual(["kept", "changed", "score-only", null]);
    expect(rows[0].values.rankRecordedAt).toBe("2026-11-05T00:00:00.000Z");
    for (const row of rows.slice(1)) {
      expect(row.values.rankRecordedAt).not.toBe("2026-11-05T00:00:00.000Z");
      expect(Date.parse(row.values.rankRecordedAt ?? "")).not.toBeNaN();
    }
    // The difficulty and clear time are not stored; screens compute them when they read the record.
    expect(rows[0].values.scores).toEqual([{ defenseType: "heavy", score: 40_000_000 }]);
    expect(rows[3].key).toEqual({ server: "kr", raidType: "elimination", seasonIndex: 32 });
  });

  it("saves a total shown alone with the scores it keeps", async () => {
    await saveRaidRecordTable(env, USER_ID, [
      {
        season: season(35),
        current: null,
        scoreMode: "total",
        scores: [{ defenseType: "heavy", score: 40_000_000 }],
        totalScore: 80_696_001,
        rank: 1200,
      },
    ]);
    expect(mockSaveBatch.mock.calls[0][2][0].values).toMatchObject({
      scoreMode: "total",
      scores: [{ defenseType: "heavy", score: 40_000_000 }],
      totalScore: 80_696_001,
    });
  });
});

describe("applyRaidRecordChartScore", () => {
  it("rejects a defense type the season does not score", async () => {
    await expect(applyRaidRecordChartScore(env, USER_ID, season(35), "light", 1)).rejects.toBeInstanceOf(
      InvalidRaidRecordError,
    );
    expect(mockApplyChartScore).not.toHaveBeenCalled();
  });

  it("saves a score, even one above the season's maximum", async () => {
    await applyRaidRecordChartScore(env, USER_ID, season(35), "elastic", 40_348_001);
    expect(mockApplyChartScore).toHaveBeenCalledWith(
      env,
      USER_ID,
      { server: "kr", raidType: "elimination", seasonIndex: 35 },
      { defenseType: "elastic", score: 40_348_001 },
      undefined,
    );
  });

  it("clears a score", async () => {
    await applyRaidRecordChartScore(env, USER_ID, season(35), "heavy", null);
    expect(mockApplyChartScore).toHaveBeenCalledWith(
      env,
      USER_ID,
      { server: "kr", raidType: "elimination", seasonIndex: 35 },
      { defenseType: "heavy", score: null },
      undefined,
    );
  });
});
