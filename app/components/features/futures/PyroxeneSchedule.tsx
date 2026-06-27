import dayjs from "dayjs";
import { useMemo } from "react";
import { EmptyView, SubTitle } from "~/components/primitives";
import { collectedSourceKeyForEventReward, collectedSourceKeyForRaid } from "~/domain/pyroxene-sources";
import type { PyroxeneCalculationOptions, PyroxenePlannerOptions } from "~/models/pyroxene-planner";
import { PYROXENE, type PickupResources } from "~/domain/pyroxene-timeline";
import PyroxeneAvailableOneTimePackages from "./PyroxeneAvailableOneTimePackages";
import PyroxeneChart from "./PyroxeneChart";
import PyroxeneInitialResources from "./PyroxeneInitialResources";
import PyroxeneTimelineEvent from "./PyroxeneTimelineEvent";
import PyroxeneTimelineResources from "./PyroxeneTimelineResources";
import type { PyroxeneCollectedSourceCandidate, PyroxeneScheduleItem } from "./types";
import { usePyroxeneTimeline } from "./usePyroxeneTimeline";

type PyroxeneScheduleProps = {
  initialDate: Date | null;
  initialResources: PickupResources;
  eventDataMap: Map<string, { completed: boolean; expectedTrials: number | null }>;
  scheduleItems: PyroxeneScheduleItem[];
  options: PyroxenePlannerOptions;
  collectedSourceKeys: string[];

  onPickupComplete: (eventUid: string | null, resources: PickupResources, collectedSourceKeys?: string[]) => void;
  onDeletePickupComplete: (eventUid: string) => void;
  onDeleteItem: (itemUid: string) => void;
  onUpdateEventData: (eventUid: string, data: { expectedTrials?: number | null }) => void;
  onCollectedSourceChange: (sourceKey: string, collected: boolean) => void;
};

const deletableTimelineSourceTypes = new Set([
  "buy",
  "package_onetime",
  "package_daily",
  "package_ap",
  "attendance",
  "other",
]);
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
  collectedSourceKeys,
  onPickupComplete,
  onDeletePickupComplete,
  onDeleteItem,
  onUpdateEventData,
  onCollectedSourceChange,
}: PyroxeneScheduleProps) {
  // 표시 필터(timeline.display)는 계산 결과에 영향을 주지 않으므로 계산 입력에서 제외합니다.
  // 이렇게 하면 표시 토글이 무거운 재계산을 유발하지 않습니다.
  const calcOptions = useMemo<PyroxeneCalculationOptions>(
    () => ({
      event: options.event,
      raid: options.raid,
      tactical: options.tactical,
      consumption: options.consumption,
    }),
    [options.event, options.raid, options.tactical, options.consumption],
  );

  const { timeline, pending: isTimelinePending } = usePyroxeneTimeline({
    initialDate,
    initialResources,
    eventDataMap,
    scheduleItems,
    options: calcOptions,
    collectedSourceKeys,
  });
  const simulationDescription =
    options.event.pickupChance === "ceil"
      ? "설정한 목표를 모두 천장으로 계산한 시뮬레이션 결과에요"
      : "설정한 목표와, 상위/하위 10% 범위의 시뮬레이션 결과에요";

  // 적용 중인 패키지는 삭제가 가능하도록 별도 레이아웃에서 표시
  const availableOneTimePackages = useMemo(() => {
    const currentDate = initialDate ? dayjs(initialDate) : dayjs();
    return scheduleItems
      .flatMap((item) => {
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
          repeatIntervalDays:
            repeatedPackageGain?.uid === packageGain.uid ? repeatedPackageGain.repeatIntervalDays : undefined,
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
      })
      .sort((a, b) => {
        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }
        return a.description.localeCompare(b.description, "ko");
      });
  }, [initialDate, scheduleItems]);

  const collectedSourceKeySet = useMemo(() => new Set(collectedSourceKeys), [collectedSourceKeys]);
  const collectableSourceKeySet = useMemo(() => {
    const currentDate = dayjs();
    const sourceKeys = new Set<string>();

    for (const item of scheduleItems) {
      if (item.event?.earnablePyroxene && !dayjs(item.event.since).isAfter(currentDate)) {
        sourceKeys.add(collectedSourceKeyForEventReward(item.event.uid));
      }

      if (
        item.raid &&
        (item.raid.type === "total_assault" || item.raid.type === "elimination") &&
        !dayjs(item.raid.since).isAfter(currentDate)
      ) {
        sourceKeys.add(collectedSourceKeyForRaid(item.raid.uid));
      }
    }

    return sourceKeys;
  }, [scheduleItems]);
  const collectedSourceDisplayResources = useMemo(() => {
    const resourcesBySourceKey = new Map<string, PickupResources>();

    for (const item of scheduleItems) {
      if (item.event?.earnablePyroxene) {
        resourcesBySourceKey.set(collectedSourceKeyForEventReward(item.event.uid), {
          pyroxene: item.event.earnablePyroxene,
          oneTimeTicket: 0,
          tenTimeTicket: 0,
        });
      }

      if (item.raid?.type === "total_assault") {
        resourcesBySourceKey.set(collectedSourceKeyForRaid(item.raid.uid), {
          pyroxene: PYROXENE.RAID_TOTAL_ASSAULT_BASE + PYROXENE.RAID_TOTAL_ASSAULT_TIER[options.raid.tier],
          oneTimeTicket: 0,
          tenTimeTicket: 0,
        });
      } else if (item.raid?.type === "elimination") {
        resourcesBySourceKey.set(collectedSourceKeyForRaid(item.raid.uid), {
          pyroxene: PYROXENE.RAID_ELIMINATION_BASE,
          oneTimeTicket: 0,
          tenTimeTicket: 1,
        });
      }
    }

    return resourcesBySourceKey;
  }, [scheduleItems, options.raid.tier]);
  const collectedSourceCandidates = useMemo<PyroxeneCollectedSourceCandidate[]>(() => {
    const currentDate = dayjs();
    const isOngoing = (
      since: NonNullable<PyroxeneScheduleItem["event"]>["since"],
      until: NonNullable<PyroxeneScheduleItem["event"]>["until"],
    ) => {
      const sinceDate = dayjs(since);
      const untilDate = dayjs(until);
      return !sinceDate.isAfter(currentDate) && untilDate.isAfter(currentDate);
    };

    return scheduleItems.flatMap((item) => {
      if (item.event?.earnablePyroxene && isOngoing(item.event.since, item.event.until)) {
        const sourceKey = collectedSourceKeyForEventReward(item.event.uid);
        if (collectedSourceKeySet.has(sourceKey)) {
          return [];
        }
        return [
          {
            sourceKey,
            title: `이벤트 클리어 보상 · ${item.event.name}`,
            description: "이미 받아 현재 보유 재화에 포함됨 → 그래프에서 중복 제외",
          },
        ];
      }

      if (
        item.raid &&
        (item.raid.type === "total_assault" || item.raid.type === "elimination") &&
        isOngoing(item.raid.since, item.raid.until)
      ) {
        const sourceKey = collectedSourceKeyForRaid(item.raid.uid);
        if (collectedSourceKeySet.has(sourceKey)) {
          return [];
        }
        return [
          {
            sourceKey,
            title: `${item.raid.type === "total_assault" ? "총력전" : "대결전"} 보상 · ${item.raid.name}`,
            description: "이미 받아 현재 보유 재화에 포함됨 → 그래프에서 중복 제외",
          },
        ];
      }

      return [];
    });
  }, [scheduleItems, collectedSourceKeySet]);

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
        collectedSourceCandidates={collectedSourceCandidates}
        onUpdateResources={(resources, selectedCollectedSourceKeys) =>
          onPickupComplete(null, resources, selectedCollectedSourceKeys)
        }
      />
      {availableOneTimePackages.length > 0 && (
        <PyroxeneAvailableOneTimePackages packages={availableOneTimePackages} onDeleteItem={onDeleteItem} />
      )}

      <SubTitle text="청휘석 시뮬레이션" description={simulationDescription} />
      <div className="relative">
        {isTimelinePending && (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white/90 px-2 py-1 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-300">
            <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>계산 중...</span>
          </div>
        )}
        <PyroxeneChart timeline={timeline} />
      </div>

      <SubTitle
        text="타임라인"
        description="미래시 페이지에서 등록한 관심 학생의 모집 시점의 예상 청휘석을 확인할 수 있어요"
      />
      {!isTimelinePending &&
        timeline.every(({ source }) => source.type !== "event" && !options.timeline.display.includes(source.type)) && (
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
          const collectedSourceKey =
            source.collectedSourceKey && !source.uid?.endsWith("::ten-time-ticket-expiry")
              ? source.collectedSourceKey
              : undefined;
          const collected = collectedSourceKey ? collectedSourceKeySet.has(collectedSourceKey) : false;
          const displayResources =
            collected && collectedSourceKey
              ? (collectedSourceDisplayResources.get(collectedSourceKey) ?? resourceDelta)
              : resourceDelta;
          return (
            <PyroxeneTimelineResources
              key={
                source.uid
                  ? `${source.uid}-${date.toISOString()}-${index}`
                  : `${source.description}-${date.toISOString()}-${index}`
              }
              date={date}
              description={source.description}
              resources={displayResources}
              itemUid={itemUid}
              onDeleteItem={onDeleteItem}
              collectedSourceKey={collectedSourceKey}
              collectable={collectedSourceKey ? collectableSourceKeySet.has(collectedSourceKey) : false}
              collected={collected}
              onCollectedSourceChange={onCollectedSourceChange}
            />
          );
        }
        return null;
      })}
    </>
  );
}
