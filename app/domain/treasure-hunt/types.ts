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

/** A zero-based board coordinate measured from the top-left corner. */
export type TreasureHuntBoardCoordinate = {
  x: number;
  y: number;
};

/** The long side runs along x for horizontal and y for vertical; squares are unchanged. */
export type TreasureHuntBoardOrientation = "horizontal" | "vertical";

/** A found treasure. Width and height identify its rotation-invariant shape. */
export type TreasureHuntFoundTreasure = TreasureHuntBoardCoordinate & {
  width: number;
  height: number;
  orientation: TreasureHuntBoardOrientation;
};

/** Partial board observations used to condition the exact placement analysis. */
export type TreasureHuntBoardObservation = {
  knownEmpty: readonly TreasureHuntBoardCoordinate[];
  foundTreasures: readonly TreasureHuntFoundTreasure[];
};

/** Remaining count for a rotation-invariant shape (width is the shorter side). */
export type TreasureHuntRemainingPieceCount = {
  width: number;
  height: number;
  count: number;
};

export type TreasureHuntBoardAnalysis = {
  status: "ok" | "inconsistent";
  /** Row-major [y][x] probabilities in [0, 1]; recorded cells are null. */
  cells: (number | null)[][] | null;
  /** All unopened cells with the exact greatest coverage count. */
  recommended: TreasureHuntBoardCoordinate[];
  /** Remaining counts grouped by rotation-invariant shape; width is the shorter side. */
  remaining: TreasureHuntRemainingPieceCount[];
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
