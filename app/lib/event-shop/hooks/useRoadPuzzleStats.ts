import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoadPuzzleMap } from "~/domain/event-shop";
import type { RoadPuzzleSolution } from "~/domain/road-puzzle/solver";
import type { RoadPuzzleStatsWorkerResponse } from "../road-puzzle-stats-worker.shared";

type RoadPuzzleStatsStatus = "idle" | "pending" | "ready" | "failed";

type RoadPuzzleStatsState = {
  signature: string;
  status: RoadPuzzleStatsStatus;
  resultsByUid: Record<string, RoadPuzzleSolution | null>;
  completedMaps: number;
  totalMaps: number;
  elapsedMs: number | null;
};

export type RoadPuzzleStatsCalculation = Omit<RoadPuzzleStatsState, "signature"> & { retry: () => void };

const sessionCache = new Map<string, RoadPuzzleSolution | null>();

function mapKey(map: RoadPuzzleMap): string {
  return `${map.uid}:${JSON.stringify(map)}`;
}

function cachedResults(maps: readonly RoadPuzzleMap[]): Record<string, RoadPuzzleSolution | null> {
  const results: Record<string, RoadPuzzleSolution | null> = {};
  for (const map of maps) {
    const key = mapKey(map);
    if (sessionCache.has(key)) results[map.uid] = sessionCache.get(key) ?? null;
  }
  return results;
}

function areAllMapsCached(maps: readonly RoadPuzzleMap[], results: Readonly<Record<string, unknown>>): boolean {
  return maps.every((map) => Object.hasOwn(results, map.uid));
}

export function useRoadPuzzleStats(maps: readonly RoadPuzzleMap[], enabled = true): RoadPuzzleStatsCalculation {
  const signature = useMemo(() => maps.map(mapKey).join("\u001f"), [maps]);
  const generationRef = useRef(0);
  const [retryToken, setRetryToken] = useState(0);
  const requestKey = `${signature}\u001e${retryToken}`;
  const [state, setState] = useState<RoadPuzzleStatsState>({
    signature: "",
    status: "idle",
    resultsByUid: {},
    completedMaps: 0,
    totalMaps: 0,
    elapsedMs: null,
  });

  const retry = useCallback(() => setRetryToken((value) => value + 1), []);

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!enabled || maps.length === 0) {
      setState({
        signature: requestKey,
        status: "idle",
        resultsByUid: {},
        completedMaps: 0,
        totalMaps: maps.length,
        elapsedMs: null,
      });
      return;
    }

    const resultsByUid = cachedResults(maps);
    if (areAllMapsCached(maps, resultsByUid)) {
      setState({
        signature: requestKey,
        status: "ready",
        resultsByUid,
        completedMaps: maps.length,
        totalMaps: maps.length,
        elapsedMs: 0,
      });
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL("../road-puzzle-stats.worker.ts", import.meta.url), { type: "module" });
    } catch {
      setState({
        signature: requestKey,
        status: "failed",
        resultsByUid,
        completedMaps: Object.keys(resultsByUid).length,
        totalMaps: maps.length,
        elapsedMs: null,
      });
      return;
    }

    const missingMaps = maps.filter((map) => !Object.hasOwn(resultsByUid, map.uid));
    setState({
      signature: requestKey,
      status: "pending",
      resultsByUid,
      completedMaps: maps.length - missingMaps.length,
      totalMaps: maps.length,
      elapsedMs: null,
    });

    worker.onmessage = (event: MessageEvent<RoadPuzzleStatsWorkerResponse>) => {
      const message = event.data;
      if (message.generation !== generation || generationRef.current !== generation) return;
      if (message.type === "map-result") {
        const map = missingMaps.find((entry) => entry.uid === message.uid);
        if (map) sessionCache.set(mapKey(map), message.result);
        setState((current) => ({
          ...current,
          resultsByUid: { ...current.resultsByUid, [message.uid]: message.result },
        }));
      } else if (message.type === "progress") {
        setState((current) => ({
          ...current,
          completedMaps: maps.length - missingMaps.length + message.completedMaps,
        }));
      } else if (message.type === "done") {
        setState((current) => ({
          ...current,
          status: "ready",
          completedMaps: maps.length,
          elapsedMs: message.elapsedMs,
        }));
      } else {
        setState((current) => ({ ...current, status: "failed" }));
      }
    };
    worker.onerror = () => {
      if (generationRef.current === generation) setState((current) => ({ ...current, status: "failed" }));
    };
    worker.postMessage({ type: "calculate", generation, maps: missingMaps });

    return () => {
      generationRef.current += 1;
      worker.terminate();
    };
  }, [enabled, maps, requestKey]);

  const current = state.signature === requestKey ? state : null;
  const fallbackResults = useMemo(() => cachedResults(maps), [maps]);
  if (!enabled || maps.length === 0) {
    return { status: "idle", resultsByUid: {}, completedMaps: 0, totalMaps: maps.length, elapsedMs: null, retry };
  }
  if (!current) {
    const complete = areAllMapsCached(maps, fallbackResults);
    return {
      status: complete ? "ready" : "pending",
      resultsByUid: fallbackResults,
      completedMaps: Object.keys(fallbackResults).length,
      totalMaps: maps.length,
      elapsedMs: complete ? 0 : null,
      retry,
    };
  }
  return { ...current, retry };
}
