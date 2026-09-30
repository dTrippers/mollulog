import {
  TREASURE_HUNT_ENGINE_VERSION,
  type TreasureHuntComposition,
  type TreasureHuntPieceSpec,
  type TreasureHuntSimulationGoal,
  type TreasureHuntSimulator,
} from "./types";

const MAX_MASK_WINDOW = 30;
const MAX_BOARD_STATE_CACHE_SIZE = 8192;
const RANDOM_RANGE = 2 ** 53;

type CanonicalPiece = {
  width: number;
  height: number;
  count: number;
};

type CanonicalComposition = {
  boardWidth: number;
  boardHeight: number;
  pieces: CanonicalPiece[];
};

type Shape = {
  major: number;
  minor: number;
  mask: number;
};

type Analysis = {
  total: number;
  coverageCounts: Float64Array;
  typeCoverageCounts: Float64Array[];
};

type PartialState = {
  mask: number;
  countCode: number;
  ways: number;
};

type Placement = {
  typeIndex: number;
  cells: number[];
};

export class InvalidTreasureHuntCompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTreasureHuntCompositionError";
  }
}

function comparePieceSpecs(left: TreasureHuntPieceSpec, right: TreasureHuntPieceSpec): number {
  const leftShort = Math.min(left.width, left.height);
  const rightShort = Math.min(right.width, right.height);
  const leftLong = Math.max(left.width, left.height);
  const rightLong = Math.max(right.width, right.height);
  return leftShort - rightShort || leftLong - rightLong || left.count - right.count;
}

function canonicalizeComposition(composition: TreasureHuntComposition): CanonicalComposition {
  if (
    !composition ||
    !Number.isSafeInteger(composition.boardWidth) ||
    !Number.isSafeInteger(composition.boardHeight) ||
    composition.boardWidth <= 0 ||
    composition.boardHeight <= 0 ||
    !Array.isArray(composition.pieces) ||
    composition.pieces.length === 0
  ) {
    throw new InvalidTreasureHuntCompositionError("Composition dimensions and pieces must be provided.");
  }

  const boardWidth = Math.max(composition.boardWidth, composition.boardHeight);
  const boardHeight = Math.min(composition.boardWidth, composition.boardHeight);
  const boardCells = boardWidth * boardHeight;
  if (!Number.isSafeInteger(boardCells)) {
    throw new InvalidTreasureHuntCompositionError("Board dimensions are outside the supported integer range.");
  }

  const pieces = composition.pieces.map((piece) => {
    if (
      !piece ||
      !Number.isSafeInteger(piece.width) ||
      !Number.isSafeInteger(piece.height) ||
      !Number.isSafeInteger(piece.count) ||
      piece.width <= 0 ||
      piece.height <= 0 ||
      piece.count <= 0
    ) {
      throw new InvalidTreasureHuntCompositionError("Treasure dimensions and counts must be positive integers.");
    }
    const width = Math.min(piece.width, piece.height);
    const height = Math.max(piece.width, piece.height);
    if (!(width <= boardWidth && height <= boardHeight) && !(height <= boardWidth && width <= boardHeight)) {
      throw new InvalidTreasureHuntCompositionError("A treasure cannot fit on the board, even when rotated.");
    }
    return { width, height, count: piece.count };
  });

  pieces.sort(comparePieceSpecs);
  const requiredCells = pieces.reduce((sum, piece) => sum + piece.width * piece.height * piece.count, 0);
  if (!Number.isSafeInteger(requiredCells) || requiredCells <= 0 || requiredCells > boardCells) {
    throw new InvalidTreasureHuntCompositionError("Treasure cells must fit within the board.");
  }

  return { boardWidth, boardHeight, pieces };
}

export function isValidTreasureHuntComposition(composition: TreasureHuntComposition): boolean {
  try {
    canonicalizeComposition(composition);
    return true;
  } catch (error) {
    if (error instanceof InvalidTreasureHuntCompositionError) {
      return false;
    }
    throw error;
  }
}

class BoundedLruCache<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
  }
}

class PlacementSolver {
  private readonly width: number;
  private readonly height: number;
  private readonly boardCells: number;
  private readonly pieces: CanonicalPiece[];
  private readonly typeCount: number;
  private readonly typeRadices: number[];
  private readonly typeMultipliers: number[];
  private readonly countSpace: number;
  private readonly windowSize: number;
  private readonly maskSpace: number;
  private readonly stateSpace: number;
  private readonly shapes: Shape[][];
  private readonly scanToCell: number[];
  private readonly initialCountCode: number;

  constructor(composition: CanonicalComposition) {
    this.width = composition.boardWidth;
    this.height = composition.boardHeight;
    this.boardCells = this.width * this.height;
    this.pieces = composition.pieces;
    this.typeCount = this.pieces.length;
    this.typeRadices = this.pieces.map((piece) => piece.count + 1);
    this.typeMultipliers = [];

    let countSpace = 1;
    let initialCountCode = 0;
    for (let typeIndex = 0; typeIndex < this.typeCount; typeIndex++) {
      this.typeMultipliers.push(countSpace);
      initialCountCode += (this.pieces[typeIndex]?.count ?? 0) * countSpace;
      countSpace *= this.typeRadices[typeIndex] ?? 1;
    }
    if (!Number.isSafeInteger(countSpace) || !Number.isSafeInteger(initialCountCode)) {
      throw new Error("Treasure composition state space exceeds exact integer limits.");
    }
    this.countSpace = countSpace;
    this.initialCountCode = initialCountCode;

    const maxMajorExtent = this.pieces.reduce((max, piece) => Math.max(max, piece.width, piece.height), 1);
    this.windowSize = maxMajorExtent * this.height;
    if (this.windowSize > MAX_MASK_WINDOW) {
      throw new Error("Treasure composition requires an unsupported scan window.");
    }
    this.maskSpace = 2 ** this.windowSize;
    this.stateSpace = this.boardCells * this.countSpace * this.maskSpace;
    if (!Number.isSafeInteger(this.stateSpace)) {
      throw new Error("Treasure composition state keys exceed exact integer limits.");
    }

    this.shapes = this.pieces.map((piece) => {
      const dimensions = piece.width === piece.height ? [[piece.width, piece.height]] : [[piece.width, piece.height], [piece.height, piece.width]];
      return dimensions.map(([major, minor]) => {
        if (major === undefined || minor === undefined) {
          throw new Error("Invalid normalized treasure shape.");
        }
        let mask = 0;
        for (let majorOffset = 0; majorOffset < major; majorOffset++) {
          for (let minorOffset = 0; minorOffset < minor; minorOffset++) {
            mask |= 1 << (majorOffset * this.height + minorOffset);
          }
        }
        return { major, minor, mask };
      });
    });

    this.scanToCell = Array.from({ length: this.boardCells }, (_, scanIndex) => {
      const major = Math.floor(scanIndex / this.height);
      const minor = scanIndex % this.height;
      return minor * this.width + major;
    });
  }

  countArrangements(): number {
    const knownEmpty = new Uint8Array(this.boardCells);
    const knownOccupied = new Uint8Array(this.boardCells);
    const { total } = this.analyze(knownEmpty, knownOccupied, this.pieces.map((piece) => piece.count), false);
    if (total === 0) {
      throw new InvalidTreasureHuntCompositionError("No non-overlapping treasure layout fits this board.");
    }
    return total;
  }

  createSimulator(goal: TreasureHuntSimulationGoal): TreasureHuntSimulator {
    const selectedTypes = this.resolveGoal(goal);
    const selectedTypeSet = new Set(selectedTypes);
    const minCells = selectedTypes.reduce((sum, typeIndex) => {
      const piece = this.pieces[typeIndex];
      if (!piece) {
        throw new RangeError("Unknown treasure type index.");
      }
      return sum + piece.width * piece.height * piece.count;
    }, 0);

    const empty = new Uint8Array(this.boardCells);
    const occupied = new Uint8Array(this.boardCells);
    const initialRemaining = this.pieces.map((piece) => piece.count);
    const root = this.analyze(empty, occupied, initialRemaining, true);
    if (root.total === 0 || !root.memo) {
      throw new InvalidTreasureHuntCompositionError("No non-overlapping treasure layout fits this board.");
    }

    const boardStateCache = new BoundedLruCache<string, Analysis>(MAX_BOARD_STATE_CACHE_SIZE);
    boardStateCache.set(this.boardStateKey(empty, occupied, initialRemaining), {
      total: root.total,
      coverageCounts: root.coverageCounts,
      typeCoverageCounts: root.typeCoverageCounts,
    });
    const sampleLayout = this.makeSampler(root.memo, empty, occupied, initialRemaining);
    const allTargetTypesFound = (foundCounts: number[]) =>
      selectedTypes.every((typeIndex) => foundCounts[typeIndex] === this.pieces[typeIndex]?.count);

    return {
      minCells,
      boardCells: this.boardCells,
      simulateGame: (gameIndex) => {
        if (!Number.isSafeInteger(gameIndex) || gameIndex < 0) {
          throw new RangeError("Game index must be a non-negative safe integer.");
        }
        const random = createGameRandom(gameIndex, this.width, this.height, this.pieces);
        const truth = sampleLayout(random);
        const ownerByCell = new Int32Array(this.boardCells).fill(-1);
        truth.forEach((placement, placementIndex) => {
          placement.cells.forEach((cell) => {
            ownerByCell[cell] = placementIndex;
          });
        });

        const knownEmpty = new Uint8Array(this.boardCells);
        const knownOccupied = new Uint8Array(this.boardCells);
        const remaining = this.pieces.map((piece) => piece.count);
        const foundCounts = this.pieces.map(() => 0);
        let openedCells = 0;

        while (!allTargetTypesFound(foundCounts)) {
          const stateKey = this.boardStateKey(knownEmpty, knownOccupied, remaining);
          let analysis = boardStateCache.get(stateKey);
          if (!analysis) {
            const result = this.analyze(knownEmpty, knownOccupied, remaining, false);
            if (result.total === 0) {
              throw new Error("The sampled board is inconsistent with the remaining treasure state.");
            }
            analysis = {
              total: result.total,
              coverageCounts: result.coverageCounts,
              typeCoverageCounts: result.typeCoverageCounts,
            };
            boardStateCache.set(stateKey, analysis);
          }

          let selectedCell = -1;
          let selectedProbability = -1;
          for (let cell = 0; cell < this.boardCells; cell++) {
            if (knownEmpty[cell] || knownOccupied[cell]) {
              continue;
            }
            let probabilityCount = 0;
            if (selectedTypeSet.size === this.typeCount) {
              probabilityCount = analysis.coverageCounts[cell] ?? 0;
            } else {
              for (const typeIndex of selectedTypes) {
                probabilityCount += analysis.typeCoverageCounts[typeIndex]?.[cell] ?? 0;
              }
            }
            // Iterating cells in row-major order gives a deterministic lowest-cell tie break.
            if (probabilityCount > selectedProbability) {
              selectedProbability = probabilityCount;
              selectedCell = cell;
            }
          }
          if (selectedCell < 0 || selectedProbability <= 0) {
            throw new Error("No unopened cell can reveal a remaining target treasure.");
          }

          const placementIndex = ownerByCell[selectedCell] ?? -1;
          if (placementIndex < 0) {
            knownEmpty[selectedCell] = 1;
            openedCells++;
            continue;
          }

          const placement = truth[placementIndex];
          if (!placement) {
            throw new Error("Sampled treasure placement is missing.");
          }
          const piece = this.pieces[placement.typeIndex];
          if (!piece || remaining[placement.typeIndex] === undefined || remaining[placement.typeIndex] <= 0) {
            throw new Error("Sampled treasure count is inconsistent.");
          }
          for (const cell of placement.cells) {
            knownOccupied[cell] = 1;
          }
          remaining[placement.typeIndex]--;
          foundCounts[placement.typeIndex] = (foundCounts[placement.typeIndex] ?? 0) + 1;
          openedCells += placement.cells.length;
        }

        if (openedCells < minCells || openedCells > this.boardCells) {
          throw new Error("Simulation produced an invalid opened-cell count.");
        }
        return openedCells;
      },
    };
  }

  private resolveGoal(goal: TreasureHuntSimulationGoal): number[] {
    if (goal.type === "all") {
      return this.pieces.map((_, index) => index);
    }

    const pieceIndexes = [...new Set(goal.pieceIndexes)];
    if (
      pieceIndexes.length === 0 ||
      pieceIndexes.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= this.pieces.length)
    ) {
      throw new RangeError("Treasure goal must contain valid piece indexes.");
    }
    return pieceIndexes;
  }

  private boardStateKey(empty: Uint8Array, occupied: Uint8Array, remaining: number[]): string {
    return `${empty.join("")}|${occupied.join("")}|${remaining.join(",")}`;
  }

  private stateKey(position: number, mask: number, countCode: number): number {
    return (position * this.countSpace + countCode) * this.maskSpace + mask;
  }

  private analyze(
    knownEmptyCell: Uint8Array,
    knownOccupiedCell: Uint8Array,
    remaining: number[],
    retainMemo: boolean,
  ): Analysis & { memo?: Map<number, number> } {
    const knownEmpty = new Uint8Array(this.boardCells);
    const knownOccupied = new Uint8Array(this.boardCells);
    for (let scanIndex = 0; scanIndex < this.boardCells; scanIndex++) {
      const cell = this.scanToCell[scanIndex];
      if (cell === undefined) {
        continue;
      }
      knownEmpty[scanIndex] = knownEmptyCell[cell] ?? 0;
      knownOccupied[scanIndex] = knownOccupiedCell[cell] ?? 0;
    }

    const blockWindow = new Int32Array(this.boardCells);
    for (let position = 0; position < this.boardCells; position++) {
      let blocked = 0;
      for (let offset = 0; offset < this.windowSize && position + offset < this.boardCells; offset++) {
        if (knownEmpty[position + offset] || knownOccupied[position + offset]) {
          blocked |= 1 << offset;
        }
      }
      blockWindow[position] = blocked;
    }

    const countCode = (counts: number[]) => {
      let code = 0;
      for (let index = 0; index < this.typeCount; index++) {
        const count = counts[index];
        const radix = this.typeRadices[index];
        const multiplier = this.typeMultipliers[index];
        if (count === undefined || radix === undefined || multiplier === undefined || count < 0 || count >= radix) {
          throw new Error("Remaining treasure counts are invalid.");
        }
        code += count * multiplier;
      }
      return code;
    };

    const memo = new Map<number, number>();
    const addExact = (left: number, right: number) => {
      const sum = left + right;
      if (!Number.isSafeInteger(sum)) {
        throw new Error("Treasure arrangement count exceeds exact integer limits.");
      }
      return sum;
    };
    const getCount = (position: number, mask: number, counts: number): number => {
      if (position === this.boardCells) {
        return counts === 0 ? 1 : 0;
      }

      const key = this.stateKey(position, mask, counts);
      const cached = memo.get(key);
      if (cached !== undefined) {
        return cached;
      }

      let total = 0;
      if ((mask & 1) !== 0 || knownOccupied[position]) {
        total = getCount(position + 1, mask >>> 1, counts);
      } else {
        total = getCount(position + 1, mask >>> 1, counts);
        if (!knownEmpty[position]) {
          const major = Math.floor(position / this.height);
          const minor = position % this.height;
          for (let typeIndex = 0; typeIndex < this.typeCount; typeIndex++) {
            const multiplier = this.typeMultipliers[typeIndex];
            const radix = this.typeRadices[typeIndex];
            if (multiplier === undefined || radix === undefined || Math.floor(counts / multiplier) % radix === 0) {
              continue;
            }
            for (const shape of this.shapes[typeIndex] ?? []) {
              if (major + shape.major > this.width || minor + shape.minor > this.height) {
                continue;
              }
              if ((shape.mask & mask) !== 0 || (shape.mask & (blockWindow[position] ?? 0)) !== 0) {
                continue;
              }
              total = addExact(
                total,
                getCount(position + 1, (mask | shape.mask) >>> 1, counts - multiplier),
              );
            }
          }
        }
      }

      memo.set(key, total);
      return total;
    };

    const initialCode = countCode(remaining);
    const total = getCount(0, 0, initialCode);
    const coverageCounts = new Float64Array(this.boardCells);
    const typeCoverageCounts = this.pieces.map(() => new Float64Array(this.boardCells));

    if (total > 0) {
      let layer = new Map<number, PartialState>([[this.stateKey(0, 0, initialCode), { mask: 0, countCode: initialCode, ways: 1 }]]);
      for (let position = 0; position < this.boardCells; position++) {
        const next = new Map<number, PartialState>();
        const push = (mask: number, counts: number, ways: number) => {
          const key = this.stateKey(position + 1, mask, counts);
          const existing = next.get(key);
          if (existing) {
            existing.ways = addExact(existing.ways, ways);
          } else {
            next.set(key, { mask, countCode: counts, ways });
          }
        };

        for (const state of layer.values()) {
          const { mask, countCode: counts, ways } = state;
          if ((mask & 1) !== 0 || knownOccupied[position]) {
            const completions = getCount(position + 1, mask >>> 1, counts);
            if (completions > 0) {
              if ((mask & 1) !== 0) {
                const cell = this.scanToCell[position];
                if (cell !== undefined) {
                  coverageCounts[cell] = addExact(coverageCounts[cell] ?? 0, ways * completions);
                }
              }
              push(mask >>> 1, counts, ways);
            }
            continue;
          }

          const skippedCompletions = getCount(position + 1, mask >>> 1, counts);
          if (skippedCompletions > 0) {
            push(mask >>> 1, counts, ways);
          }
          if (knownEmpty[position]) {
            continue;
          }

          const major = Math.floor(position / this.height);
          const minor = position % this.height;
          for (let typeIndex = 0; typeIndex < this.typeCount; typeIndex++) {
            const multiplier = this.typeMultipliers[typeIndex];
            const radix = this.typeRadices[typeIndex];
            if (multiplier === undefined || radix === undefined || Math.floor(counts / multiplier) % radix === 0) {
              continue;
            }
            for (const shape of this.shapes[typeIndex] ?? []) {
              if (major + shape.major > this.width || minor + shape.minor > this.height) {
                continue;
              }
              if ((shape.mask & mask) !== 0 || (shape.mask & (blockWindow[position] ?? 0)) !== 0) {
                continue;
              }

              const nextMask = (mask | shape.mask) >>> 1;
              const nextCountCode = counts - multiplier;
              const completions = getCount(position + 1, nextMask, nextCountCode);
              if (completions === 0) {
                continue;
              }
              const layoutWays = ways * completions;
              if (!Number.isSafeInteger(layoutWays)) {
                throw new Error("Treasure marginal count exceeds exact integer limits.");
              }
              const cell = this.scanToCell[position];
              if (cell !== undefined) {
                coverageCounts[cell] = addExact(coverageCounts[cell] ?? 0, layoutWays);
              }
              const typeCounts = typeCoverageCounts[typeIndex];
              if (!typeCounts) {
                throw new Error("Treasure type coverage state is missing.");
              }
              for (let offset = 0; offset < this.windowSize; offset++) {
                if ((shape.mask & (1 << offset)) === 0) {
                  continue;
                }
                const coveredScanIndex = position + offset;
                const coveredCell = this.scanToCell[coveredScanIndex];
                if (coveredCell !== undefined) {
                  typeCounts[coveredCell] = addExact(typeCounts[coveredCell] ?? 0, layoutWays);
                }
              }
              push(nextMask, nextCountCode, ways);
            }
          }
        }
        layer = next;
      }
    }

    return {
      total,
      coverageCounts,
      typeCoverageCounts,
      ...(retainMemo ? { memo } : {}),
    };
  }

  private makeSampler(
    memo: Map<number, number>,
    knownEmptyCell: Uint8Array,
    knownOccupiedCell: Uint8Array,
    remaining: number[],
  ): (random: () => number) => Placement[] {
    const knownEmpty = new Uint8Array(this.boardCells);
    const knownOccupied = new Uint8Array(this.boardCells);
    for (let scanIndex = 0; scanIndex < this.boardCells; scanIndex++) {
      const cell = this.scanToCell[scanIndex];
      if (cell !== undefined) {
        knownEmpty[scanIndex] = knownEmptyCell[cell] ?? 0;
        knownOccupied[scanIndex] = knownOccupiedCell[cell] ?? 0;
      }
    }

    const countCode = remaining.reduce((code, count, index) => code + count * (this.typeMultipliers[index] ?? 0), 0);
    const getCount = (position: number, mask: number, counts: number) => {
      if (position === this.boardCells) {
        return counts === 0 ? 1 : 0;
      }
      return memo.get(this.stateKey(position, mask, counts)) ?? 0;
    };

    return (random) => {
      const placements: Placement[] = [];
      let mask = 0;
      let counts = countCode;
      for (let position = 0; position < this.boardCells; position++) {
        if ((mask & 1) !== 0 || knownOccupied[position]) {
          mask >>>= 1;
          continue;
        }

        const options: { ways: number; nextMask: number; nextCounts: number; placement?: Placement }[] = [
          { ways: getCount(position + 1, mask >>> 1, counts), nextMask: mask >>> 1, nextCounts: counts },
        ];
        if (!knownEmpty[position]) {
          const major = Math.floor(position / this.height);
          const minor = position % this.height;
          for (let typeIndex = 0; typeIndex < this.typeCount; typeIndex++) {
            const multiplier = this.typeMultipliers[typeIndex];
            const radix = this.typeRadices[typeIndex];
            if (multiplier === undefined || radix === undefined || Math.floor(counts / multiplier) % radix === 0) {
              continue;
            }
            for (const shape of this.shapes[typeIndex] ?? []) {
              if (major + shape.major > this.width || minor + shape.minor > this.height || (shape.mask & mask) !== 0) {
                continue;
              }
              const nextMask = (mask | shape.mask) >>> 1;
              const nextCounts = counts - multiplier;
              const cells: number[] = [];
              for (let offset = 0; offset < this.windowSize; offset++) {
                if ((shape.mask & (1 << offset)) !== 0) {
                  const cell = this.scanToCell[position + offset];
                  if (cell !== undefined) {
                    cells.push(cell);
                  }
                }
              }
              options.push({
                ways: getCount(position + 1, nextMask, nextCounts),
                nextMask,
                nextCounts,
                placement: { typeIndex, cells },
              });
            }
          }
        }

        const totalWays = options.reduce((sum, option) => sum + option.ways, 0);
        if (!Number.isSafeInteger(totalWays) || totalWays <= 0) {
          throw new Error("Unable to sample a valid treasure arrangement.");
        }
        let choice = randomBelow(random, totalWays);
        let selected = options[options.length - 1];
        for (const option of options) {
          if (choice < option.ways) {
            selected = option;
            break;
          }
          choice -= option.ways;
        }
        if (!selected) {
          throw new Error("Treasure layout sampling selected no transition.");
        }
        if (selected.placement) {
          placements.push(selected.placement);
        }
        mask = selected.nextMask;
        counts = selected.nextCounts;
      }
      return placements;
    };
  }
}

function randomBelow(random: () => number, limit: number): number {
  const acceptedRange = Math.floor(RANDOM_RANGE / limit) * limit;
  let value = random();
  while (value >= acceptedRange) {
    value = random();
  }
  return value % limit;
}

function createGameRandom(gameIndex: number, width: number, height: number, pieces: CanonicalPiece[]): () => number {
  const seedText = `${TREASURE_HUNT_ENGINE_VERSION}:${width}x${height}:${JSON.stringify(pieces)}:${gameIndex}`;
  let hash = 2166136261;
  for (let index = 0; index < seedText.length; index++) {
    hash = Math.imul(hash ^ seedText.charCodeAt(index), 16777619);
  }
  let a = (hash ^ 0x9e3779b9) >>> 0;
  let b = (hash ^ 0x243f6a88) >>> 0;
  let c = (hash ^ 0xb7e15162) >>> 0;
  let d = (hash ^ 0xdeadbeef) >>> 0;

  const nextUint32 = () => {
    const result = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + result) >>> 0;
    return result;
  };

  return () => {
    const high = nextUint32() & 0x1fffff;
    const low = nextUint32();
    return high * 0x100000000 + low;
  };
}

export function countTreasureHuntArrangements(composition: TreasureHuntComposition): number {
  return new PlacementSolver(canonicalizeComposition(composition)).countArrangements();
}

export function createTreasureHuntSimulator(
  composition: TreasureHuntComposition,
  goal: TreasureHuntSimulationGoal = { type: "all" },
): TreasureHuntSimulator {
  const canonicalComposition = canonicalizeComposition(composition);
  const solver = new PlacementSolver(canonicalComposition);
  const simulator = solver.createSimulator(goal);
  return simulator;
}
