import type { Defense } from "~/graphql/graphql";
import type { StudentAnalysisResponse, StudentAnalysisScopeRequest } from "~/lib/ranks/student-analysis";
import { getInstantTime, type UtcIsoString } from "~/lib/date-time";
import type { RaidType } from "~/models/content.d";
import { ALL_TOTAL_ASSUALT_BOSS, type Boss, type Difficulty, timeToScore } from "~/models/raid";

export type StudentAnalysisSourceStat = {
  raid: {
    raidType: RaidType;
    jpSeasonIndex: number;
    boss: string;
    startAt: UtcIsoString;
    defenseType: Defense;
  };
};

export type StudentAnalysisScopePlan = {
  key: string;
  request: StudentAnalysisScopeRequest;
  difficulties: Difficulty[];
};

export type StudentDifficultyUsage = {
  difficulty: Difficulty;
  ownCount: number;
  assistCount: number;
  sampleSize: number;
  usageRate: number;
  ownRate: number;
  assistRate: number;
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

const MAX_SCOPES = 24;

export function buildStudentAnalysisScopePlans({
  statistics,
  asOf = new Date(),
}: {
  statistics: StudentAnalysisSourceStat[];
  asOf?: Date;
}): StudentAnalysisScopePlan[] {
  const since = getTwoYearsAgo(asOf).getTime();
  const until = asOf.getTime();
  const seenKeys = new Set<string>();

  return statistics
    .filter((stat) => {
      const startAt = getInstantTime(stat.raid.startAt);
      return !Number.isNaN(startAt) && startAt >= since && startAt <= until;
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
        },
      ];
    })
    .slice(0, MAX_SCOPES);
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
    if (!item || (item.ownCount + item.assistCount === 0 && item.sampleSize === 0)) {
      return [];
    }

    const usageCount = item.ownCount + item.assistCount;
    const usageRate = item.sampleSize > 0 ? usageCount / item.sampleSize : 0;
    return [
      {
        difficulty,
        ownCount: item.ownCount,
        assistCount: item.assistCount,
        sampleSize: item.sampleSize,
        usageRate,
        ownRate: item.sampleSize > 0 ? item.ownCount / item.sampleSize : 0,
        assistRate: item.sampleSize > 0 ? item.assistCount / item.sampleSize : 0,
      },
    ];
  });
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

function getTwoYearsAgo(asOf: Date) {
  const since = new Date(asOf.getTime());
  since.setUTCFullYear(since.getUTCFullYear() - 2);
  return since;
}
