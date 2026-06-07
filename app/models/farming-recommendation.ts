import {
  type AggregatedGrowthResourceRequirements,
  type StudentGrowthResourceRequirements,
  aggregateGrowthResourceRequirements,
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
};

export type FarmingStageRecommendation = {
  stage: FarmingStage;
  score: number;
  matches: FarmingRecommendationMatch[];
};

export type BuildFarmingRecommendationsOptions = {
  difficulty?: FarmingDifficultyFilter;
  dropMultiplier?: number;
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
  return stages
    .filter((stage) => matchesDifficultyFilter(stage, options.difficulty ?? "all"))
    .map((stage) => buildStageRecommendation(stage, farmingNeeded, multiplier))
    .filter((recommendation) => recommendation.score > 0)
    .sort(compareRecommendations);
}

function buildStageRecommendation(
  stage: FarmingStage,
  farmingNeeded: Record<string, number>,
  multiplier: number,
): FarmingStageRecommendation {
  const matches = stage.rewards
    .filter(isRepeatableEquipmentReward)
    .map((reward) => ({
      uid: reward.uid,
      name: reward.name,
      probability: reward.probability ?? 0,
      needed: farmingNeeded[reward.uid] ?? 0,
    }))
    .filter((match) => match.needed > 0);
  const score = matches.reduce((sum, match) => sum + match.needed * match.probability, 0) * multiplier;

  return { stage, score, matches };
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
  const scoreDelta = b.score - a.score;
  if (scoreDelta !== 0) return scoreDelta;

  const areaDelta = Number(a.stage.area) - Number(b.stage.area);
  if (areaDelta !== 0) return areaDelta;

  const stageNumberDelta = Number(a.stage.stageNumber) - Number(b.stage.stageNumber);
  if (stageNumberDelta !== 0) return stageNumberDelta;

  return a.stage.difficulty - b.stage.difficulty;
}
