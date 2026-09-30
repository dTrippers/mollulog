export type TreasureHuntPieceSpec = {
  width: number;
  height: number;
  count: number;
};

export type TreasureHuntComposition = {
  boardWidth: number;
  boardHeight: number;
  pieces: TreasureHuntPieceSpec[];
};

export const TREASURE_HUNT_ENGINE_VERSION = 1;
export const TREASURE_HUNT_TARGET_GAMES = 1000;

export type OpenedCellHistogram = {
  minCells: number;
  /** counts[i] is the number of games that opened minCells + i cells. */
  counts: number[];
};

/** Exact, empirical distribution of the sum of one or more game histograms. */
export type OpenedCellDistribution = {
  minCells: number;
  counts: bigint[];
  total: bigint;
};

export type TreasureHuntSimulationGoal =
  | { type: "all" }
  /** Piece indexes refer to the canonical piece order in the composition signature. */
  | { type: "treasure-types"; pieceIndexes: readonly number[] };

export type TreasureHuntSimulator = {
  minCells: number;
  boardCells: number;
  simulateGame: (gameIndex: number) => number;
};
