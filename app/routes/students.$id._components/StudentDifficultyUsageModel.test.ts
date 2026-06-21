import { describe, expect, it, jest } from "@jest/globals";
import { Defense } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";
import type { StudentAnalysisResponse } from "~/lib/ranks/student-analysis";
import type { RaidType } from "~/models/content.d";
import { timeToScore } from "~/models/raid";
import {
  type StudentAnalysisSourceStat,
  aggregateBossUsage,
  aggregateDifficultyUsage,
  buildStudentAnalysisScopePlans,
} from "./StudentDifficultyUsageModel";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

function makeStat(overrides: {
  raidType?: RaidType;
  jpSeasonIndex: number;
  boss?: string;
  bossName?: string;
  startAt: UtcIsoString;
  defenseType?: Defense;
  terrain?: string;
}): StudentAnalysisSourceStat {
  return {
    raid: {
      raidType: overrides.raidType ?? "total_assault",
      jpSeasonIndex: overrides.jpSeasonIndex,
      boss: overrides.boss ?? "chesed",
      bossName: overrides.bossName,
      startAt: overrides.startAt,
      defenseType: overrides.defenseType ?? Defense.Heavy,
      terrain: overrides.terrain,
    },
  };
}

describe("buildStudentAnalysisScopePlans", () => {
  it("builds difficulty floor bounds with an upper sentinel for the top difficulty", () => {
    const [scope] = buildStudentAnalysisScopePlans({
      statistics: [
        makeStat({
          jpSeasonIndex: 31,
          boss: "chesed",
          startAt: "2026-01-01T00:00:00.000Z" as UtcIsoString,
        }),
      ],
    });

    expect(scope.difficulties).toEqual([
      "normal",
      "hard",
      "very_hard",
      "hardcore",
      "extreme",
      "insane",
      "torment",
      "lunatic",
    ]);
    expect(scope.request.bandBounds).toEqual([
      timeToScore("chesed", "normal", 3600000),
      timeToScore("chesed", "hard", 3600000),
      timeToScore("chesed", "very_hard", 3600000),
      timeToScore("chesed", "hardcore", 3600000),
      timeToScore("chesed", "extreme", 3600000),
      timeToScore("chesed", "insane", 3600000),
      timeToScore("chesed", "torment", 3600000),
      timeToScore("chesed", "lunatic", 3600000),
      timeToScore("chesed", "lunatic", 0) + 1,
    ]);
    expect(scope.request.bandBounds).toHaveLength(scope.difficulties.length + 1);
  });

  it("skips unhosted difficulties and invalid bosses", () => {
    const scopes = buildStudentAnalysisScopePlans({
      statistics: [
        makeStat({
          jpSeasonIndex: 32,
          boss: "binah",
          startAt: "2026-01-01T00:00:00.000Z" as UtcIsoString,
        }),
        makeStat({
          jpSeasonIndex: 33,
          boss: "unknown-boss",
          startAt: "2026-02-01T00:00:00.000Z" as UtcIsoString,
        }),
      ],
    });

    expect(scopes).toHaveLength(1);
    expect(scopes[0].difficulties).not.toContain("lunatic");
    expect(scopes[0].request.bandBounds.at(-1)).toBe(timeToScore("binah", "torment", 0) + 1);
  });

  it("sorts newest first, deduplicates keys, and keeps all valid scopes", () => {
    const statistics = [
      makeStat({
        jpSeasonIndex: 1,
        startAt: "2024-06-18T23:59:59.000Z" as UtcIsoString,
      }),
      makeStat({
        jpSeasonIndex: 2,
        startAt: "2024-06-19T00:00:00.000Z" as UtcIsoString,
      }),
      makeStat({
        jpSeasonIndex: 2,
        startAt: "2024-06-20T00:00:00.000Z" as UtcIsoString,
      }),
      makeStat({
        jpSeasonIndex: 99,
        startAt: "2026-09-22T00:00:00.000Z" as UtcIsoString,
      }),
      ...Array.from({ length: 30 }, (_, index) =>
        makeStat({
          jpSeasonIndex: 100 + index,
          startAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z` as UtcIsoString,
        }),
      ),
    ];

    const scopes = buildStudentAnalysisScopePlans({ statistics });

    expect(scopes).toHaveLength(33);
    expect(scopes.map((scope) => scope.request.season).slice(0, 3)).toEqual([99, 129, 128]);
    expect(scopes.some((scope) => scope.request.season === 1)).toBe(true);
    expect(scopes.filter((scope) => scope.request.season === 2)).toHaveLength(1);
  });
});

describe("aggregateDifficultyUsage", () => {
  it("maps response bands back to planned difficulties and aggregates by difficulty label", () => {
    const scopePlans = buildStudentAnalysisScopePlans({
      statistics: [
        makeStat({
          raidType: "total_assault",
          jpSeasonIndex: 31,
          boss: "chesed",
          startAt: "2026-01-01T00:00:00.000Z" as UtcIsoString,
          defenseType: Defense.Heavy,
        }),
        makeStat({
          raidType: "elimination",
          jpSeasonIndex: 14,
          boss: "binah",
          startAt: "2026-02-01T00:00:00.000Z" as UtcIsoString,
          defenseType: Defense.Light,
        }),
        makeStat({
          raidType: "total_assault",
          jpSeasonIndex: 15,
          boss: "chesed",
          startAt: "2026-03-01T00:00:00.000Z" as UtcIsoString,
          defenseType: Defense.Special,
        }),
      ],
    });
    const response: StudentAnalysisResponse = {
      totalEntries: 10,
      synergy: [],
      scopes: [
        {
          raid: { raidType: "total_assault", season: 31, defenseType: Defense.Heavy },
          loaded: true,
          bands: [
            { lo: 0, hi: 1, ownCount: 0, assistCount: 0, sampleSize: 100 },
            { lo: 1, hi: 2, ownCount: 0, assistCount: 0, sampleSize: 100 },
            { lo: 2, hi: 3, ownCount: 0, assistCount: 0, sampleSize: 100 },
            { lo: 3, hi: 4, ownCount: 0, assistCount: 0, sampleSize: 100 },
            { lo: 4, hi: 5, ownCount: 0, assistCount: 0, sampleSize: 100 },
            { lo: 5, hi: 6, ownCount: 30, assistCount: 10, sampleSize: 100 },
            { lo: 6, hi: 7, ownCount: 12, assistCount: 8, sampleSize: 80 },
            { lo: 7, hi: 0, ownCount: 5, assistCount: 5, sampleSize: 50 },
          ],
        },
        {
          raid: { raidType: "elimination", season: 14, defenseType: Defense.Light },
          loaded: true,
          bands: [
            { lo: 0, hi: 1, ownCount: 0, assistCount: 0, sampleSize: 90 },
            { lo: 1, hi: 2, ownCount: 0, assistCount: 0, sampleSize: 90 },
            { lo: 2, hi: 3, ownCount: 0, assistCount: 0, sampleSize: 90 },
            { lo: 3, hi: 4, ownCount: 0, assistCount: 0, sampleSize: 90 },
            { lo: 4, hi: 5, ownCount: 0, assistCount: 0, sampleSize: 90 },
            { lo: 5, hi: 6, ownCount: 10, assistCount: 10, sampleSize: 100 },
            { lo: 6, hi: 0, ownCount: 2, assistCount: 3, sampleSize: 0 },
          ],
        },
        {
          raid: { raidType: "total_assault", season: 15, defenseType: Defense.Special },
          loaded: true,
          bands: [
            { lo: 0, hi: 1, ownCount: 0, assistCount: 0, sampleSize: 1000 },
            { lo: 1, hi: 2, ownCount: 0, assistCount: 0, sampleSize: 1000 },
            { lo: 2, hi: 3, ownCount: 0, assistCount: 0, sampleSize: 1000 },
            { lo: 3, hi: 4, ownCount: 0, assistCount: 0, sampleSize: 1000 },
            { lo: 4, hi: 5, ownCount: 0, assistCount: 0, sampleSize: 1000 },
            { lo: 5, hi: 6, ownCount: 4, assistCount: 3, sampleSize: 1000 },
            { lo: 6, hi: 7, ownCount: 0, assistCount: 0, sampleSize: 1000 },
            { lo: 7, hi: 0, ownCount: 0, assistCount: 0, sampleSize: 1000 },
          ],
        },
        {
          raid: { raidType: "total_assault", season: 99, defenseType: Defense.Heavy },
          loaded: true,
          bands: [{ lo: 0, hi: 1, ownCount: 999, assistCount: 999, sampleSize: 999 }],
        },
        {
          raid: { raidType: "total_assault", season: 31, defenseType: Defense.Heavy },
          loaded: false,
          bands: [{ lo: 0, hi: 1, ownCount: 999, assistCount: 999, sampleSize: 999 }],
        },
      ],
    };

    const result = aggregateDifficultyUsage({ response, scopePlans });

    expect(result.map((item) => item.difficulty)).toEqual(["insane", "torment", "lunatic"]);
    expect(result.find((item) => item.difficulty === "insane")).toMatchObject({
      ownCount: 40,
      assistCount: 20,
      usageCount: 60,
      sampleSize: 200,
      usageRate: 0.3,
    });
    expect(result.find((item) => item.difficulty === "torment")).toMatchObject({
      ownCount: 14,
      assistCount: 11,
      usageCount: 25,
      sampleSize: 80,
      usageRate: 25 / 80,
    });
    expect(result.find((item) => item.difficulty === "lunatic")).toMatchObject({
      ownCount: 5,
      assistCount: 5,
      usageCount: 10,
      sampleSize: 50,
      usageRate: 0.2,
    });
  });
});

describe("aggregateBossUsage", () => {
  it("summarizes coverage and usage rate by boss environment", () => {
    const scopePlans = buildStudentAnalysisScopePlans({
      statistics: [
        makeStat({
          jpSeasonIndex: 31,
          boss: "chesed",
          bossName: "헤세드",
          terrain: "outdoor",
          startAt: "2026-01-01T00:00:00.000Z" as UtcIsoString,
          defenseType: Defense.Heavy,
        }),
        makeStat({
          jpSeasonIndex: 32,
          boss: "chesed",
          bossName: "헤세드",
          terrain: "outdoor",
          startAt: "2026-02-01T00:00:00.000Z" as UtcIsoString,
          defenseType: Defense.Heavy,
        }),
        makeStat({
          jpSeasonIndex: 33,
          boss: "binah",
          bossName: "비나",
          terrain: "indoor",
          startAt: "2026-03-01T00:00:00.000Z" as UtcIsoString,
          defenseType: Defense.Light,
        }),
      ],
    });
    const response: StudentAnalysisResponse = {
      totalEntries: 10,
      synergy: [],
      scopes: [
        {
          raid: { raidType: "total_assault", season: 31, defenseType: Defense.Heavy },
          loaded: true,
          bands: [{ lo: 0, hi: 1, ownCount: 80, assistCount: 30, sampleSize: 100 }],
        },
        {
          raid: { raidType: "total_assault", season: 32, defenseType: Defense.Heavy },
          loaded: true,
          bands: [{ lo: 0, hi: 1, ownCount: 40, assistCount: 0, sampleSize: 100 }],
        },
        {
          raid: { raidType: "total_assault", season: 33, defenseType: Defense.Light },
          loaded: true,
          bands: [{ lo: 0, hi: 1, ownCount: 0, assistCount: 0, sampleSize: 100 }],
        },
      ],
    };

    const result = aggregateBossUsage({ response, scopePlans });

    expect(result.totalScopeCount).toBe(3);
    expect(result.usedScopeCount).toBe(2);
    expect(result.rows).toEqual([
      {
        key: "chesed:outdoor:heavy",
        bossName: "헤세드",
        defenseType: Defense.Heavy,
        usageCount: 150,
        sampleSize: 200,
        usageRate: 0.75,
      },
    ]);
  });
});
