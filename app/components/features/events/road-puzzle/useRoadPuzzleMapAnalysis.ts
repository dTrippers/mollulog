import { useCallback, useEffect, useRef, useState } from "react";
import type { RoadPuzzleMap, RoadPuzzleCoordinate } from "~/domain/event-shop";
import type { RailCounts, RoadPuzzleInteractiveAnalysis } from "~/domain/road-puzzle/solver";
import type { RoadPuzzleAnalysisWorkerResponse } from "./road-puzzle-analysis-worker.shared";

type AnalysisStatus = "idle" | "pending" | "ready" | "failed";

type AnalysisState = {
  signature: string;
  mapUid: string | null;
  status: AnalysisStatus;
  analysis: RoadPuzzleInteractiveAnalysis | null;
};

export type RoadPuzzleMapAnalysis = {
  status: AnalysisStatus;
  analysis: RoadPuzzleInteractiveAnalysis | null;
  analysisMapUid: string | null;
  retry: () => void;
};

export function useRoadPuzzleMapAnalysis(
  map: RoadPuzzleMap,
  marks: readonly RoadPuzzleCoordinate[],
  remaining: RailCounts | null,
  enabled: boolean,
): RoadPuzzleMapAnalysis {
  const workerRef = useRef<Worker | null>(null);
  const latestRequestIdRef = useRef(0);
  const requestRef = useRef({ map, marks: [...marks], remaining });
  const workerFailedRef = useRef(false);
  const [workerGeneration, setWorkerGeneration] = useState(0);
  const [workerReadyGeneration, setWorkerReadyGeneration] = useState<number | null>(null);
  const [state, setState] = useState<AnalysisState>({
    signature: "",
    mapUid: null,
    status: "idle",
    analysis: null,
  });

  requestRef.current = { map, marks: [...marks], remaining };
  const signature = JSON.stringify([
    map,
    marks.map(({ x, y, z }) => `${x},${y},${z}`).sort(),
    remaining,
  ]);

  useEffect(() => {
    let worker: Worker | null = null;
    workerFailedRef.current = false;
    if (!enabled) {
      workerRef.current = null;
      setWorkerReadyGeneration(null);
      return;
    }
    try {
      worker = new Worker(new URL("./road-puzzle-analysis.worker.ts", import.meta.url), {
        type: "module",
        name: `road-puzzle-analysis-${workerGeneration}`,
      });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<RoadPuzzleAnalysisWorkerResponse>) => {
        const response = event.data;
        if (workerRef.current !== worker || response.requestId !== latestRequestIdRef.current) return;
        if (response.type === "error") {
          setState((current) => ({ ...current, status: "failed" }));
          return;
        }
        setState((current) => ({ ...current, status: "ready", analysis: response.analysis }));
      };
      worker.onerror = () => {
        if (workerRef.current !== worker) return;
        workerFailedRef.current = true;
        setState((current) => ({ ...current, status: "failed" }));
      };
      worker.onmessageerror = () => {
        if (workerRef.current !== worker) return;
        workerFailedRef.current = true;
        setState((current) => ({ ...current, status: "failed" }));
      };
    } catch {
      workerRef.current = null;
      workerFailedRef.current = true;
    }

    setWorkerReadyGeneration(workerGeneration);
    return () => {
      if (workerRef.current === worker) workerRef.current = null;
      worker?.terminate();
    };
  }, [enabled, workerGeneration]);

  useEffect(() => {
    if (workerReadyGeneration !== workerGeneration) return;
    if (!enabled) {
      latestRequestIdRef.current += 1;
      setState({ signature, mapUid: map.uid, status: "idle", analysis: null });
      return;
    }
    if (workerFailedRef.current) {
      latestRequestIdRef.current += 1;
      setState((current) => ({ ...current, signature, mapUid: map.uid, status: "failed" }));
      return;
    }

    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    setState((current) => ({
      signature,
      mapUid: map.uid,
      status: "pending",
      analysis: current.mapUid === map.uid ? current.analysis : null,
    }));

    const worker = workerRef.current;
    if (!worker) {
      setState((current) => ({ ...current, status: "failed" }));
      return;
    }
    try {
      const request = requestRef.current;
      worker.postMessage({ type: "analyze", requestId, ...request, marks: [...request.marks] });
    } catch {
      setState((current) => ({ ...current, status: "failed" }));
    }

    return () => {
      if (latestRequestIdRef.current === requestId) latestRequestIdRef.current += 1;
    };
  }, [enabled, map.uid, signature, workerGeneration, workerReadyGeneration]);

  const retry = useCallback(() => setWorkerGeneration((generation) => generation + 1), []);
  if (!enabled) return { status: "idle", analysis: null, analysisMapUid: null, retry };
  if (state.signature !== signature || state.mapUid !== map.uid) {
    return {
      status: "pending",
      analysis: state.mapUid === map.uid ? state.analysis : null,
      analysisMapUid: state.mapUid,
      retry,
    };
  }
  return { status: state.status, analysis: state.analysis, analysisMapUid: state.mapUid, retry };
}
