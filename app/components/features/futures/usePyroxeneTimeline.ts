import { useCallback, useEffect, useRef, useState } from "react";
import type { PyroxeneCalculationOptions } from "~/domain/pyroxene-planner";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { buildTimeline, type PickupResources, type Timeline } from "~/domain/pyroxene-timeline";
import {
  type PyroxeneTimelineWorkerRequest,
  type PyroxeneTimelineWorkerResponse,
  rehydrateTimeline,
} from "./pyroxene-timeline-worker.shared";

type UsePyroxeneTimelineArgs = {
  initialResources: PickupResources;
  initialDate: Date | null;
  eventDataMap: Map<string, { completed: boolean; expectedTrials: number | null }>;
  scheduleItems: PyroxeneScheduleItem[];
  options: PyroxeneCalculationOptions;
  collectedSourceKeys: string[];
  endDate?: Date;
};

/**
 * buildTimeline 계산을 Web Worker로 위임해 메인 스레드 블로킹을 막습니다.
 * - 첫 렌더부터 워커로 보내 라우트 진입/내부 링크 이동을 막지 않습니다.
 * - 입력 변경은 워커로 보내고, 가장 최신 요청의 결과만 반영합니다.
 * - 워커를 쓸 수 없는 환경에서는 동기 계산으로 폴백합니다.
 */
export function usePyroxeneTimeline({
  initialResources,
  initialDate,
  eventDataMap,
  scheduleItems,
  options,
  collectedSourceKeys,
  endDate,
}: UsePyroxeneTimelineArgs): { timeline: Timeline; pending: boolean; error: boolean } {
  const computeSync = useCallback(
    () =>
      buildTimeline(
        initialResources,
        initialDate ?? new Date(),
        eventDataMap,
        scheduleItems,
        options,
        undefined,
        collectedSourceKeys,
        endDate,
      ),
    [initialResources, initialDate, eventDataMap, scheduleItems, options, collectedSourceKeys, endDate],
  );

  const [timeline, setTimeline] = useState<Timeline>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  // 워커 에러 핸들러에서 항상 최신 입력으로 동기 계산할 수 있도록 참조를 갱신합니다.
  const computeSyncRef = useRef(computeSync);
  computeSyncRef.current = computeSync;

  const calculateSynchronously = useCallback(() => {
    setPending(true);
    try {
      setTimeline(computeSyncRef.current());
      setError(false);
    } catch {
      setTimeline([]);
      setError(true);
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL("./pyroxene-timeline.worker.ts", import.meta.url), { type: "module" });
    } catch {
      calculateSynchronously();
      return;
    }
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<PyroxeneTimelineWorkerResponse>) => {
      // 최신 요청의 결과만 반영합니다(이전 요청의 stale 결과는 무시).
      if (event.data.id !== requestIdRef.current) {
        return;
      }
      try {
        setTimeline(rehydrateTimeline(event.data.timeline));
        setError(false);
      } catch {
        setTimeline([]);
        setError(true);
      }
      setPending(false);
    };
    worker.onerror = () => {
      // 워커 로드/실행 실패 시 메인 스레드 동기 계산으로 폴백하고, 이후 계산도 동기로 전환합니다.
      workerRef.current = null;
      calculateSynchronously();
    };
    return () => {
      workerRef.current = null;
      worker.terminate();
    };
  }, [calculateSynchronously]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) {
      calculateSynchronously();
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
      collectedSourceKeys,
      endDate,
    };
    try {
      worker.postMessage(request);
    } catch {
      worker.terminate();
      workerRef.current = null;
      calculateSynchronously();
    }
  }, [initialResources, initialDate, eventDataMap, scheduleItems, options, collectedSourceKeys, endDate, computeSync, calculateSynchronously]);

  return { timeline, pending, error };
}
