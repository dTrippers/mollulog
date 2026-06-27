import type { Defense } from "~/graphql/graphql";
import type { StudentAnalysisResponse } from "~/lib/ranks/student-analysis";
import type { RaidType, Terrain } from "~/models/content.d";
import type { Difficulty } from "~/domain/raid-score";

export type StudentAnalysisScopeMetadata = {
  bossName: string;
  terrain: Terrain;
  defenseType: Defense;
  defenseTypes: Defense[];
  environmentKey: string;
};

export type StudentAnalysisScopeLookup = Map<string, StudentAnalysisScopeMetadata>;

export type StudentAnalysisRaidMetadataSource = {
  raidType: string;
  terrain: string;
  raidBoss: {
    uid: string;
    name: string;
  };
  jpSchedule: {
    seasonIndex: number;
  } | null;
  defenseTypeSets: {
    primaryDefenseType: Defense;
    defenseTypes: Defense[];
  }[];
};

export type StudentDifficultyUsage = {
  difficulty: Difficulty;
  ownCount: number;
  assistCount: number;
  usageCount: number;
  sampleSize: number;
  usageRate: number;
};

export type StudentBossUsage = {
  key: string;
  bossName: string;
  terrain: Terrain;
  defenseType: Defense;
  defenseTypes: Defense[];
  usageCount: number;
  sampleSize: number;
  usageRate: number;
};

export type StudentBossUsageSummary = {
  totalScopeCount: number;
  usedScopeCount: number;
  rows: StudentBossUsage[];
};

const DIFFICULTIES: Difficulty[] = [
  "normal",
  "hard",
  "very_hard",
  "hardcore",
  "extreme",
  "insane",
  "torment",
  "lunatic",
];

const MIN_SCOPE_USAGE_RATE = 0.01;

export function buildStudentAnalysisScopeLookup({
  allRaids,
}: {
  allRaids: StudentAnalysisRaidMetadataSource[];
}): StudentAnalysisScopeLookup {
  const lookup = new Map<string, StudentAnalysisScopeMetadata>();

  for (const raid of allRaids) {
    if (raid.raidType !== "total_assault" && raid.raidType !== "elimination") {
      continue;
    }
    const jpSchedule = raid.jpSchedule;
    if (!jpSchedule) {
      continue;
    }

    for (const { primaryDefenseType, defenseTypes } of raid.defenseTypeSets) {
      const defenseType = primaryDefenseType;
      const key = getStudentAnalysisScopeKey({
        raidType: raid.raidType as RaidType,
        season: jpSchedule.seasonIndex,
        defenseType,
      });
      if (lookup.has(key)) {
        continue;
      }

      lookup.set(key, {
        bossName: raid.raidBoss.name,
        terrain: raid.terrain as Terrain,
        defenseType,
        defenseTypes: defenseTypes.length > 0 ? [...defenseTypes] : [defenseType],
        environmentKey: getStudentAnalysisEnvironmentKey({
          boss: raid.raidBoss.uid,
          terrain: raid.terrain as Terrain,
          defenseType,
        }),
      });
    }
  }

  return lookup;
}

export function aggregateDifficultyUsage({
  response,
}: {
  response: StudentAnalysisResponse;
}): StudentDifficultyUsage[] {
  const aggregate = new Map<Difficulty, { ownCount: number; assistCount: number; sampleSize: number }>();

  for (const scope of response.scopes) {
    if (!scope.loaded) {
      continue;
    }

    const scopeUsageCount = scope.bands.reduce((sum, band) => sum + band.ownCount + band.assistCount, 0);
    const scopeSampleSize = scope.bands.reduce((sum, band) => sum + band.sampleSize, 0);
    if (scopeSampleSize === 0 || scopeUsageCount / scopeSampleSize < MIN_SCOPE_USAGE_RATE) {
      continue;
    }

    scope.bands.forEach((band, index) => {
      const difficulty = DIFFICULTIES[index];
      if (!difficulty) {
        return;
      }

      const current = aggregate.get(difficulty) ?? { ownCount: 0, assistCount: 0, sampleSize: 0 };
      current.ownCount += band.ownCount;
      current.assistCount += band.assistCount;
      current.sampleSize += band.sampleSize;
      aggregate.set(difficulty, current);
    });
  }

  return DIFFICULTIES.flatMap((difficulty) => {
    const item = aggregate.get(difficulty);
    if (!item) {
      return [];
    }

    const usageCount = item.ownCount + item.assistCount;
    if (usageCount === 0) {
      return [];
    }

    return [
      {
        difficulty,
        ownCount: item.ownCount,
        assistCount: item.assistCount,
        usageCount,
        sampleSize: item.sampleSize,
        usageRate: item.sampleSize > 0 ? usageCount / item.sampleSize : 0,
      },
    ];
  });
}

export function aggregateBossUsage({
  response,
  scopeLookup,
}: {
  response: StudentAnalysisResponse;
  scopeLookup: StudentAnalysisScopeLookup;
}): StudentBossUsageSummary {
  const aggregate = new Map<
    string,
    {
      bossName: string;
      terrain: Terrain;
      defenseType: Defense;
      defenseTypes: Defense[];
      usageCount: number;
      sampleSize: number;
    }
  >();
  let totalScopeCount = 0;
  let usedScopeCount = 0;

  for (const scope of response.scopes) {
    if (!scope.loaded) {
      continue;
    }

    const metadata = scopeLookup.get(getStudentAnalysisScopeKey(scope.raid));
    if (!metadata) {
      continue;
    }

    const usageCount = scope.bands.reduce((sum, band) => sum + band.ownCount + band.assistCount, 0);
    const sampleSize = scope.bands.reduce((sum, band) => sum + band.sampleSize, 0);
    if (sampleSize === 0) {
      continue;
    }

    const usageRate = usageCount / sampleSize;
    totalScopeCount += 1;
    if (usageRate >= MIN_SCOPE_USAGE_RATE) {
      usedScopeCount += 1;
    }

    if (usageRate < MIN_SCOPE_USAGE_RATE) {
      continue;
    }

    const current = aggregate.get(metadata.environmentKey) ?? {
      bossName: metadata.bossName,
      terrain: metadata.terrain,
      defenseType: metadata.defenseType,
      defenseTypes: metadata.defenseTypes,
      usageCount: 0,
      sampleSize: 0,
    };
    current.usageCount += usageCount;
    current.sampleSize += sampleSize;
    aggregate.set(metadata.environmentKey, current);
  }

  const rows = Array.from(aggregate.entries())
    .flatMap(([key, item]) => {
      if (item.usageCount === 0) {
        return [];
      }

      return [
        {
          key,
          bossName: item.bossName,
          terrain: item.terrain,
          defenseType: item.defenseType,
          defenseTypes: item.defenseTypes,
          usageCount: item.usageCount,
          sampleSize: item.sampleSize,
          usageRate: item.usageCount / item.sampleSize,
        },
      ];
    })
    .sort((a, b) => b.usageRate - a.usageRate || b.usageCount - a.usageCount);

  return {
    totalScopeCount,
    usedScopeCount,
    rows,
  };
}

export function getStudentAnalysisScopeKey(scope: { raidType: RaidType; season: number; defenseType: Defense }) {
  return `${scope.raidType}:${scope.season}:${scope.defenseType}`;
}

export function getStudentAnalysisEnvironmentKey(raid: { boss: string; terrain: Terrain; defenseType: Defense }) {
  return `${raid.boss}:${raid.terrain}:${raid.defenseType}`;
}
