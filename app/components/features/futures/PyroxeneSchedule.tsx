import dayjs from "dayjs";
import { useMemo } from "react";
import type { PyroxenePlannerOptions } from "~/models/pyroxene-planner";
import { EmptyView, SubTitle } from "~/components/primitives";
import PyroxeneChart from "./PyroxeneChart";
import { buildTimeline, type PickupResources } from "~/models/pyroxene-timeline";
import PyroxeneAvailableOneTimePackages from "./PyroxeneAvailableOneTimePackages";
import PyroxeneInitialResources from "./PyroxeneInitialResources";
import PyroxeneTimelineEvent from "./PyroxeneTimelineEvent";
import PyroxeneTimelineResources from "./PyroxeneTimelineResources";
import type { PyroxeneScheduleItem } from "./types";

type PyroxeneScheduleProps = {
  initialDate: Date | null;
  initialResources: PickupResources;
  eventDataMap: Map<string, { completed: boolean; expectedTrials: number | null }>;
  scheduleItems: PyroxeneScheduleItem[];
  options: PyroxenePlannerOptions;

  onPickupComplete: (eventUid: string | null, resources: PickupResources) => void;
  onDeletePickupComplete: (eventUid: string) => void;
  onDeleteItem: (itemUid: string) => void;
  onUpdateEventData: (eventUid: string, data: { expectedTrials?: number | null }) => void;
};

const deletableTimelineSourceTypes = new Set(["buy", "package_onetime", "package_daily", "package_ap", "attendance", "other"]);
const availablePackageSourceTypes = new Set(["package_onetime", "package_ap"]);

function getAvailablePackageDate({
  date,
  repeatIntervalDays,
  autoRepurchase,
  currentDate,
}: {
  date: Date;
  repeatIntervalDays?: number;
  autoRepurchase?: boolean;
  currentDate: dayjs.Dayjs;
}) {
  const startDate = dayjs(date);
  if (!autoRepurchase || !repeatIntervalDays || repeatIntervalDays <= 0 || startDate.isAfter(currentDate)) {
    return startDate;
  }

  const elapsedDays = Math.max(0, currentDate.diff(startDate, "day"));
  const cycleCount = Math.floor(elapsedDays / repeatIntervalDays);
  return startDate.add(cycleCount * repeatIntervalDays, "day");
}

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

  // 적용 중인 패키지는 삭제가 가능하도록 별도 레이아웃에서 표시
  const availableOneTimePackages = useMemo(() => {
    const currentDate = initialDate ? dayjs(initialDate) : dayjs();
    return scheduleItems.flatMap((item) => {
      const onetimePackageGain =
        item.onetimeGain && availablePackageSourceTypes.has(item.onetimeGain.source) ? item.onetimeGain : null;
      const repeatedPackageGain =
        item.repeatedGain && availablePackageSourceTypes.has(item.repeatedGain.source) ? item.repeatedGain : null;
      const packageGain = onetimePackageGain ?? repeatedPackageGain;

      if (!packageGain?.uid) {
        return [];
      }

      const packageDate = getAvailablePackageDate({
        date: packageGain.date,
        repeatIntervalDays: repeatedPackageGain?.uid === packageGain.uid ? repeatedPackageGain.repeatIntervalDays : undefined,
        autoRepurchase: packageGain.autoRepurchase,
        currentDate,
      });
      const activeDays = packageGain.source === "package_ap" ? 14 : 30;
      const since = currentDate.subtract(activeDays, "day");
      if (!packageDate.isAfter(since) || !packageDate.isBefore(currentDate)) {
        return [];
      }

      return [
        {
          uid: packageGain.uid,
          date: packageDate.toDate(),
          description: packageGain.description,
          pyroxeneDelta: packageGain.pyroxeneDelta ?? 0,
        },
      ];
    }).sort((a, b) => {
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return a.description.localeCompare(b.description, "ko");
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
        text="청휘석 시뮬레이션"
        description="설정한 목표와, 상위/하위 10% 범위의 시뮬레이션 결과에요"
      />
      <PyroxeneChart timeline={timeline} />

      <SubTitle
        text="타임라인"
        description="미래시 페이지에서 등록한 관심 학생의 모집 시점의 예상 청휘석을 확인할 수 있어요"
      />
      {timeline.every(({ source }) => source.type !== "event" && !options.timeline.display.includes(source.type)) && (
        <EmptyView text="표시할 일정이 없어요. 미래시에서 관심 학생을 등록하거나 수급 계획을 추가해보세요." />
      )}
      {timeline.map(({ date, accumulatedResources, resourceDelta, source }, index) => {
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
          const itemUid = source.uid && deletableTimelineSourceTypes.has(source.type) ? source.uid : undefined;
          return (
            <PyroxeneTimelineResources
              key={source.uid ? `${source.uid}-${date.toISOString()}-${index}` : `${source.description}-${date.toISOString()}-${index}`}
              date={date}
              description={source.description}
              resources={resourceDelta}
              itemUid={itemUid}
              onDeleteItem={onDeleteItem}
            />
          );
        }
        return null;
      })}
    </>
  );
}
