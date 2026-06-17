import { useCallback, useEffect, useRef, useState } from "react";
import type { PyroxeneCalculationOptions } from "~/models/pyroxene-planner";
import { type PickupResources, type Timeline, buildTimeline } from "~/models/pyroxene-timeline";
import {
  type PyroxeneTimelineWorkerRequest,
  type PyroxeneTimelineWorkerResponse,
  rehydrateTimeline,
} from "./pyroxene-timeline-worker.shared";
import type { PyroxeneScheduleItem } from "./types";

type UsePyroxeneTimelineArgs = {
  initialResources: PickupResources;
  initialDate: Date | null;
  eventDataMap: Map<string, { completed: boolean; expectedTrials: number | null }>;
  scheduleItems: PyroxeneScheduleItem[];
  options: PyroxeneCalculationOptions;
};

/**
 * buildTimeline 계산을 Web Worker로 위임해 메인 스레드 블로킹을 막습니다.
 * - 첫 렌더(SSR/하이드레이션)는 동기 계산 결과로 채워 차트가 비지 않게 합니다.
 * - 이후 입력 변경은 워커로 보내고, 가장 최신 요청의 결과만 반영합니다.
 * - 워커를 쓸 수 없는 환경에서는 동기 계산으로 폴백합니다.
 */
export function usePyroxeneTimeline({
  initialResources,
  initialDate,
  eventDataMap,
  scheduleItems,
  options,
}: UsePyroxeneTimelineArgs): { timeline: Timeline; pending: boolean } {
  const computeSync = useCallback(
    () => buildTimeline(initialResources, initialDate ?? new Date(), eventDataMap, scheduleItems, options),
    [initialResources, initialDate, eventDataMap, scheduleItems, options],
  );

  const [timeline, setTimeline] = useState<Timeline>(computeSync);
  const [pending, setPending] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const skipInitialRecomputeRef = useRef(true);

  // 워커 에러 핸들러에서 항상 최신 입력으로 동기 계산할 수 있도록 참조를 갱신합니다.
  const computeSyncRef = useRef(computeSync);
  computeSyncRef.current = computeSync;

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL("./pyroxene-timeline.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return;
    }
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<PyroxeneTimelineWorkerResponse>) => {
      // 최신 요청의 결과만 반영합니다(이전 요청의 stale 결과는 무시).
      if (event.data.id !== requestIdRef.current) {
        return;
      }
      setTimeline(rehydrateTimeline(event.data.timeline));
      setPending(false);
    };
    worker.onerror = () => {
      // 워커 로드/실행 실패 시 메인 스레드 동기 계산으로 폴백하고, 이후 계산도 동기로 전환합니다.
      workerRef.current = null;
      setTimeline(computeSyncRef.current());
      setPending(false);
    };
    return () => {
      workerRef.current = null;
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    // 첫 실행은 useState 초기화에서 이미 동기 계산했으므로 건너뜁니다.
    if (skipInitialRecomputeRef.current) {
      skipInitialRecomputeRef.current = false;
      return;
    }

    const worker = workerRef.current;
    if (!worker) {
      setTimeline(computeSync());
      return;
    }

    const id = ++requestIdRef.current;
    setPending(true);
    const request: PyroxeneTimelineWorkerRequest = {
      id,
      initialResources,
      initialDate,
      eventDataMap,
      scheduleItems,
      options,
    };
    worker.postMessage(request);
  }, [initialResources, initialDate, eventDataMap, scheduleItems, options, computeSync]);

  return { timeline, pending };
}
