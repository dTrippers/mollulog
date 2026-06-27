import { describe, expect, it } from "@jest/globals";
import { Defense } from "~/graphql/graphql";
import type { StudentAnalysisResponse } from "~/lib/ranks/student-analysis";
import type { RaidType, Terrain } from "~/models/content.d";
import {
  type StudentAnalysisScopeMetadata,
  aggregateBossUsage,
  aggregateDifficultyUsage,
  buildStudentAnalysisScopeLookup,
  getStudentAnalysisEnvironmentKey,
  getStudentAnalysisScopeKey,
} from "~/routes/students.$id._components/StudentDifficultyUsageModel";

function makeScopeMetadata(overrides: {
  raidType?: RaidType;
  jpSeasonIndex: number;
  boss?: string;
  bossName: string;
  defenseType?: Defense;
  defenseTypes?: Defense[];
  terrain?: Terrain;
}): [string, StudentAnalysisScopeMetadata] {
  const boss = overrides.boss ?? "chesed";
  const terrain = overrides.terrain ?? "outdoor";
  const defenseType = overrides.defenseType ?? Defense.Heavy;
  const defenseTypes = overrides.defenseTypes ?? [defenseType];

  return [
    getStudentAnalysisScopeKey({
      raidType: overrides.raidType ?? "total_assault",
      season: overrides.jpSeasonIndex,
      defenseType,
    }),
    {
      bossName: overrides.bossName,
      terrain,
      defenseType,
      defenseTypes,
      environmentKey: getStudentAnalysisEnvironmentKey({ boss, terrain, defenseType }),
    },
  ];
}

describe("buildStudentAnalysisScopeLookup", () => {
  it("maps server scope keys from all raid metadata without date-based filtering", () => {
    const result = buildStudentAnalysisScopeLookup({
      allRaids: [
        {
          raidType: "total_assault",
          terrain: "outdoor",
          raidBoss: { uid: "goz", name: "고즈" },
          jpSchedule: { seasonIndex: 87 },
          defenseTypeSets: [{ primaryDefenseType: Defense.Special, defenseTypes: [Defense.Special] }],
        },
        {
          raidType: "elimination",
          terrain: "street",
          raidBoss: { uid: "hieronymus", name: "예로니무스" },
          jpSchedule: { seasonIndex: 31 },
          defenseTypeSets: [
            { primaryDefenseType: Defense.Heavy, defenseTypes: [Defense.Heavy] },
            { primaryDefenseType: Defense.Special, defenseTypes: [Defense.Special, Defense.Light] },
          ],
        },
        {
          raidType: "allied",
          terrain: "indoor",
          raidBoss: { uid: "binah", name: "비나" },
          jpSchedule: { seasonIndex: 1 },
          defenseTypeSets: [{ primaryDefenseType: Defense.Heavy, defenseTypes: [Defense.Heavy] }],
        },
      ],
    });

    expect(
      result.get(getStudentAnalysisScopeKey({ raidType: "total_assault", season: 87, defenseType: Defense.Special })),
    ).toMatchObject({
      bossName: "고즈",
      terrain: "outdoor",
      defenseType: Defense.Special,
      defenseTypes: [Defense.Special],
      environmentKey: "goz:outdoor:special",
    });
    expect(
      result.get(getStudentAnalysisScopeKey({ raidType: "elimination", season: 31, defenseType: Defense.Special })),
    ).toMatchObject({
      bossName: "예로니무스",
      terrain: "street",
      defenseType: Defense.Special,
      defenseTypes: [Defense.Special, Defense.Light],
      environmentKey: "hieronymus:street:special",
    });
    expect(result.has(getStudentAnalysisScopeKey({ raidType: "allied", season: 1, defenseType: Defense.Heavy }))).toBe(
      false,
    );
  });
});

describe("aggregateDifficultyUsage", () => {
  it("maps response bands by index and aggregates by difficulty label", () => {
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
          raid: { raidType: "total_assault", season: 31, defenseType: Defense.Heavy },
          loaded: false,
          bands: [{ lo: 0, hi: 1, ownCount: 999, assistCount: 999, sampleSize: 999 }],
        },
      ],
    };

    const result = aggregateDifficultyUsage({ response });

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
    const scopeLookup = new Map([
      makeScopeMetadata({
        jpSeasonIndex: 31,
        boss: "chesed",
        bossName: "헤세드",
        terrain: "outdoor",
        defenseType: Defense.Heavy,
        defenseTypes: [Defense.Heavy],
      }),
      makeScopeMetadata({
        jpSeasonIndex: 32,
        boss: "chesed",
        bossName: "헤세드",
        terrain: "outdoor",
        defenseType: Defense.Heavy,
        defenseTypes: [Defense.Heavy],
      }),
      makeScopeMetadata({
        jpSeasonIndex: 33,
        boss: "binah",
        bossName: "비나",
        terrain: "indoor",
        defenseType: Defense.Light,
        defenseTypes: [Defense.Light, Defense.Special],
      }),
    ]);
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

    const result = aggregateBossUsage({ response, scopeLookup });

    expect(result.totalScopeCount).toBe(3);
    expect(result.usedScopeCount).toBe(2);
    expect(result.rows).toEqual([
      {
        key: "chesed:outdoor:heavy",
        bossName: "헤세드",
        terrain: "outdoor",
        defenseType: Defense.Heavy,
        defenseTypes: [Defense.Heavy],
        usageCount: 150,
        sampleSize: 200,
        usageRate: 0.75,
      },
    ]);
  });
});
