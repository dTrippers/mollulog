import dayjs from "dayjs";
import { useMemo } from "react";
import type { PyroxenePlannerOptions } from "~/models/pyroxene-planner";
import { EmptyView, SubTitle } from "~/components/primitives";
import PyroxeneChart from "./PyroxeneChart";
import { buildTimeline, type PickupResources, type PyroxeneScheduleItem } from "~/models/pyroxene-timeline";
import PyroxeneAvailableOneTimePackages from "./PyroxeneAvailableOneTimePackages";
import PyroxeneInitialResources from "./PyroxeneInitialResources";
import PyroxeneTimelineEvent from "./PyroxeneTimelineEvent";
import PyroxeneTimelineResources from "./PyroxeneTimelineResources";

type PyroxeneScheduleProps = {
  initialDate: Date | null;
  initialResources: PickupResources;
  eventDataMap: Map<string, { completed: boolean; expectedTrials: number | null }>;
  scheduleItems: PyroxeneScheduleItem[];
  options: PyroxenePlannerOptions;

  onPickupComplete: (eventUid: string | null, resources: PickupResources) => void;
  onDeletePickupComplete: (eventUid: string) => void;
  onDeleteItem: (itemUid: string) => void;
  onUpdateEventData: (eventUid: string, data: { completed?: boolean; expectedTrials?: number | null }) => void;
};

export default function PyroxeneSchedule({
  initialDate,
  initialResources,
  eventDataMap,
  scheduleItems,
  options,
  onPickupComplete,
  onDeletePickupComplete,
  onDeleteItem,
  onUpdateEventData,
}: PyroxeneScheduleProps) {
  const timeline = useMemo(() => {
    return buildTimeline(initialResources, initialDate ?? new Date(), eventDataMap, scheduleItems, options);
  }, [initialDate, initialResources, eventDataMap, scheduleItems, options]);

  // 30일 이내의 월간 패키지는 삭제가 가능하도록 별도 레이아웃에서 표시
  const availableOneTimePackages = useMemo(() => {
    const since = dayjs().subtract(30, "day");
    const currentDate = initialDate ? dayjs(initialDate) : dayjs();
    return scheduleItems.flatMap((item) => {
      const { onetimeGain } = item;
      if (onetimeGain?.source !== "package_onetime" || !onetimeGain.uid) {
        return [];
      }

      const packageDate = dayjs(onetimeGain.date);
      if (!packageDate.isAfter(since) || !packageDate.isBefore(currentDate)) {
        return [];
      }

      return [
        {
          uid: onetimeGain.uid,
          date: onetimeGain.date,
          description: onetimeGain.description,
          pyroxeneDelta: onetimeGain.pyroxeneDelta ?? 0,
        },
      ];
    });
  }, [initialDate, scheduleItems]);

  return (
    <>
      <SubTitle
        text="현재 보유 재화"
        description={
          initialDate
            ? `마지막 입력 : ${dayjs(initialDate).format("YYYY-MM-DD HH:mm")}`
            : "현재 보유중인 재화 수량을 입력해주세요"
        }
      />
      {!initialDate && (
        <div className="my-4 p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-green-800 dark:text-green-200">현재 보유중인 재화 수량을 입력해주세요</p>
        </div>
      )}
      <PyroxeneInitialResources
        resources={initialResources}
        onUpdateResources={(resources) => onPickupComplete(null, resources)}
      />
      {availableOneTimePackages.length > 0 && (
        <PyroxeneAvailableOneTimePackages packages={availableOneTimePackages} onDeleteItem={onDeleteItem} />
      )}

      <SubTitle
        text="재화 획득/소비 계획"
        description="미래시 페이지에서 관심 학생을 등록하면 모집 시점의 예상 청휘석을 계산할 수 있어요"
      />
      <PyroxeneChart timeline={timeline} />
      {timeline.every(({ source }) => source.type !== "event" && !options.timeline.display.includes(source.type)) && (
        <EmptyView text="표시할 일정이 없어요. 미래시에서 관심 학생을 등록하거나 수급 계획을 추가해보세요." />
      )}
      {timeline.map(({ date, accumulatedResources, resourceDelta, source }) => {
        if (source.type !== "event" && !options.timeline.display.includes(source.type)) {
          return null;
        }

        if (source.event) {
          const { event } = source;
          const eventData = eventDataMap.get(event.uid);
          return (
            <PyroxeneTimelineEvent
              key={`event-${event.uid}`}
              event={event}
              completed={eventData?.completed ?? false}
              expectedTrials={eventData?.expectedTrials ?? null}
              pickupChance={options.event.pickupChance}
              accumulatedResources={accumulatedResources}
              resourceDelta={resourceDelta}
              onDeletePickupComplete={onDeletePickupComplete}
              onPickupComplete={onPickupComplete}
              onUpdateEventData={onUpdateEventData}
            />
          );
        }
        if (source.description) {
          return (
            <PyroxeneTimelineResources
              key={`${source.description}-${date.toISOString()}`}
              date={date}
              description={source.description}
              resources={resourceDelta}
              itemUid={source.uid}
              onDeleteItem={onDeleteItem}
            />
          );
        }
        return null;
      })}
    </>
  );
}
