import { buildTimeline } from "~/models/pyroxene-timeline";
import {
  type PyroxeneTimelineWorkerRequest,
  type PyroxeneTimelineWorkerResponse,
  serializeTimeline,
} from "./pyroxene-timeline-worker.shared";

// 무거운 청휘석 타임라인 계산을 메인 스레드에서 떼어내기 위한 전용 워커입니다.
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<PyroxeneTimelineWorkerRequest>) => void) | null;
  postMessage: (message: PyroxeneTimelineWorkerResponse) => void;
};

workerScope.onmessage = (event) => {
  const { id, initialResources, initialDate, eventDataMap, scheduleItems, options, collectedSourceKeys } = event.data;
  const timeline = buildTimeline(
    initialResources,
    initialDate ?? new Date(),
    eventDataMap,
    scheduleItems,
    options,
    undefined,
    collectedSourceKeys,
  );
  workerScope.postMessage({ id, timeline: serializeTimeline(timeline) });
};
