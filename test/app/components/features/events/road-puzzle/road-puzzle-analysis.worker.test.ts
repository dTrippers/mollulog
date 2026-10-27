import { describe, expect, it, jest } from "@jest/globals";
import { RoadPuzzleAnalysisWorkerRuntime } from "~/components/features/events/road-puzzle/road-puzzle-analysis.worker";
import type { RoadPuzzleCoordinate, RoadPuzzleMap } from "~/domain/event-shop";
import type { RailCounts, RoadPuzzleInteractiveAnalysis, RoadPuzzleRouteBaseline } from "~/domain/road-puzzle/solver";

const map: RoadPuzzleMap = {
  uid: "map-1",
  name: "Map 1",
  deck: { straight: 1, longCurve: 1, shortCurve: 1 },
  tiles: [],
  fixedRails: [],
};

const analysis: RoadPuzzleInteractiveAnalysis = {
  status: "no-route",
  witness: null,
  requiredVector: null,
  drawnVector: null,
  minimumStickers: null,
  expectedStickers: null,
  maximumStickers: null,
  delta: null,
};

const baseline: RoadPuzzleRouteBaseline = { mapUid: map.uid, routes: [], solution: null };

describe("road puzzle analysis worker", () => {
  it("returns map analyses and reuses one no-mark baseline for repeated requests", () => {
    const postMessage = jest.fn();
    const analyze = jest.fn(
      (
        _map: RoadPuzzleMap,
        _marks: readonly RoadPuzzleCoordinate[],
        _remaining: RailCounts | null,
        _baseline?: RoadPuzzleRouteBaseline,
      ) => analysis,
    );
    const createBaseline = jest.fn((_map: RoadPuzzleMap) => baseline);
    const runtime = new RoadPuzzleAnalysisWorkerRuntime({
      postMessage,
      analyze,
      createBaseline,
    });
    const request = {
      type: "analyze" as const,
      requestId: 4,
      map,
      marks: [{ x: 1, y: -1, z: 0 }],
      remaining: null,
    };

    runtime.handle(request);
    runtime.handle({ ...request, requestId: 5, marks: [{ x: 2, y: -2, z: 0 }] });

    expect(createBaseline).toHaveBeenCalledTimes(1);
    expect(createBaseline).toHaveBeenCalledWith(map);
    expect(analyze).toHaveBeenNthCalledWith(1, map, request.marks, null, baseline);
    expect(analyze).toHaveBeenNthCalledWith(2, map, [{ x: 2, y: -2, z: 0 }], null, baseline);
    expect(postMessage).toHaveBeenCalledWith({ type: "result", requestId: 4, analysis });
    expect(postMessage).toHaveBeenCalledWith({ type: "result", requestId: 5, analysis });
  });

  it("returns a generic failure without exposing an exception", () => {
    const postMessage = jest.fn();
    const runtime = new RoadPuzzleAnalysisWorkerRuntime({
      postMessage,
      createBaseline: () => baseline,
      analyze: () => {
        throw new Error("internal detail");
      },
    });

    runtime.handle({ type: "analyze", requestId: 8, map, marks: [], remaining: null });

    expect(postMessage).toHaveBeenCalledWith({ type: "error", requestId: 8, reason: "analysis-failure" });
  });

  it("bounds the per-map baseline cache", () => {
    const postMessage = jest.fn();
    const createBaseline = jest.fn((cachedMap: RoadPuzzleMap) => ({
      mapUid: cachedMap.uid,
      routes: [],
      solution: null,
    }));
    const runtime = new RoadPuzzleAnalysisWorkerRuntime({
      postMessage,
      analyze: () => analysis,
      createBaseline,
    });
    const requestFor = (uid: string, requestId: number) => ({
      type: "analyze" as const,
      requestId,
      map: { ...map, uid },
      marks: [],
      remaining: null,
    });

    for (let index = 1; index <= 5; index += 1) runtime.handle(requestFor(`map-${index}`, index));
    runtime.handle(requestFor("map-1", 6));

    expect(createBaseline).toHaveBeenCalledTimes(6);
  });
});
