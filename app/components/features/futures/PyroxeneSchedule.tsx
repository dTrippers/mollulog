import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { EmptyView, Section, SectionCard, Toggle } from "~/components/primitives";
import type { PyroxeneCalculationOptions, PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import {
  buildPyroxeneDisplayTimeline,
  type PyroxeneCollectedSourceCandidate,
  type PyroxeneScheduleItem,
} from "~/domain/pyroxene-schedule";
import { collectedSourceKeyForEventReward } from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import PyroxeneAvailableOneTimePackages from "./PyroxeneAvailableOneTimePackages";
import PyroxeneChart from "./PyroxeneChart";
import PyroxeneInitialResources from "./PyroxeneInitialResources";
import PyroxeneTimelineEvent from "./PyroxeneTimelineEvent";
import PyroxeneTimelineResources from "./PyroxeneTimelineResources";
import { usePyroxeneTimeline } from "./usePyroxeneTimeline";

type PyroxeneScheduleProps = {
  initialDate: Date | null;
  initialResources: PickupResources;
  eventDataMap: Map<string, { completed: boolean; expectedTrials: number | null }>;
  scheduleItems: PyroxeneScheduleItem[];
  options: PyroxenePlannerOptions;
  collectedSourceKeys: string[];
  recruitedStudentUids: string[];

  onPickupComplete: (eventUid: string | null, resources: PickupResources, collectedSourceKeys?: string[]) => void;
  onDeletePickupComplete: (eventUid: string) => void;
  onDeleteItem: (itemUid: string) => void;
  onUpdateEventData: (eventUid: string, data: { expectedTrials?: number | null }) => void;
  onCollectedSourceChange: (sourceKey: string, collected: boolean) => void;
  allowPickupCompletion: boolean;
  onFavoriteChange: (contentUid: string, studentUid: string, favorited: boolean) => void;
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
const hideUnfavoritedEventsStorageKey = "pyroxene-planner::hide-unfavorited-events";

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
  recruitedStudentUids,
  onPickupComplete,
  onDeletePickupComplete,
  onDeleteItem,
  onUpdateEventData,
  onCollectedSourceChange,
  allowPickupCompletion,
  onFavoriteChange,
}: PyroxeneScheduleProps) {
  const [hideUnfavoritedEvents, setHideUnfavoritedEvents] = useState(false);

  useEffect(() => {
    try {
      setHideUnfavoritedEvents(localStorage.getItem(hideUnfavoritedEventsStorageKey) === "true");
    } catch (_error) {
      // Ignore unavailable local storage and keep the default display.
    }
  }, []);

  const handleHideUnfavoritedEventsChange = (value: boolean) => {
    setHideUnfavoritedEvents(value);
    try {
      localStorage.setItem(hideUnfavoritedEventsStorageKey, String(value));
    } catch (_error) {
      // Ignore unavailable local storage and keep the setting for this tab.
    }
  };

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

  // 관심 학생이 아직 없는 모집도 선택 진입점으로 보여주되 계산 결과에는 포함하지 않습니다.
  const displayTimeline = useMemo(
    () => buildPyroxeneDisplayTimeline(timeline, scheduleItems, initialDate ?? new Date(), initialResources),
    [initialDate, initialResources, scheduleItems, timeline],
  );
  const visibleDisplayTimeline = useMemo(() => {
    if (!hideUnfavoritedEvents) return displayTimeline;

    return displayTimeline.filter(({ source }) => {
      const event = source.event;
      if (!event) return true;
      if (eventDataMap.get(event.uid)?.completed) return true;
      return event.recruitments.some(({ favorited, pickup, student }) => pickup && student && favorited);
    });
  }, [displayTimeline, eventDataMap, hideUnfavoritedEvents]);

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
  const recruitedStudentUidSet = useMemo(() => new Set(recruitedStudentUids), [recruitedStudentUids]);
  const collectableSourceKeySet = useMemo(() => {
    const currentDate = dayjs();
    const sourceKeys = new Set<string>();

    for (const item of scheduleItems) {
      if (item.event?.earnablePyroxene && !dayjs(item.event.since).isAfter(currentDate)) {
        sourceKeys.add(collectedSourceKeyForEventReward(item.event.uid));
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
    }

    return resourcesBySourceKey;
  }, [scheduleItems]);
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
            title: item.event.name,
          },
        ];
      }

      return [];
    });
  }, [scheduleItems, collectedSourceKeySet]);

  let displayedYear: number | null = null;

  return (
    <div className="space-y-10">
      <Section
        title="현재 보유 재화"
        description={
          initialDate
            ? `마지막 입력 : ${dayjs(initialDate).format("MM/DD HH:mm")}`
            : "현재 보유중인 재화 수량을 입력해주세요"
        }
      >
        <div className="space-y-3">
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
        </div>
      </Section>

      <Section title="청휘석 시뮬레이션" description={simulationDescription}>
        <SectionCard className="relative p-2 shadow-md dark:shadow-md md:p-3">
          {isTimelinePending && (
            <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-border bg-popover/95 px-2 py-1 text-xs font-medium text-muted-foreground shadow-md backdrop-blur">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span>계산 중...</span>
            </div>
          )}
          <PyroxeneChart timeline={timeline} />
        </SectionCard>
      </Section>

      <section>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 grow">
            <h2 className="text-lg font-semibold text-foreground">타임라인</h2>
            <p className="mt-1 text-sm text-muted-foreground">관심 학생의 모집 시점의 예상 청휘석을 확인할 수 있어요</p>
          </div>
          <Toggle
            label="관심 학생이 없는 이벤트 숨기기"
            initialState={hideUnfavoritedEvents}
            className="my-0 shrink-0"
            onChange={handleHideUnfavoritedEventsChange}
          />
        </div>
        <div className="mt-4 space-y-2">
          {!isTimelinePending &&
            visibleDisplayTimeline.every(
              ({ source }) => source.type !== "event" && !options.timeline.display.includes(source.type),
            ) && <EmptyView text="표시할 일정이 없어요. 미래시에서 관심 학생을 등록하거나 수급 계획을 추가해보세요." />}
          {visibleDisplayTimeline.map(({ date, accumulatedResources, resourceDelta, source }, index) => {
            if (source.type !== "event" && !options.timeline.display.includes(source.type)) {
              return null;
            }

            const year = date.year();
            const showYearDivider = year !== displayedYear;
            displayedYear = year;

            if (source.event) {
              const { event } = source;
              const eventData = eventDataMap.get(event.uid);
              return (
                <div key={`event-${event.uid}`}>
                  {showYearDivider ? <TimelineYearDivider year={year} /> : null}
                  <PyroxeneTimelineEvent
                    event={event}
                    completed={eventData?.completed ?? false}
                    expectedTrials={eventData?.expectedTrials ?? null}
                    pickupChance={options.event.pickupChance}
                    allowPickupCompletion={allowPickupCompletion}
                    recruitedStudentUids={recruitedStudentUidSet}
                    onFavoriteChange={onFavoriteChange}
                    accumulatedResources={accumulatedResources}
                    resourceDelta={resourceDelta}
                    onDeletePickupComplete={onDeletePickupComplete}
                    onPickupComplete={onPickupComplete}
                    onUpdateEventData={onUpdateEventData}
                  />
                </div>
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
              const itemKey = source.uid
                ? `${source.uid}-${date.toISOString()}-${index}`
                : `${source.description}-${date.toISOString()}-${index}`;
              return (
                <div key={itemKey}>
                  {showYearDivider ? <TimelineYearDivider year={year} /> : null}
                  <PyroxeneTimelineResources
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
                </div>
              );
            }
            return null;
          })}
        </div>
      </section>
    </div>
  );
}

function TimelineYearDivider({ year }: { year: number }) {
  return (
    <div className="flex items-center gap-3 pb-2 pt-3">
      <span className="text-sm font-semibold tabular-nums text-muted-foreground">{year}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
