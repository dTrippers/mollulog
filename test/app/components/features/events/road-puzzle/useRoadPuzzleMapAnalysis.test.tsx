/** @jest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import type { RoadPuzzleMap } from "~/domain/event-shop";
import type { RoadPuzzleInteractiveAnalysis } from "~/domain/road-puzzle/solver";
import type {
  RoadPuzzleAnalysisWorkerRequest,
  RoadPuzzleAnalysisWorkerResponse,
} from "~/components/features/events/road-puzzle/road-puzzle-analysis-worker.shared";
import { useRoadPuzzleMapAnalysis } from "~/components/features/events/road-puzzle/useRoadPuzzleMapAnalysis";

const map: RoadPuzzleMap = {
  uid: "map-1",
  name: "Map 1",
  deck: { straight: 1, longCurve: 1, shortCurve: 1 },
  tiles: [],
  fixedRails: [],
};

const planned: RoadPuzzleInteractiveAnalysis = {
  status: "planned",
  witness: [],
  requiredVector: { straight: 1, longCurve: 0, shortCurve: 0 },
  drawnVector: null,
  minimumStickers: 150,
  expectedStickers: 300,
  maximumStickers: 450,
  delta: null,
};

const incomplete: RoadPuzzleInteractiveAnalysis = {
  ...planned,
  status: "incomplete",
  drawnVector: { straight: 0, longCurve: 0, shortCurve: 0 },
  minimumStickers: 150,
  expectedStickers: 300,
  maximumStickers: 300,
};

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<RoadPuzzleAnalysisWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  requests: RoadPuzzleAnalysisWorkerRequest[] = [];
  terminated = false;

  constructor(_url: URL, _options?: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: RoadPuzzleAnalysisWorkerRequest) {
    this.requests.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  respond(response: RoadPuzzleAnalysisWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<RoadPuzzleAnalysisWorkerResponse>);
  }

  fail() {
    this.onerror?.({} as ErrorEvent);
  }
}

const originalWorker = globalThis.Worker;

beforeEach(() => {
  FakeWorker.instances = [];
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker });
});

afterEach(() => {
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: originalWorker });
});

describe("useRoadPuzzleMapAnalysis", () => {
  it("drops a superseded request and preserves the previous result while recalculating", async () => {
    const firstMark = { x: 1, y: -1, z: 0 };
    const nextMark = { x: 2, y: -2, z: 0 };
    const { result, rerender } = renderHook(
      ({ marks }) => useRoadPuzzleMapAnalysis(map, marks, null, true),
      { initialProps: { marks: [firstMark] } },
    );
    await waitFor(() => expect(FakeWorker.instances[0]?.requests).toHaveLength(1));
    const worker = FakeWorker.instances[0]!;
    const firstRequest = worker.requests[0]!;

    act(() => worker.respond({ type: "result", requestId: firstRequest.requestId, analysis: planned }));
    expect(result.current.status).toBe("ready");
    expect(result.current.analysis).toBe(planned);

    rerender({ marks: [nextMark] });
    await waitFor(() => expect(worker.requests).toHaveLength(2));
    const nextRequest = worker.requests[1]!;
    expect(result.current.status).toBe("pending");
    expect(result.current.analysis).toBe(planned);

    act(() => worker.respond({ type: "result", requestId: firstRequest.requestId, analysis: planned }));
    expect(result.current.status).toBe("pending");
    expect(result.current.analysis).toBe(planned);

    act(() => worker.respond({ type: "result", requestId: nextRequest.requestId, analysis: incomplete }));
    expect(result.current.status).toBe("ready");
    expect(result.current.analysis).toBe(incomplete);
  });

  it("reports worker errors and retries with a new worker", async () => {
    const { result } = renderHook(() => useRoadPuzzleMapAnalysis(map, [], { straight: 0, longCurve: 1, shortCurve: 1 }, true));
    await waitFor(() => expect(FakeWorker.instances[0]?.requests).toHaveLength(1));

    act(() => FakeWorker.instances[0]!.fail());
    expect(result.current.status).toBe("failed");

    act(() => result.current.retry());
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(2));
    await waitFor(() => expect(FakeWorker.instances[1]?.requests).toHaveLength(1));
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    expect(result.current.status).toBe("pending");
  });
});
