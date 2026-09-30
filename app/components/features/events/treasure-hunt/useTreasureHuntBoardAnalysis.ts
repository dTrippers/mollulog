import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TreasureHuntBoardAnalysis,
  TreasureHuntBoardObservation,
  TreasureHuntComposition,
} from "~/domain/treasure-hunt";
import type { TreasureHuntBoardWorkerResponse } from "./treasure-hunt-board-worker.shared";

export type TreasureHuntAnalysisState = {
  status: "calculating" | "ok" | "inconsistent" | "failed";
  result: TreasureHuntBoardAnalysis | null;
  showSpinner: boolean;
};

export function useTreasureHuntBoardAnalysis(
  composition: TreasureHuntComposition,
  observation: TreasureHuntBoardObservation,
  enabled = true,
) {
  const workerRef = useRef<Worker | null>(null);
  const latestRequestIdRef = useRef(0);
  const spinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workerFailedRef = useRef(false);
  const hasReceivedResultRef = useRef(false);
  const [workerGeneration, setWorkerGeneration] = useState(0);
  const [workerReadyGeneration, setWorkerReadyGeneration] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<TreasureHuntAnalysisState>({
    status: "calculating",
    result: null,
    showSpinner: true,
  });

  useEffect(() => {
    let worker: Worker | null = null;
    workerFailedRef.current = false;

    try {
      worker = new Worker(new URL("./treasure-hunt-board.worker.ts", import.meta.url), {
        type: "module",
        name: `treasure-hunt-board-${workerGeneration}`,
      });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<TreasureHuntBoardWorkerResponse>) => {
        const response = event.data;
        if (workerRef.current !== worker) return;
        if (workerFailedRef.current) return;
        if (response.requestId !== latestRequestIdRef.current) return;
        clearSpinnerTimer(spinnerTimerRef);
        if (response.type === "error") {
          setAnalysis((current) => ({ ...current, status: "failed", showSpinner: false }));
          return;
        }
        hasReceivedResultRef.current = true;
        setAnalysis({
          status: response.status,
          result: response,
          showSpinner: false,
        });
      };
      worker.onerror = () => {
        if (workerRef.current !== worker) return;
        workerFailedRef.current = true;
        clearSpinnerTimer(spinnerTimerRef);
        setAnalysis((current) => ({ ...current, status: "failed", showSpinner: false }));
      };
      worker.onmessageerror = () => {
        if (workerRef.current !== worker) return;
        workerFailedRef.current = true;
        clearSpinnerTimer(spinnerTimerRef);
        setAnalysis((current) => ({ ...current, status: "failed", showSpinner: false }));
      };
    } catch {
      workerRef.current = null;
      workerFailedRef.current = true;
    }

    setWorkerReadyGeneration(workerGeneration);
    return () => {
      clearSpinnerTimer(spinnerTimerRef);
      if (workerRef.current === worker) workerRef.current = null;
      worker?.terminate();
    };
  }, [workerGeneration]);

  useEffect(() => {
    if (workerReadyGeneration === null) return;
    if (!enabled) {
      latestRequestIdRef.current += 1;
      clearSpinnerTimer(spinnerTimerRef);
      setAnalysis({ status: "inconsistent", result: null, showSpinner: false });
      return;
    }
    if (workerFailedRef.current) {
      latestRequestIdRef.current += 1;
      clearSpinnerTimer(spinnerTimerRef);
      setAnalysis((current) => ({ ...current, status: "failed", showSpinner: false }));
      return;
    }
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    const showSpinnerImmediately = !hasReceivedResultRef.current;
    setAnalysis((current) => ({ ...current, status: "calculating", showSpinner: showSpinnerImmediately }));

    const worker = workerRef.current;
    if (!worker) {
      setAnalysis((current) => ({ ...current, status: "failed", showSpinner: false }));
      return;
    }

    if (!showSpinnerImmediately) {
      spinnerTimerRef.current = setTimeout(() => {
        if (latestRequestIdRef.current === requestId) {
          setAnalysis((current) => ({ ...current, showSpinner: true }));
        }
      }, 300);
    }

    try {
      worker.postMessage({ type: "analyze", requestId, composition, observation });
    } catch {
      clearSpinnerTimer(spinnerTimerRef);
      setAnalysis((current) => ({ ...current, status: "failed", showSpinner: false }));
    }

    return () => clearSpinnerTimer(spinnerTimerRef);
  }, [composition, enabled, observation, workerReadyGeneration]);

  const retry = useCallback(() => setWorkerGeneration((generation) => generation + 1), []);
  return { ...analysis, retry };
}

function clearSpinnerTimer(timerRef: { current: ReturnType<typeof setTimeout> | null }) {
  if (timerRef.current !== null) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}
