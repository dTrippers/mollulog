/** @jest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { useMemo } from "react";
import type { RoadPuzzleMap } from "~/domain/event-shop";
import type { RoadPuzzleStatsWorkerRequest, RoadPuzzleStatsWorkerResponse } from "~/components/features/events/shop/road-puzzle-stats-worker.shared";
import { useRoadPuzzleStats } from "~/components/features/events/shop/hooks/useRoadPuzzleStats";

class MockWorker {
  onmessage: ((event: MessageEvent<RoadPuzzleStatsWorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  request: RoadPuzzleStatsWorkerRequest | null = null;
  terminated = false;

  postMessage(request: RoadPuzzleStatsWorkerRequest) {
    this.request = request;
  }

  terminate() {
    this.terminated = true;
  }

  send(data: RoadPuzzleStatsWorkerResponse) {
    this.onmessage?.({ data } as MessageEvent<RoadPuzzleStatsWorkerResponse>);
  }
}

const workers: MockWorker[] = [];
const map = (uid: string, marker = 0): RoadPuzzleMap => ({
  uid,
  name: uid,
  deck: { straight: 1 + marker, longCurve: 0, shortCurve: 0 },
  tiles: [],
  fixedRails: [],
});

const solution = {
  paretoVectors: [],
  minimumVector: { straight: 1, longCurve: 0, shortCurve: 0 },
  witness: [],
  minimumTiles: 1,
  maximumTiles: 1,
  expectedTiles: 1,
  minimumStickers: 150,
  maximumStickers: 150,
  expectedStickers: 150,
};

beforeEach(() => {
  jest.clearAllMocks();
  workers.length = 0;
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    writable: true,
    value: class extends MockWorker {
      constructor() {
        super();
        workers.push(this);
      }
    },
  });
});

describe("useRoadPuzzleStats", () => {
  it("calculates in a worker and reuses successful results for the session", async () => {
    const input = map("hook-session-cache");
    const inputMaps = [input];
    const first = renderHook(() => useRoadPuzzleStats(inputMaps));
    expect(first.result.current.status).toBe("pending");
    expect(workers).toHaveLength(1);
    expect(workers[0]?.request?.maps).toEqual([input]);

    act(() => {
      workers[0]?.send({ type: "map-result", generation: workers[0]!.request!.generation, uid: input.uid, result: solution });
      workers[0]?.send({ type: "done", generation: workers[0]!.request!.generation, elapsedMs: 42 });
    });
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    expect(first.result.current.elapsedMs).toBe(42);
    first.unmount();

    const second = renderHook(() => useRoadPuzzleStats(inputMaps));
    expect(second.result.current.status).toBe("ready");
    expect(second.result.current.resultsByUid[input.uid]).toEqual(solution);
    expect(workers).toHaveLength(1);
  });

  it("discards messages from a prior input and retries a failed worker", async () => {
    const firstMap = map("hook-stale-a");
    const nextMap = map("hook-stale-b", 1);
    const view = renderHook(({ selected }) => {
      const selectedMaps = useMemo(() => [selected], [selected]);
      return useRoadPuzzleStats(selectedMaps);
    }, { initialProps: { selected: firstMap } });
    const staleWorker = workers[0]!;

    view.rerender({ selected: nextMap });
    await waitFor(() => expect(workers).toHaveLength(2));
    expect(staleWorker.terminated).toBe(true);
    act(() => staleWorker.send({ type: "done", generation: staleWorker.request!.generation, elapsedMs: 1 }));
    expect(view.result.current.status).toBe("pending");

    const currentWorker = workers[1]!;
    act(() => currentWorker.send({ type: "error", generation: currentWorker.request!.generation }));
    await waitFor(() => expect(view.result.current.status).toBe("failed"));

    act(() => view.result.current.retry());
    await waitFor(() => expect(workers).toHaveLength(3));
    expect(view.result.current.status).toBe("pending");
  });
});
