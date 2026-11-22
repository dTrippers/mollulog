import type { RoadPuzzleMap, RoadPuzzleCoordinate } from "~/domain/event-shop";
import type { RailCounts, RoadPuzzleInteractiveAnalysis } from "~/domain/road-puzzle/solver";

export type RoadPuzzleAnalysisWorkerRequest = {
  type: "analyze";
  requestId: number;
  map: RoadPuzzleMap;
  marks: RoadPuzzleCoordinate[];
  remaining: RailCounts | null;
};

export type RoadPuzzleAnalysisWorkerResponse =
  | { type: "result"; requestId: number; analysis: RoadPuzzleInteractiveAnalysis }
  | { type: "error"; requestId: number; reason: "analysis-failure" };
