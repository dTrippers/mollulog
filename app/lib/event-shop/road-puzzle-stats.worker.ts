import { solveRoadPuzzleMap } from "~/domain/road-puzzle/solver";
import type { RoadPuzzleStatsWorkerRequest, RoadPuzzleStatsWorkerResponse } from "./road-puzzle-stats-worker.shared";

self.onmessage = (event: MessageEvent<RoadPuzzleStatsWorkerRequest>) => {
  if (event.data.type !== "calculate") return;
  const { generation, maps } = event.data;
  const startedAt = performance.now();

  try {
    maps.forEach((map, index) => {
      const response: RoadPuzzleStatsWorkerResponse = {
        type: "map-result",
        generation,
        uid: map.uid,
        result: solveRoadPuzzleMap(map),
      };
      self.postMessage(response);
      self.postMessage({
        type: "progress",
        generation,
        completedMaps: index + 1,
        totalMaps: maps.length,
      } satisfies RoadPuzzleStatsWorkerResponse);
    });
    self.postMessage({
      type: "done",
      generation,
      elapsedMs: performance.now() - startedAt,
    } satisfies RoadPuzzleStatsWorkerResponse);
  } catch {
    self.postMessage({ type: "error", generation } satisfies RoadPuzzleStatsWorkerResponse);
  }
};
