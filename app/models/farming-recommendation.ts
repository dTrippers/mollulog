import {
  type AggregatedGrowthResourceRequirements,
  type StudentGrowthResourceRequirements,
  aggregateGrowthResourceRequirements,
  getEquipmentTier,
  getEquipmentTypeKey,
} from "./growth-resource";

export type FarmingDifficultyFilter = "all" | "normal" | "hard";

export type FarmingStageReward = {
  uid: string;
  name?: string;
  rewardType: string;
  rewardTag?: string | null;
  probability?: number | null;
};

export type FarmingStage = {
  uid: string;
  name: string;
  stageNumber: string;
  area: string;
  difficulty: number;
  apCost: number;
  rewards: FarmingStageReward[];
};

export type FarmingRequirement = {
  uid: string;
  required: number;
  owned: number;
  needed: number;
};

export type FarmingRecommendationMatch = {
  uid: string;
  name?: string;
  probability: number;
  needed: number;
  score: number;
};

export type FarmingRecommendationDrop = {
  uid: string;
  name?: string;
  probability: number;
  needed: number;
  score: number;
};

export type FarmingStageRecommendation = {
  stage: FarmingStage;
  score: number;
  spreadsheetScore: number;
  estimatedAp: number | null;
  matches: FarmingRecommendationMatch[];
  drops: FarmingRecommendationDrop[];
};

export type BuildFarmingRecommendationsOptions = {
  difficulty?: FarmingDifficultyFilter;
  dropMultiplier?: number;
  prioritizeHighTier?: boolean;
};

const EXPERT_PERMIT_COST_PER_BLUEPRINT_BY_TIER: Record<number, number> = {
  2: 300 / 15,
  3: 480 / 20,
  4: 840 / 30,
  5: 1260 / 35,
  6: 1600 / 40,
  7: 2000 / 45,
  8: 2400 / 50,
  9: 2800 / 55,
  // T10 설계도는 숙련 증서 상점에서 구매할 수 없어 파밍 희소성을 크게 반영합니다.
  10: 1000,
};

export function buildEquipmentFarmingNeeded(
  requirements: StudentGrowthResourceRequirements[] | AggregatedGrowthResourceRequirements,
  ownedQuantities: Record<string, number>,
): Record<string, number> {
  const aggregated = Array.isArray(requirements) ? aggregateGrowthResourceRequirements(requirements) : requirements;
  return aggregated.items
    .filter((item) => item.source === "equipment" && getEquipmentTypeKey(item.uid) !== null)
    .reduce<Record<string, number>>((acc, item) => {
      const needed = Math.max(0, item.amount - (ownedQuantities[item.uid] ?? 0));
      if (needed > 0) {
        acc[item.uid] = needed;
      }
      return acc;
    }, {});
}

export function buildEquipmentFarmingRequirements(
  requirements: StudentGrowthResourceRequirements[] | AggregatedGrowthResourceRequirements,
  ownedQuantities: Record<string, number>,
): FarmingRequirement[] {
  const aggregated = Array.isArray(requirements) ? aggregateGrowthResourceRequirements(requirements) : requirements;
  return aggregated.items
    .filter((item) => item.source === "equipment" && getEquipmentTypeKey(item.uid) !== null)
    .map((item) => ({
      uid: item.uid,
      required: item.amount,
      owned: ownedQuantities[item.uid] ?? 0,
      needed: Math.max(0, item.amount - (ownedQuantities[item.uid] ?? 0)),
    }))
    .filter((requirement) => requirement.needed > 0)
    .sort((a, b) => Number(a.uid) - Number(b.uid));
}

export function buildFarmingRecommendations(
  farmingNeeded: Record<string, number>,
  stages: FarmingStage[],
  options: BuildFarmingRecommendationsOptions = {},
): FarmingStageRecommendation[] {
  const multiplier = normalizeDropMultiplier(options.dropMultiplier);
  const prioritizeHighTier = options.prioritizeHighTier ?? false;
  return stages
    .filter((stage) => matchesDifficultyFilter(stage, options.difficulty ?? "all"))
    .map((stage) => buildStageRecommendation(stage, farmingNeeded, multiplier, prioritizeHighTier))
    .filter((recommendation) => recommendation.score > 0)
    .sort(compareRecommendations);
}

function isRepeatableEquipmentReward(
  reward: FarmingStageReward,
): reward is FarmingStageReward & { probability: number } {
  return reward.rewardType === "equipment" && reward.rewardTag == null && reward.probability != null;
}

function matchesDifficultyFilter(stage: FarmingStage, difficulty: FarmingDifficultyFilter): boolean {
  if (difficulty === "normal") return stage.difficulty === 0;
  if (difficulty === "hard") return stage.difficulty === 1;
  return true;
}

function normalizeDropMultiplier(multiplier: number | undefined): number {
  if (multiplier == null || !Number.isFinite(multiplier) || multiplier <= 0) {
    return 1;
  }

  return multiplier;
}

function compareRecommendations(a: FarmingStageRecommendation, b: FarmingStageRecommendation): number {
  const spreadsheetScoreDelta = b.spreadsheetScore - a.spreadsheetScore;
  if (Math.abs(spreadsheetScoreDelta) > 0.0001) return spreadsheetScoreDelta;

  const areaDelta = Number(b.stage.area) - Number(a.stage.area);
  if (areaDelta !== 0) return areaDelta;

  const stageNumberDelta = Number(b.stage.stageNumber) - Number(a.stage.stageNumber);
  if (stageNumberDelta !== 0) return stageNumberDelta;

  return a.stage.difficulty - b.stage.difficulty;
}

type StageExpectedDrop = {
  uid: string;
  name?: string;
  probability: number;
  expectedPerRun: number;
};

function buildStageRecommendation(
  stage: FarmingStage,
  farmingNeeded: Record<string, number>,
  multiplier: number,
  prioritizeHighTier: boolean,
): FarmingStageRecommendation {
  const drops = getRepeatableEquipmentDrops(stage, multiplier)
    .map((drop) => {
      const needed = farmingNeeded[drop.uid] ?? 0;
      return {
        uid: drop.uid,
        name: drop.name,
        probability: drop.probability,
        needed,
        score: needed * drop.expectedPerRun,
      };
    })
    .sort(compareDrops);
  const matches = drops.filter((drop) => drop.needed > 0);
  const score = matches.reduce((sum, match) => sum + match.score, 0);
  const spreadsheetScoreWeights = calculateSpreadsheetScoreWeights(drops, prioritizeHighTier);
  const spreadsheetExpectedDropWeights = calculateSpreadsheetExpectedDropWeights(stage, drops);

  return {
    stage,
    score,
    spreadsheetScore: calculateSpreadsheetScore(stage, matches, spreadsheetScoreWeights),
    estimatedAp: calculateEstimatedAp(stage, matches, spreadsheetExpectedDropWeights),
    matches,
    drops,
  };
}

function getRepeatableEquipmentDrops(stage: FarmingStage, multiplier: number): StageExpectedDrop[] {
  const dropsByUid = new Map<string, StageExpectedDrop>();
  for (const reward of stage.rewards.filter(isRepeatableEquipmentReward)) {
    if (getEquipmentTypeKey(reward.uid) === null) {
      continue;
    }

    const probability = normalizeProbability(reward.probability);
    if (probability <= 0) {
      continue;
    }

    const previous = dropsByUid.get(reward.uid);
    dropsByUid.set(reward.uid, {
      uid: reward.uid,
      name: reward.name ?? previous?.name,
      probability: previous ? previous.probability + probability : probability,
      expectedPerRun: (previous?.expectedPerRun ?? 0) + probability * multiplier,
    });
  }

  return Array.from(dropsByUid.values());
}

function calculateSpreadsheetScore(
  stage: FarmingStage,
  matches: FarmingRecommendationMatch[],
  spreadsheetWeights: Map<string, number>,
): number {
  const hardStageBonus = stage.difficulty === 1 ? 1 : 0;
  const score = matches.reduce((sum, match) => sum + match.needed * (spreadsheetWeights.get(match.uid) ?? 0), 0);
  return score > 0 ? score + hardStageBonus : 0;
}

function calculateEstimatedAp(
  stage: FarmingStage,
  matches: FarmingRecommendationMatch[],
  spreadsheetWeights: Map<string, number>,
): number | null {
  const estimatedRuns = matches
    .map((match) => {
      const expectedPerRun = (spreadsheetWeights.get(match.uid) ?? 0) / 1000;
      return expectedPerRun > 0 ? match.needed / expectedPerRun : null;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (estimatedRuns.length === 0) {
    return null;
  }

  return Math.min(...estimatedRuns) * stage.apCost;
}

function calculateSpreadsheetScoreWeights(
  drops: FarmingRecommendationDrop[],
  prioritizeHighTier: boolean,
): Map<string, number> {
  const groups = groupDropsByEquipmentType(drops);
  const primaryTypeKey = getPrimaryDropTypeKey(groups);
  const weights = new Map<string, number>();

  for (const group of groups) {
    const isPrimaryType = group.typeKey === primaryTypeKey;
    group.drops.forEach((drop, index) => {
      weights.set(drop.uid, getSpreadsheetScoreWeight(drop.uid, isPrimaryType, index, prioritizeHighTier));
    });
  }

  return weights;
}

function calculateSpreadsheetExpectedDropWeights(
  stage: FarmingStage,
  drops: FarmingRecommendationDrop[],
): Map<string, number> {
  const groups = groupDropsByEquipmentType(drops);
  const primaryTypeKey = getPrimaryDropTypeKey(groups);
  const weights = new Map<string, number>();

  for (const group of groups) {
    const isPrimaryType = group.typeKey === primaryTypeKey;
    group.drops.forEach((drop, index) => {
      weights.set(drop.uid, getSpreadsheetExpectedDropWeight(stage, isPrimaryType, index));
    });
  }

  return weights;
}

type EquipmentDropGroup = {
  typeKey: string;
  drops: FarmingRecommendationDrop[];
};

function groupDropsByEquipmentType(drops: FarmingRecommendationDrop[]): EquipmentDropGroup[] {
  const groups = new Map<string, FarmingRecommendationDrop[]>();

  for (const drop of drops) {
    const typeKey = getEquipmentTypeKey(drop.uid);
    if (!typeKey) {
      continue;
    }

    groups.set(typeKey, [...(groups.get(typeKey) ?? []), drop]);
  }

  return Array.from(groups.entries()).map(([typeKey, groupDrops]) => ({
    typeKey,
    drops: groupDrops.sort(compareDrops),
  }));
}

function getPrimaryDropTypeKey(groups: EquipmentDropGroup[]): string | null {
  return (
    groups
      .map((group) => ({ typeKey: group.typeKey, probability: group.drops[0]?.probability ?? 0 }))
      .sort((a, b) => b.probability - a.probability)[0]?.typeKey ?? null
  );
}

function getSpreadsheetScoreWeight(
  uid: string,
  isPrimaryType: boolean,
  dropIndex: number,
  prioritizeHighTier: boolean,
): number {
  const weights = isPrimaryType ? [344, 200, 100] : [258, 150, 75];
  const tierWeight = prioritizeHighTier ? getExpertPermitCostPerBlueprint(uid) : 1;
  return (weights[dropIndex] ?? 0) * tierWeight;
}

function getSpreadsheetExpectedDropWeight(stage: FarmingStage, isPrimaryType: boolean, dropIndex: number): number {
  if (dropIndex === 0) {
    return getSpreadsheetTopTierExpectedDropWeight(stage, isPrimaryType);
  }

  const lowerTierWeights = isPrimaryType ? [200, 100] : [150, 75];
  return lowerTierWeights[dropIndex - 1] ?? 0;
}

function getSpreadsheetTopTierExpectedDropWeight(stage: FarmingStage, isPrimaryType: boolean): number {
  const area = Number(stage.area);
  if (area >= 16) return isPrimaryType ? 344 : 258;
  if (area >= 13) return isPrimaryType ? 600 : 450;
  if (area >= 10) return isPrimaryType ? 800 : 600;
  if (area >= 7) return isPrimaryType ? 1000 : 750;
  return isPrimaryType ? 1200 : 900;
}

function getExpertPermitCostPerBlueprint(uid: string): number {
  const tier = getEquipmentTier(uid);
  return EXPERT_PERMIT_COST_PER_BLUEPRINT_BY_TIER[tier] ?? 1;
}

function normalizeProbability(probability: number | null | undefined): number {
  if (probability == null || !Number.isFinite(probability) || probability <= 0) {
    return 0;
  }
  if (probability <= 1) {
    return probability;
  }
  if (probability <= 100) {
    return probability / 100;
  }
  return probability / 10000;
}

function compareDrops(a: FarmingRecommendationDrop, b: FarmingRecommendationDrop): number {
  const tierDelta = getEquipmentTier(b.uid) - getEquipmentTier(a.uid);
  if (tierDelta !== 0) return tierDelta;

  return Number(a.uid) - Number(b.uid);
}
