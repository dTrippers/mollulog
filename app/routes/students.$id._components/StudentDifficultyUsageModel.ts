import type { Defense } from "~/graphql/graphql";
import { type UtcIsoString, getInstantTime } from "~/lib/date-time";
import type { StudentAnalysisResponse, StudentAnalysisScopeRequest } from "~/lib/ranks/student-analysis";
import type { RaidType } from "~/models/content.d";
import { ALL_TOTAL_ASSUALT_BOSS, type Boss, type Difficulty, timeToScore } from "~/models/raid";

export type StudentAnalysisSourceStat = {
  raid: {
    raidType: RaidType;
    jpSeasonIndex: number;
    boss: string;
    bossName?: string;
    startAt: UtcIsoString;
    defenseType: Defense;
    terrain?: string;
  };
};

export type StudentAnalysisScopePlan = {
  key: string;
  request: StudentAnalysisScopeRequest;
  difficulties: Difficulty[];
  bossName: string;
  environmentKey: string;
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
  defenseType: Defense;
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

export function buildStudentAnalysisScopePlans({
  statistics,
}: {
  statistics: StudentAnalysisSourceStat[];
}): StudentAnalysisScopePlan[] {
  const seenKeys = new Set<string>();

  return statistics
    .filter((stat) => {
      const startAt = getInstantTime(stat.raid.startAt);
      return !Number.isNaN(startAt);
    })
    .sort((a, b) => getInstantTime(b.raid.startAt) - getInstantTime(a.raid.startAt))
    .flatMap((stat) => {
      const boss = parseBoss(stat.raid.boss);
      if (!boss) {
        return [];
      }

      const key = getScopeKey({
        raidType: stat.raid.raidType,
        season: stat.raid.jpSeasonIndex,
        defenseType: stat.raid.defenseType,
      });
      if (seenKeys.has(key)) {
        return [];
      }
      seenKeys.add(key);

      const bandPlan = buildBandPlan(boss);
      if (!bandPlan) {
        return [];
      }

      return [
        {
          key,
          request: {
            raidType: stat.raid.raidType,
            season: stat.raid.jpSeasonIndex,
            defenseType: stat.raid.defenseType,
            bandBounds: bandPlan.bandBounds,
          },
          difficulties: bandPlan.difficulties,
          bossName: stat.raid.bossName ?? stat.raid.boss,
          environmentKey: getEnvironmentKey(stat.raid),
        },
      ];
    });
}

export function aggregateDifficultyUsage({
  response,
  scopePlans,
}: {
  response: StudentAnalysisResponse;
  scopePlans: StudentAnalysisScopePlan[];
}): StudentDifficultyUsage[] {
  const planByKey = new Map(scopePlans.map((plan) => [plan.key, plan]));
  const aggregate = new Map<Difficulty, { ownCount: number; assistCount: number; sampleSize: number }>();

  for (const scope of response.scopes) {
    if (!scope.loaded) {
      continue;
    }

    const plan = planByKey.get(getScopeKey(scope.raid));
    if (!plan) {
      continue;
    }

    const scopeUsageCount = scope.bands.reduce((sum, band) => sum + band.ownCount + band.assistCount, 0);
    const scopeSampleSize = scope.bands.reduce((sum, band) => sum + band.sampleSize, 0);
    if (scopeSampleSize === 0 || scopeUsageCount / scopeSampleSize < MIN_SCOPE_USAGE_RATE) {
      continue;
    }

    scope.bands.forEach((band, index) => {
      const difficulty = plan.difficulties[index];
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
  scopePlans,
}: {
  response: StudentAnalysisResponse;
  scopePlans: StudentAnalysisScopePlan[];
}): StudentBossUsageSummary {
  const planByKey = new Map(scopePlans.map((plan) => [plan.key, plan]));
  const aggregate = new Map<
    string,
    {
      bossName: string;
      defenseType: Defense;
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

    const plan = planByKey.get(getScopeKey(scope.raid));
    if (!plan) {
      continue;
    }

    const usageCount = scope.bands.reduce((sum, band) => sum + band.ownCount + band.assistCount, 0);
    const sampleSize = scope.bands.reduce((sum, band) => sum + band.sampleSize, 0);
    if (sampleSize === 0) {
      continue;
    }

    totalScopeCount += 1;
    if (usageCount > 0) {
      usedScopeCount += 1;
    }

    const current = aggregate.get(plan.environmentKey) ?? {
      bossName: plan.bossName,
      defenseType: plan.request.defenseType,
      usageCount: 0,
      sampleSize: 0,
    };
    current.usageCount += usageCount;
    current.sampleSize += sampleSize;
    aggregate.set(plan.environmentKey, current);
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
          defenseType: item.defenseType,
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

function buildBandPlan(boss: Boss): { difficulties: Difficulty[]; bandBounds: number[] } | null {
  const bands = DIFFICULTIES.flatMap((difficulty) => {
    try {
      return [{ difficulty, floorScore: timeToScore(boss, difficulty, 3600000) }];
    } catch {
      return [];
    }
  }).sort((a, b) => a.floorScore - b.floorScore);

  const topBand = bands.at(-1);
  if (!topBand) {
    return null;
  }

  const sentinel = timeToScore(boss, topBand.difficulty, 0) + 1;
  return {
    difficulties: bands.map((band) => band.difficulty),
    bandBounds: [...bands.map((band) => band.floorScore), sentinel],
  };
}

function parseBoss(boss: string): Boss | null {
  return ALL_TOTAL_ASSUALT_BOSS.includes(boss as Boss) ? (boss as Boss) : null;
}

function getScopeKey(scope: { raidType: RaidType; season: number; defenseType: Defense }) {
  return `${scope.raidType}:${scope.season}:${scope.defenseType}`;
}

function getEnvironmentKey(raid: { boss: string; terrain?: string; defenseType: Defense }) {
  return `${raid.boss}:${raid.terrain ?? "unknown"}:${raid.defenseType}`;
}
