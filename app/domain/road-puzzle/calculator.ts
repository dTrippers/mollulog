import type { MinigamePaymentQuantityMode, RewardItem, RoadPuzzleConfig, RoadPuzzleRound } from "~/domain/event-shop";
import type { RoadPuzzleSolution } from "./solver";

export type RoadPuzzleRoundEstimate = {
  minimum: number;
  expected: number;
  maximum: number;
};

export type RoadPuzzleRoundRow = {
  round: number;
  isLoop: boolean;
  loopCount: number;
  selected: boolean;
  estimate: RoadPuzzleRoundEstimate | null;
  completionRewards: RewardItem[];
  pathRewards: RewardItem[];
};

function roundForNumber(config: RoadPuzzleConfig, roundNumber: number): RoadPuzzleRound | undefined {
  return (
    config.rounds.find((round) => round.round === roundNumber) ??
    config.rounds.find((round) => round.isLoop && roundNumber >= round.round)
  );
}

function estimateForRound(
  config: RoadPuzzleConfig,
  round: RoadPuzzleRound,
  solutionsByUid: Readonly<Record<string, RoadPuzzleSolution | null | undefined>>,
  paymentQuantity: number,
): RoadPuzzleRoundEstimate | null {
  const mapSolutions = round.mapUids.map((uid) => solutionsByUid[uid]);
  if (mapSolutions.some((solution) => solution === undefined || solution === null)) return null;
  const minimum = mapSolutions.map((solution) => solution!.minimumTiles * paymentQuantity);
  const expected = mapSolutions.map((solution) => solution!.expectedTiles * paymentQuantity);
  const maximum = mapSolutions.map((solution) => solution!.maximumTiles * paymentQuantity);
  return {
    minimum: Math.min(...minimum),
    expected: Math.round(expected.reduce((total, value) => total + value, 0) / expected.length),
    maximum: Math.max(...maximum),
  };
}

function selectedAmount(estimate: RoadPuzzleRoundEstimate, mode: MinigamePaymentQuantityMode): number {
  if (mode === "min") return estimate.minimum;
  if (mode === "max") return estimate.maximum;
  return estimate.expected;
}

function scaleRewards(rewards: readonly RewardItem[], amount: number): RewardItem[] {
  return rewards.map((reward) => ({ ...reward, quantity: reward.quantity * amount }));
}

function getSortRank(name: string | undefined): number {
  if (!name) return 4;
  if (name.includes("렌치")) return 0;
  if (name.includes("엘레프")) return 1;
  if (name.includes("청휘석")) return 2;
  if (name.includes("크레딧")) return 3;
  return 4;
}

export function orderRoadPuzzleRewards(rewards: readonly RewardItem[]): RewardItem[] {
  return rewards
    .map((reward, index) => ({ reward, index }))
    .sort((left, right) => {
      const rank = getSortRank(left.reward.resourceName) - getSortRank(right.reward.resourceName);
      if (rank !== 0) return rank;
      return left.index - right.index;
    })
    .map(({ reward }) => reward);
}

export function getRoadPuzzleRoundRows(
  config: RoadPuzzleConfig,
  solutionsByUid: Readonly<Record<string, RoadPuzzleSolution | null | undefined>>,
  startRound: number,
  targetRound: number,
  paymentQuantity: number,
): RoadPuzzleRoundRow[] {
  return config.rounds
    .slice()
    .sort((left, right) => left.round - right.round)
    .map((round) => {
      const loopCount = round.isLoop ? Math.max(0, targetRound - Math.max(startRound, round.round) + 1) : 0;
      const selected = round.isLoop ? loopCount > 0 : round.round >= startRound && round.round <= targetRound;
      return {
        round: round.round,
        isLoop: round.isLoop,
        loopCount,
        selected,
        estimate: estimateForRound(config, round, solutionsByUid, paymentQuantity),
        completionRewards: orderRoadPuzzleRewards(round.rewards),
        pathRewards: round.isLoop ? [] : [...round.additionalRewards],
      };
    });
}

export function getRoadPuzzleTotalCost(
  config: RoadPuzzleConfig,
  solutionsByUid: Readonly<Record<string, RoadPuzzleSolution | null | undefined>>,
  startRound: number,
  targetRound: number,
  mode: MinigamePaymentQuantityMode,
  paymentQuantity: number,
): number | null {
  if (targetRound < startRound || targetRound < 1) return 0;
  let total = 0;
  for (let round = startRound; round <= Math.min(targetRound, 6); round += 1) {
    const roundConfig = roundForNumber(config, round);
    if (!roundConfig) throw new Error(`Road puzzle round ${round} is missing.`);
    const estimate = estimateForRound(config, roundConfig, solutionsByUid, paymentQuantity);
    if (!estimate) return null;
    total += selectedAmount(estimate, mode);
  }

  const loopCount = Math.max(0, targetRound - Math.max(startRound, 7) + 1);
  if (loopCount > 0) {
    const loopRound = roundForNumber(config, 7);
    if (!loopRound) throw new Error("Road puzzle round 7 is missing.");
    const estimate = estimateForRound(config, loopRound, solutionsByUid, paymentQuantity);
    if (!estimate) return null;
    total += selectedAmount(estimate, mode) * loopCount;
  }

  return total;
}

export function getRoadPuzzleTotalRewards(
  config: RoadPuzzleConfig,
  startRound: number,
  targetRound: number,
): RewardItem[] {
  if (targetRound < startRound || targetRound < 1) return [];
  const totals = new Map<string, RewardItem>();
  for (let roundNumber = startRound; roundNumber <= Math.min(targetRound, 6); roundNumber += 1) {
    const round = roundForNumber(config, roundNumber);
    if (!round) throw new Error(`Road puzzle round ${roundNumber} is missing.`);
    for (const reward of round.rewards) {
      const key = `${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`;
      const existing = totals.get(key);
      if (existing) existing.quantity += reward.quantity;
      else totals.set(key, { ...reward });
    }
  }

  const loopCount = Math.max(0, targetRound - Math.max(startRound, 7) + 1);
  if (loopCount > 0) {
    const loopRound = roundForNumber(config, 7);
    if (!loopRound) throw new Error("Road puzzle round 7 is missing.");
    for (const reward of scaleRewards(loopRound.rewards, loopCount)) {
      const key = `${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`;
      const existing = totals.get(key);
      if (existing) existing.quantity += reward.quantity;
      else totals.set(key, { ...reward });
    }
  }

  return orderRoadPuzzleRewards([...totals.values()]);
}
