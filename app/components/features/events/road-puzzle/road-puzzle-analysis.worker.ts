import {
  analyzeRoadPuzzleMap,
  createRoadPuzzleRouteBaseline,
  type RoadPuzzleRouteBaseline,
} from "~/domain/road-puzzle/solver";
import type {
  RoadPuzzleAnalysisWorkerRequest,
  RoadPuzzleAnalysisWorkerResponse,
} from "./road-puzzle-analysis-worker.shared";

type RuntimeOptions = {
  postMessage: (message: RoadPuzzleAnalysisWorkerResponse) => void;
  analyze?: typeof analyzeRoadPuzzleMap;
  createBaseline?: typeof createRoadPuzzleRouteBaseline;
};

const MAX_CACHED_BASELINES = 4;

/** Worker-side handler, exported so its protocol can be tested without a browser. */
export class RoadPuzzleAnalysisWorkerRuntime {
  private readonly postMessage: RuntimeOptions["postMessage"];
  private readonly analyze: NonNullable<RuntimeOptions["analyze"]>;
  private readonly createBaseline: NonNullable<RuntimeOptions["createBaseline"]>;
  private readonly baselines = new Map<string, RoadPuzzleRouteBaseline>();

  constructor(options: RuntimeOptions) {
    this.postMessage = options.postMessage;
    this.analyze = options.analyze ?? analyzeRoadPuzzleMap;
    this.createBaseline = options.createBaseline ?? createRoadPuzzleRouteBaseline;
  }

  handle(request: RoadPuzzleAnalysisWorkerRequest): void {
    try {
      const baseline = this.getBaseline(request.map.uid, request.map);
      this.postMessage({
        type: "result",
        requestId: request.requestId,
        analysis: this.analyze(request.map, request.marks, request.remaining, baseline),
      });
    } catch {
      this.postMessage({ type: "error", requestId: request.requestId, reason: "analysis-failure" });
    }
  }

  private getBaseline(mapUid: string, map: RoadPuzzleAnalysisWorkerRequest["map"]): RoadPuzzleRouteBaseline {
    const cached = this.baselines.get(mapUid);
    if (cached) {
      this.baselines.delete(mapUid);
      this.baselines.set(mapUid, cached);
      return cached;
    }

    const baseline = this.createBaseline(map);
    this.baselines.set(mapUid, baseline);
    if (this.baselines.size > MAX_CACHED_BASELINES) {
      const oldestMapUid = this.baselines.keys().next().value;
      if (oldestMapUid !== undefined) this.baselines.delete(oldestMapUid);
    }
    return baseline;
  }
}

const workerScope =
  typeof self === "undefined"
    ? undefined
    : (self as unknown as {
        onmessage: ((event: MessageEvent<RoadPuzzleAnalysisWorkerRequest>) => void) | null;
        postMessage: (message: RoadPuzzleAnalysisWorkerResponse) => void;
      });

if (workerScope) {
  const runtime = new RoadPuzzleAnalysisWorkerRuntime({ postMessage: (message) => workerScope.postMessage(message) });
  workerScope.onmessage = (event) => runtime.handle(event.data);
}
