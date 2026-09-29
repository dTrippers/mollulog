import type { OpenedCellDistribution, OpenedCellHistogram } from "./types";

export type TreasureHuntResourceQuantity = {
  resourceType: string;
  resourceUid: string;
  quantity: number;
};

export type TreasureHuntRoundEconomics = {
  cellCost: TreasureHuntResourceQuantity;
  openCellRewards: readonly TreasureHuntResourceQuantity[];
};

type Percentile = 0.1 | 0.5 | 0.9;

const PERCENTILE_FRACTIONS: Record<Percentile, readonly [number, number]> = {
  0.1: [1, 10],
  0.5: [1, 2],
  0.9: [9, 10],
};

function validateHistogram(histogram: OpenedCellHistogram): number {
  if (!Number.isSafeInteger(histogram.minCells) || histogram.minCells < 0 || histogram.counts.length === 0) {
    throw new RangeError("Invalid opened-cell histogram.");
  }

  let total = 0;
  for (const count of histogram.counts) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError("Invalid opened-cell histogram.");
    }
    total += count;
  }
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new RangeError("Opened-cell histogram must contain at least one game.");
  }
  return total;
}

function validateDistribution(distribution: OpenedCellDistribution): void {
  if (
    !Number.isSafeInteger(distribution.minCells) ||
    distribution.minCells < 0 ||
    distribution.counts.length === 0 ||
    distribution.total <= 0n
  ) {
    throw new RangeError("Invalid opened-cell distribution.");
  }

  const total = distribution.counts.reduce((sum, count) => {
    if (count < 0n) {
      throw new RangeError("Invalid opened-cell distribution.");
    }
    return sum + count;
  }, 0n);
  if (total !== distribution.total) {
    throw new RangeError("Opened-cell distribution total does not match its counts.");
  }
}

function percentileIndex(counts: readonly number[], numerator: number, denominator: number): number {
  const total = counts.reduce((sum, count) => sum + BigInt(count), 0n);
  let cumulative = 0n;
  for (let index = 0; index < counts.length; index++) {
    cumulative += BigInt(counts[index] ?? 0);
    if (cumulative * BigInt(denominator) >= total * BigInt(numerator)) {
      return index;
    }
  }
  throw new RangeError("Unable to resolve opened-cell percentile.");
}

function convolve(left: readonly bigint[], right: readonly bigint[]): bigint[] {
  const result = Array<bigint>(left.length + right.length - 1).fill(0n);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex++) {
    const leftCount = left[leftIndex] ?? 0n;
    if (leftCount === 0n) {
      continue;
    }
    for (let rightIndex = 0; rightIndex < right.length; rightIndex++) {
      const rightCount = right[rightIndex] ?? 0n;
      if (rightCount > 0n) {
        const resultIndex = leftIndex + rightIndex;
        result[resultIndex] = (result[resultIndex] ?? 0n) + leftCount * rightCount;
      }
    }
  }
  return result;
}

function histogramPower(histogram: OpenedCellHistogram, exponent: number): OpenedCellDistribution {
  validateHistogram(histogram);
  let powerCounts = histogram.counts.map(BigInt);
  let powerMinCells = histogram.minCells;
  let resultCounts = [1n];
  let resultMinCells = 0;
  let remainingExponent = exponent;

  while (remainingExponent > 0) {
    if (remainingExponent % 2 === 1) {
      resultCounts = convolve(resultCounts, powerCounts);
      resultMinCells += powerMinCells;
    }
    remainingExponent = Math.floor(remainingExponent / 2);
    if (remainingExponent > 0) {
      powerCounts = convolve(powerCounts, powerCounts);
      powerMinCells *= 2;
    }
  }

  return {
    minCells: resultMinCells,
    counts: resultCounts,
    total: resultCounts.reduce((sum, count) => sum + count, 0n),
  };
}

/**
 * Combines independent game histograms. Multiplicity repeats the corresponding
 * round distribution that many times; an empty input is the point mass at zero.
 */
export function combineOpenedCellHistograms(
  parts: { histogram: OpenedCellHistogram; multiplicity: number }[],
): OpenedCellDistribution {
  let counts = [1n];
  let minCells = 0;

  for (const { histogram, multiplicity } of parts) {
    if (!Number.isSafeInteger(multiplicity) || multiplicity < 0) {
      throw new RangeError("Histogram multiplicity must be a non-negative safe integer.");
    }
    if (multiplicity === 0) {
      continue;
    }

    const repeated = histogramPower(histogram, multiplicity);
    counts = convolve(counts, repeated.counts);
    minCells += repeated.minCells;
  }

  const distribution = {
    minCells,
    counts,
    total: counts.reduce((sum, count) => sum + count, 0n),
  };
  validateDistribution(distribution);
  return distribution;
}

/** Returns the first cell count whose cumulative probability reaches p. */
export function openedCellPercentile(distribution: OpenedCellDistribution, p: Percentile): number {
  validateDistribution(distribution);
  const [numerator, denominator] = PERCENTILE_FRACTIONS[p];
  let cumulative = 0n;
  for (let index = 0; index < distribution.counts.length; index++) {
    cumulative += distribution.counts[index] ?? 0n;
    if (cumulative * BigInt(denominator) >= distribution.total * BigInt(numerator)) {
      return distribution.minCells + index;
    }
  }
  throw new RangeError("Unable to resolve opened-cell percentile.");
}

/** Returns the first cell count whose empirical cumulative probability reaches p. */
export function histogramPercentile(histogram: OpenedCellHistogram, p: Percentile): number {
  validateHistogram(histogram);
  const [numerator, denominator] = PERCENTILE_FRACTIONS[p];
  return histogram.minCells + percentileIndex(histogram.counts, numerator, denominator);
}

function normalizedRewards(rewards: readonly TreasureHuntResourceQuantity[]): [string, number][] {
  const byResource = new Map<string, number>();
  for (const reward of rewards) {
    const key = JSON.stringify([reward.resourceType, reward.resourceUid]);
    byResource.set(key, (byResource.get(key) ?? 0) + reward.quantity);
  }
  return [...byResource.entries()].sort(([left], [right]) => left.localeCompare(right));
}

/**
 * The selected rounds can share one aggregate distribution only when their
 * per-cell payment and the complete per-cell open reward set are identical.
 */
export function areTreasureHuntRoundEconomicsCompatible(rounds: readonly TreasureHuntRoundEconomics[]): boolean {
  if (rounds.length < 2) {
    return true;
  }

  const first = rounds[0];
  if (!first) {
    return true;
  }
  const firstCost = first.cellCost;
  const firstRewards = normalizedRewards(first.openCellRewards);

  return rounds.slice(1).every((round) => {
    const cost = round.cellCost;
    return (
      cost.resourceType === firstCost.resourceType &&
      cost.resourceUid === firstCost.resourceUid &&
      cost.quantity === firstCost.quantity &&
      JSON.stringify(normalizedRewards(round.openCellRewards)) === JSON.stringify(firstRewards)
    );
  });
}
