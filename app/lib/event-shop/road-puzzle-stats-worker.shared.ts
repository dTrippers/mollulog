import type { RoadPuzzleMap } from "~/domain/event-shop";
import type { RoadPuzzleSolution } from "~/domain/road-puzzle/solver";

export type RoadPuzzleStatsWorkerRequest = {
  type: "calculate";
  generation: number;
  maps: RoadPuzzleMap[];
};

export type RoadPuzzleStatsWorkerResponse =
  | { type: "map-result"; generation: number; uid: string; result: RoadPuzzleSolution | null }
  | { type: "progress"; generation: number; completedMaps: number; totalMaps: number }
  | { type: "done"; generation: number; elapsedMs: number }
  | { type: "error"; generation: number };
