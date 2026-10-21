import type {
  MinigamePayment,
  MinigamePaymentQuantityMode,
  RewardItem,
  TreasureHuntConfig,
  TreasureHuntRoundConfig,
} from "~/domain/event-shop";
import {
  areTreasureHuntRoundEconomicsCompatible,
  combineOpenedCellHistograms,
  histogramPercentile,
  type OpenedCellHistogram,
  openedCellPercentile,
  type TreasureHuntComposition,
  treasureHuntCompositionSignature,
} from "~/domain/treasure-hunt";
import { normalizeClueSearchRoundRange } from "./clue-search";

export const TREASURE_HUNT_MAX_TARGET_ROUND = 100;

export type TreasureHuntCalculationStatus =
  | "empty"
  | "failed"
  | "incompatible"
  | "no-data"
  | "pending"
  | "provisional"
  | "round-limit"
  | "ready";

export function isTreasureHuntTargetRoundOverLimit(targetRound: number): boolean {
  return targetRound > TREASURE_HUNT_MAX_TARGET_ROUND;
}

export type TreasureHuntRoundRow = {
  round: number;
  config: TreasureHuntRoundConfig;
  multiplicity: number;
  isLoop: boolean;
  signature: string;
  composition: TreasureHuntComposition;
};

export type TreasureHuntRoundEstimate = {
  round: number;
  config: TreasureHuntRoundConfig;
  multiplicity: number;
  isLoop: boolean;
  openedCells: number | null;
  payment: MinigamePayment | null;
  theoreticalMin: number;
  theoreticalMax: number;
  isCalculating: boolean;
  failed: boolean;
};

export type TreasureHuntEstimate = {
  openedCells: number;
  payment: MinigamePayment;
  treasureRewards: RewardItem[];
  openCellRewards: RewardItem[];
  rounds: TreasureHuntRoundEstimate[];
};

export type TreasureHuntHistogramState = {
  histogram?: OpenedCellHistogram;
  completedGames: number;
  targetGames: number;
  failed?: boolean;
};

export function getTreasureHuntCellCostResources(rounds: readonly TreasureHuntRoundConfig[]) {
  const resources = new Map<string, TreasureHuntRoundConfig["cellCost"]>();
  for (const { cellCost } of rounds) {
    if (!resources.has(cellCost.resourceUid)) {
      resources.set(cellCost.resourceUid, cellCost);
    }
  }
  return [...resources.values()];
}

function getRoundConfig(config: TreasureHuntConfig, round: number): TreasureHuntRoundConfig {
  const configRound = round >= config.loopRound ? config.loopRound : round;
  const roundConfig = config.rounds.find((candidate) => candidate.round === configRound);
  if (!roundConfig) {
    throw new Error("Treasure hunt round configuration is incomplete.");
  }
  return roundConfig;
}

function getComposition(round: TreasureHuntRoundConfig): TreasureHuntComposition {
  return {
    boardWidth: round.boardWidth,
    boardHeight: round.boardHeight,
    pieces: round.treasures.map(({ width, height, count }) => ({ width, height, count })),
  };
}

/** Expands the selected interval while representing all loop rounds as one row. */
export function getTreasureHuntRoundRows(
  config: TreasureHuntConfig,
  startRound: number,
  endRound: number,
): TreasureHuntRoundRow[] {
  if (isTreasureHuntTargetRoundOverLimit(endRound)) {
    return [];
  }

  if (!Number.isSafeInteger(config.loopRound) || config.loopRound < 1) {
    throw new Error("Treasure hunt loop round is invalid.");
  }

  const range = normalizeClueSearchRoundRange(startRound, endRound);
  if (range.endRound < range.startRound) {
    return [];
  }

  const rows: TreasureHuntRoundRow[] = [];
  const lastOneTimeRound = Math.min(range.endRound, config.loopRound - 1);
  for (let round = range.startRound; round <= lastOneTimeRound; round++) {
    const roundConfig = getRoundConfig(config, round);
    const composition = getComposition(roundConfig);
    const signature = treasureHuntCompositionSignature(composition);
    rows.push({
      round: roundConfig.round,
      config: roundConfig,
      multiplicity: 1,
      isLoop: false,
      signature,
      composition,
    });
  }

  const firstLoopRound = Math.max(range.startRound, config.loopRound);
  if (firstLoopRound <= range.endRound) {
    const roundConfig = getRoundConfig(config, config.loopRound);
    const composition = getComposition(roundConfig);
    rows.push({
      round: roundConfig.round,
      config: roundConfig,
      multiplicity: range.endRound - firstLoopRound + 1,
      isLoop: true,
      signature: treasureHuntCompositionSignature(composition),
      composition,
    });
  }
  return rows;
}

export function getTreasureHuntUniqueCompositions(rows: readonly TreasureHuntRoundRow[]) {
  const seen = new Set<string>();
  return rows.flatMap(({ signature, composition }) => {
    if (seen.has(signature)) {
      return [];
    }
    seen.add(signature);
    return [{ signature, composition }];
  });
}

export function getTreasureHuntRoundSelection(
  config: TreasureHuntConfig | null,
  startRound: number,
  targetRound: number,
): {
  targetRoundOverLimit: boolean;
  rows: TreasureHuntRoundRow[];
  workerItems: { signature: string; composition: TreasureHuntComposition }[];
  economicsCompatible: boolean;
} {
  const targetRoundOverLimit = isTreasureHuntTargetRoundOverLimit(targetRound);
  if (!config || targetRound <= 0 || targetRoundOverLimit) {
    return { targetRoundOverLimit, rows: [], workerItems: [], economicsCompatible: true };
  }

  const rows = getTreasureHuntRoundRows(config, startRound, targetRound);
  const economicsCompatible = rows.length === 0 || areTreasureHuntRangeEconomicsCompatible(rows);
  return {
    targetRoundOverLimit,
    rows,
    workerItems: economicsCompatible ? getTreasureHuntUniqueCompositions(rows) : [],
    economicsCompatible,
  };
}

export function shouldHoldTreasureHuntShopCalculations(status: TreasureHuntCalculationStatus): boolean {
  return status === "pending" || status === "failed" || status === "round-limit";
}

export function areTreasureHuntRangeEconomicsCompatible(rows: readonly TreasureHuntRoundRow[]): boolean {
  return areTreasureHuntRoundEconomicsCompatible(
    rows.map(({ config }) => ({
      cellCost: {
        resourceType: config.cellCost.resourceType,
        resourceUid: config.cellCost.resourceUid,
        quantity: config.cellCost.quantity,
      },
      openCellRewards: config.openCellRewards.map(({ resourceType, resourceUid, quantity }) => ({
        resourceType,
        resourceUid,
        quantity,
      })),
    })),
  );
}

export function treasureHuntPercentileForMode(mode: MinigamePaymentQuantityMode): 0.1 | 0.5 | 0.9 {
  if (mode === "min") return 0.1;
  if (mode === "max") return 0.9;
  return 0.5;
}

function multiplyRewards(rewards: readonly RewardItem[], multiplier: number): RewardItem[] {
  const rewardMap = new Map<string, RewardItem>();
  for (const reward of rewards) {
    const key = `${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`;
    const existing = rewardMap.get(key);
    if (existing) {
      existing.quantity += reward.quantity * multiplier;
    } else {
      rewardMap.set(key, { ...reward, quantity: reward.quantity * multiplier });
    }
  }
  return [...rewardMap.values()];
}

export function getTreasureHuntTreasureRewards(rows: readonly TreasureHuntRoundRow[]): RewardItem[] {
  const rewards = rows.flatMap(({ config, multiplicity }) =>
    config.treasures.flatMap((treasure) =>
      treasure.rewards.map((reward) => ({ ...reward, quantity: reward.quantity * treasure.count * multiplicity })),
    ),
  );
  return multiplyRewards(rewards, 1);
}

export function getTreasureHuntOpenCellRewards(
  rows: readonly TreasureHuntRoundRow[],
  openedCells: number,
): RewardItem[] {
  const firstRound = rows[0];
  return firstRound ? multiplyRewards(firstRound.config.openCellRewards, openedCells) : [];
}

function createRoundEstimate(
  row: TreasureHuntRoundRow,
  stats: TreasureHuntHistogramState | undefined,
  percentile: 0.1 | 0.5 | 0.9,
): TreasureHuntRoundEstimate {
  const theoreticalMin = row.config.treasures.reduce(
    (total, treasure) => total + treasure.width * treasure.height * treasure.count,
    0,
  );
  const theoreticalMax = row.config.boardWidth * row.config.boardHeight;
  const openedCells = stats?.failed || !stats?.histogram ? null : histogramPercentile(stats.histogram, percentile);
  return {
    round: row.round,
    config: row.config,
    multiplicity: row.multiplicity,
    isLoop: row.isLoop,
    openedCells,
    payment:
      openedCells === null ? null : { ...row.config.cellCost, quantity: openedCells * row.config.cellCost.quantity },
    theoreticalMin,
    theoreticalMax,
    isCalculating: !!stats && !stats.failed && stats.completedGames < stats.targetGames,
    failed: !!stats?.failed,
  };
}

export function calculateTreasureHuntRoundEstimates(
  rows: readonly TreasureHuntRoundRow[],
  statsBySignature: Readonly<Record<string, TreasureHuntHistogramState>>,
  mode: MinigamePaymentQuantityMode,
): TreasureHuntRoundEstimate[] {
  const percentile = treasureHuntPercentileForMode(mode);
  return rows.map((row) => createRoundEstimate(row, statsBySignature[row.signature], percentile));
}

/** Builds aggregate percentiles only when every selected composition has a histogram. */
export function calculateTreasureHuntEstimate(
  rows: readonly TreasureHuntRoundRow[],
  statsBySignature: Readonly<Record<string, TreasureHuntHistogramState>>,
  mode: MinigamePaymentQuantityMode,
): TreasureHuntEstimate | null {
  if (rows.length === 0 || !areTreasureHuntRangeEconomicsCompatible(rows)) {
    return null;
  }

  const uniqueCompositions = getTreasureHuntUniqueCompositions(rows);
  const parts = uniqueCompositions.map(({ signature }) => {
    const stats = statsBySignature[signature];
    if (!stats || stats.failed || !stats.histogram) {
      return null;
    }
    const multiplicity = rows.reduce(
      (total, row) => (row.signature === signature ? total + row.multiplicity : total),
      0,
    );
    return { histogram: stats.histogram, multiplicity };
  });
  if (parts.some((part) => part === null)) {
    return null;
  }

  const distribution = combineOpenedCellHistograms(parts as { histogram: OpenedCellHistogram; multiplicity: number }[]);
  const openedCells = openedCellPercentile(distribution, treasureHuntPercentileForMode(mode));
  const firstRound = rows[0];
  if (!firstRound) {
    return null;
  }
  const payment = { ...firstRound.config.cellCost, quantity: openedCells * firstRound.config.cellCost.quantity };
  const openCellRewards = getTreasureHuntOpenCellRewards(rows, openedCells);
  const rounds = calculateTreasureHuntRoundEstimates(rows, statsBySignature, mode);

  return {
    openedCells,
    payment,
    treasureRewards: getTreasureHuntTreasureRewards(rows),
    openCellRewards,
    rounds,
  };
}
