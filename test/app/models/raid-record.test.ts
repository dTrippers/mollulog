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
import {
  applyRaidRecordChartScore,
  type RaidRecordSeason,
  RaidRecordTableScoresAboveMaxError,
  saveRaidRecordTable,
} from "~/models/raid-record";

const env = {} as Env;
const USER_ID = 7;

// Hod is a 4-minute boss: torment tops out at 40,348,000 (cleared at once).
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
    scores: [],
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
  it("reports every score above its season maximum at once, newest season first, and saves nothing", async () => {
    const saving = saveRaidRecordTable(env, USER_ID, [
      {
        season: season(34),
        current: null,
        scores: [{ defenseType: "heavy", score: 43_000_000 }],
        rank: 1,
      },
      {
        season: season(35),
        current: null,
        scores: [
          { defenseType: "heavy", score: 41_000_000 },
          { defenseType: "elastic", score: 42_000_000 },
        ],
        rank: 1,
      },
    ]);

    const error = await saving.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RaidRecordTableScoresAboveMaxError);
    expect(
      (error as RaidRecordTableScoresAboveMaxError).rows.map((row) => [
        row.seasonIndex,
        row.error.defenseType,
        row.error.maxScore,
      ]),
    ).toEqual([
      [35, "heavy", 40_348_000],
      [35, "elastic", 40_348_000],
      [34, "heavy", 40_348_000],
    ]);
    expect((error as Error).message).toBe("이 시즌에서 달성할 수 있는 최대 점수(40,348,000)보다 높아요.");
    expect(mockSaveBatch).not.toHaveBeenCalled();
  });

  it("keeps a rank's time unless the rank changed", async () => {
    await saveRaidRecordTable(env, USER_ID, [
      // Only the score changed: the 잠정 rank keeps its time.
      {
        season: season(35),
        current: record({ uid: "kept" }),
        scores: [{ defenseType: "heavy", score: 40_000_000 }],
        rank: 1200,
      },
      // The rank changed.
      {
        season: season(34),
        current: record({ uid: "changed" }),
        scores: [{ defenseType: "heavy", score: 40_000_000 }],
        rank: 1100,
      },
      // A rank added to a score-only record.
      {
        season: season(33),
        current: record({ uid: "score-only", rank: null, rankRecordedAt: null }),
        scores: [{ defenseType: "heavy", score: 40_000_000 }],
        rank: 900,
      },
      { season: season(32), current: null, scores: [{ defenseType: "heavy", score: 40_000_000 }], rank: 800 },
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

  it("does not check the maximum for a boss the score formula does not know", async () => {
    await saveRaidRecordTable(env, USER_ID, [
      {
        season: season(91, "total_assault", "a-new-boss"),
        current: null,
        scores: [{ defenseType: "special", score: 99_000_000 }],
        rank: 1,
      },
    ]);
    expect(mockSaveBatch.mock.calls[0][2][0].values.scores).toEqual([{ defenseType: "special", score: 99_000_000 }]);
  });
});

describe("applyRaidRecordChartScore", () => {
  it("rejects a defense type the season does not score", async () => {
    await expect(applyRaidRecordChartScore(env, USER_ID, season(35), "light", 1)).rejects.toBeInstanceOf(
      InvalidRaidRecordError,
    );
    expect(mockApplyChartScore).not.toHaveBeenCalled();
  });

  it("saves a score, and rejects one above the maximum", async () => {
    await applyRaidRecordChartScore(env, USER_ID, season(35), "elastic", 40_000_000);
    expect(mockApplyChartScore).toHaveBeenCalledWith(
      env,
      USER_ID,
      { server: "kr", raidType: "elimination", seasonIndex: 35 },
      { defenseType: "elastic", score: 40_000_000 },
      undefined,
    );

    await expect(applyRaidRecordChartScore(env, USER_ID, season(35), "elastic", 40_348_001)).rejects.toThrow(
      "이 시즌에서 달성할 수 있는 최대 점수(40,348,000)보다 높아요.",
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
