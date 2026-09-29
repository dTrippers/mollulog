import type { TreasureHuntComposition, TreasureHuntPieceSpec } from "./types";

export {
  areTreasureHuntRoundEconomicsCompatible,
  combineOpenedCellHistograms,
  histogramPercentile,
  openedCellPercentile,
} from "./statistics";
export type {
  TreasureHuntResourceQuantity,
  TreasureHuntRoundEconomics,
} from "./statistics";
export {
  analyzeTreasureHuntBoard,
  countTreasureHuntArrangements,
  createTreasureHuntSimulator,
  InvalidTreasureHuntCompositionError,
  InvalidTreasureHuntObservationError,
  isValidTreasureHuntComposition,
} from "./solver";
export type {
  TreasureHuntBoardAnalysis,
  TreasureHuntBoardCoordinate,
  TreasureHuntBoardObservation,
  TreasureHuntBoardOrientation,
  TreasureHuntFoundTreasure,
  OpenedCellDistribution,
  OpenedCellHistogram,
  TreasureHuntRemainingPieceCount,
  TreasureHuntComposition,
  TreasureHuntPieceSpec,
  TreasureHuntSimulationGoal,
  TreasureHuntSimulator,
} from "./types";
export { TREASURE_HUNT_ENGINE_VERSION, TREASURE_HUNT_TARGET_GAMES } from "./types";

function canonicalPiece(piece: TreasureHuntPieceSpec): [number, number, number] {
  return [Math.min(piece.width, piece.height), Math.max(piece.width, piece.height), piece.count];
}

/** A stable, rotation-invariant key for a board and its anonymous treasure shapes. */
export function treasureHuntCompositionSignature(composition: TreasureHuntComposition): string {
  const board = [Math.min(composition.boardWidth, composition.boardHeight), Math.max(composition.boardWidth, composition.boardHeight)];
  const pieces = composition.pieces.map(canonicalPiece).sort((left, right) => {
    return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
  });
  return JSON.stringify([board, pieces]);
}
