import dayjs from "dayjs";
import type { PyroxeneCalculationOptions } from "~/models/pyroxene-planner";
import type { PickupResources, Timeline, TimelineSource } from "~/domain/pyroxene-timeline";
import type { PyroxeneScheduleItem } from "./types";

// dayjs 인스턴스는 구조화 복제로 워커 경계를 넘길 수 없으므로
// 날짜를 epoch ms로 직렬화해 주고받습니다.
export type SerializedTimelineEntry = {
  dateMs: number;
  source: TimelineSource;
  accumulatedResources: PickupResources;
  accumulatedResourcesBand?: {
    optimistic: PickupResources;
    pessimistic: PickupResources;
  };
  resourceDelta: PickupResources;
};

export type PyroxeneTimelineWorkerRequest = {
  id: number;
  initialResources: PickupResources;
  initialDate: Date | null;
  eventDataMap: Map<string, { completed: boolean; expectedTrials: number | null }>;
  scheduleItems: PyroxeneScheduleItem[];
  options: PyroxeneCalculationOptions;
  collectedSourceKeys: string[];
};

export type PyroxeneTimelineWorkerResponse = {
  id: number;
  timeline: SerializedTimelineEntry[];
};

export function serializeTimeline(timeline: Timeline): SerializedTimelineEntry[] {
  return timeline.map((entry) => ({
    dateMs: entry.date.valueOf(),
    source: entry.source,
    accumulatedResources: entry.accumulatedResources,
    accumulatedResourcesBand: entry.accumulatedResourcesBand,
    resourceDelta: entry.resourceDelta,
  }));
}

export function rehydrateTimeline(entries: SerializedTimelineEntry[]): Timeline {
  return entries.map((entry) => ({
    date: dayjs(entry.dateMs),
    source: entry.source,
    accumulatedResources: entry.accumulatedResources,
    accumulatedResourcesBand: entry.accumulatedResourcesBand,
    resourceDelta: entry.resourceDelta,
  }));
}
