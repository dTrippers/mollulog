import dayjs from "dayjs";
import "dayjs/locale/ko";
import { MultilineText, SubTitle } from "~/components/atoms/typography";
import { ResourceCard } from "~/components/atoms/item";
import { ActionCard, type ActionCardAction } from "~/components/molecules/editor";
import { StudentCards } from "~/components/molecules/student";
import { PickupType, RaidType } from "~/models/content.d";
import { useEffect, useMemo, useState } from "react";
import { ResourceTypeEnum } from "~/graphql/graphql";
import ResourcesInput from "./planner-input/ResourcesInput";
import { Transition } from "@headlessui/react";
import type { PyroxenePlannerOptions, TimelineSourceType } from "~/models/pyroxene-planner";
import { NumberInput } from "~/components/atoms/form";
import { ChevronDownIcon } from "@heroicons/react/16/solid";

dayjs.locale("ko");

export type PickupResources = {
  pyroxene: number;
  oneTimeTicket: number;
  tenTimeTicket: number;
};

export type PyroxeneScheduleItem = ({
  event?: {
    uid: string;
    name: string;
    since: Date;
    until: Date;
    pickups: {
      type: PickupType;
      rerun: boolean;
      student: { uid: string, initialTier: number } | null;
      favorited: boolean;
    }[];
  };
  raid?: {
    uid: string;
    type: RaidType;
    name: string;
    since: Date;
    until: Date;
  };

  onetimeGain?: {
    uid?: string;
    source: TimelineSourceType;
    date: Date;
    description: string;
    pyroxeneDelta?: number;
    oneTimeTicketDelta?: number;
    tenTimeTicketDelta?: number;
  };
  repeatedGain?: {
    uid?: string;
    source: TimelineSourceType;
    date: Date;
    description: string;
    pyroxeneDelta?: number;
    oneTimeTicketDelta?: number;
    tenTimeTicketDelta?: number;
    repeatIntervalDays: number;
    repeatCount?: number;
  };
});

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

export default function PyroxeneSchedule({ initialDate, initialResources, eventDataMap, scheduleItems, options, onPickupComplete, onDeletePickupComplete, onDeleteItem, onUpdateEventData }: PyroxeneScheduleProps) {
  const timeline = useMemo(() => {
    return buildTimeline(initialResources, initialDate ?? new Date(), eventDataMap, scheduleItems, options);
  }, [initialDate, initialResources, eventDataMap, scheduleItems, options]);

  // 30일 이내의 월간 패키지는 삭제가 가능하도록 별도 레이아웃에서 표시
  const availableOneTimePackages = useMemo(() => {
    const since = dayjs().subtract(30, "day");
    return scheduleItems.filter((item) => {
      if (item.onetimeGain?.source !== "package_onetime") {
        return false;
      }

      const packageDate = dayjs(item.onetimeGain.date);
      return packageDate.isAfter(since) && packageDate.isBefore(initialDate ? dayjs(initialDate) : dayjs());
    }).map((item) => ({
      uid: item.onetimeGain!.uid!,
      date: item.onetimeGain!.date,
      description: item.onetimeGain!.description,
      pyroxeneDelta: item.onetimeGain!.pyroxeneDelta!,
    }));
  }, [scheduleItems]);

  return (
    <>
      <SubTitle
        text="현재 보유 재화"
        description={initialDate ? `마지막 입력 : ${dayjs(initialDate).format('YYYY-MM-DD HH:mm')}` : "현재 보유중인 재화 수량을 입력해주세요"}
      />
      {!initialDate && (
        <div className="my-4 p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-green-800 dark:text-green-200">현재 보유중인 재화 수량을 입력해주세요</p>
        </div>
      )}
      <InitialResources
        resources={initialResources}
        onUpdateResources={(resources) => onPickupComplete(null, resources)}
      />
      {availableOneTimePackages.length > 0 && (
        <AvailableOneTimePackages packages={availableOneTimePackages} onDeleteItem={onDeleteItem} />
      )}

      <SubTitle text="재화 획득/소비 계획" />
      {timeline.map(({ date, accumulatedResources, resourceDelta, source }) => {
        if (source.type !== "event" && !options.timeline.display.includes(source.type)) {
          return null;
        }

        if (source.event) {
          const { event } = source;
          const eventData = eventDataMap.get(event.uid);
          return (
            <TimelineEvent
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
        } else if (source.description) {
          return (
            <TimelineResources
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

type AvailableOneTimePackageProps = {
  packages: {
    uid: string;
    date: Date;
    description: string;
    pyroxeneDelta: number;
  }[];
  onDeleteItem: (itemUid: string) => void;
};

function AvailableOneTimePackages({ packages, onDeleteItem }: AvailableOneTimePackageProps) {
  const [show, setShow] = useState(false);

  return (
    <>
      <div
        className="p-4 flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 rounded-lg cursor-pointer"
        onClick={() => setShow((prev) => !prev)}
      >
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">적용중인 월간 패키지</p>
        <ChevronDownIcon className={`size-4 text-neutral-500 dark:text-neutral-400 transition-transform duration-200 ease-in-out ${show ? "rotate-180" : ""}`} />
      </div>

      {show && (packages.map(({ uid, date, description, pyroxeneDelta }) => (
        <TimelineResources
          key={uid}
          date={dayjs(date)}
          description={description}
          resources={{ pyroxene: pyroxeneDelta ?? 0, oneTimeTicket: 0, tenTimeTicket: 0 }}
          itemUid={uid}
          onDeleteItem={onDeleteItem}
        />
      )))}
    </>
  );
}

type TimelineEventProps = {
  event: PyroxeneScheduleItem["event"] | undefined;
  accumulatedResources: PickupResources;
  resourceDelta: PickupResources;
  completed: boolean;
  expectedTrials: number | null;
  pickupChance: "ceil" | "average";

  onDeletePickupComplete: (eventUid: string) => void;
  onPickupComplete: (eventUid: string, resources: PickupResources) => void;
  onUpdateEventData: (eventUid: string, data: { completed?: boolean; expectedTrials?: number | null }) => void;
};

function TimelineEvent({ event, accumulatedResources, resourceDelta, completed, expectedTrials, pickupChance, onDeletePickupComplete, onPickupComplete, onUpdateEventData }: TimelineEventProps) {
  if (!event) {
    return null;
  }

  const [showCompleteAction, setShowCompleteAction] = useState(false);
  const [showExpectedTrialsAction, setShowExpectedTrialsAction] = useState(false);
  const [expectedTrialsInputValue, setExpectedTrialsInputValue] = useState<number>(expectedTrials ?? 0);
  const actions: ActionCardAction[] = [];
  if (completed) {
    actions.push({
      text: "모집 기록 삭제",
      color: "red",
      onClick: () => onDeletePickupComplete(event.uid),
      danger: true,
    });
  } else if (dayjs(event.since).isBefore(dayjs())) {
    actions.push({
      text: showCompleteAction ? "취소" : "모집 완료",
      onClick: () => setShowCompleteAction((prev) => !prev),
    });
  }

  return (
    <div className="relative">
      <ActionCard actions={actions}>
        <div className="mb-2">
          <p className="mb-1 text-xs text-neutral-500">
            {dayjs(event.since).format("YYYY-MM-DD")} ~ {dayjs(event.until).format("YYYY-MM-DD")}
          </p>
          <MultilineText texts={event.name.split("\n")} className="font-semibold text-lg" />
        </div>
        <div className="flex-1">
          <StudentCards
            students={event.pickups.filter(({ favorited }) => favorited).map(({ student }) => ({ uid: student!.uid, tier: student!.initialTier }))}
            pcGrid={10}
          />
        </div>
        {!completed && (
          <div className="my-4 space-y-4">
            <div className="relative flex items-end gap-x-2">
              <div className="flex-1">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">모집 목표 횟수</p>
                <p className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  {expectedTrials !== null ? `총 ${expectedTrials}회` : pickupChance === "ceil" ? "★3 학생 당 200회(천장)" : "★3 학생 당 140회(평균)"}
                </p>
              </div>
              {expectedTrials !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setExpectedTrialsInputValue(0);
                    onUpdateEventData(event.uid, { expectedTrials: null });
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/20 hover:bg-neutral-100 dark:hover:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800 rounded-md transition whitespace-nowrap"
                >
                  초기화
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowExpectedTrialsAction((prev) => !prev)}
                className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md transition whitespace-nowrap"
              >
                {showExpectedTrialsAction ? "변경 취소" : "목표 변경"}
              </button>
              <Transition
                show={showExpectedTrialsAction}
                as="div"
                enter="transition duration-200 ease-out"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="transition duration-100 ease-in"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
                className="absolute top-full right-0 mt-2 z-10"
              >
                <div className="bg-white/90 dark:bg-black/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-4 min-w-[280px]">
                  <p className="mb-2 text-sm text-neutral-500">이 이벤트의 목표 모집 횟수를 입력해주세요</p>
                  <div className="mb-4">
                    <NumberInput
                      defaultValue={expectedTrialsInputValue ?? 0}
                      onChange={(value) => setExpectedTrialsInputValue(value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/20 hover:bg-neutral-100 dark:hover:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800 rounded-md transition whitespace-nowrap"
                      onClick={() => setShowExpectedTrialsAction(false)}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md transition whitespace-nowrap"
                      onClick={() => {
                        onUpdateEventData(event.uid, { expectedTrials: expectedTrialsInputValue });
                        setShowExpectedTrialsAction(false);
                      }}
                    >
                      저장
                    </button>
                  </div>
                </div>
              </Transition>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">모집 후 남는 재화</p>
              <div className="w-full bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2">
                    <ResourceCard resourceType={ResourceTypeEnum.Currency} itemUid="2" />
                    <p>{remainingResourceValue(accumulatedResources.pyroxene, resourceDelta.pyroxene)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ResourceCard resourceType={ResourceTypeEnum.Item} itemUid="6999" />
                    <p>{remainingResourceValue(accumulatedResources.tenTimeTicket, resourceDelta.tenTimeTicket)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ResourceCard resourceType={ResourceTypeEnum.Item} itemUid="6998" />
                    <p>{remainingResourceValue(accumulatedResources.oneTimeTicket, resourceDelta.oneTimeTicket)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {completed && (
          <p className="mt-4 text-center text-neutral-500 text-sm">모집 완료</p>
        )}
      </ActionCard>

      <Transition
        show={showCompleteAction}
        as="div"
        enter="transition duration-200 ease-out"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition duration-100 ease-in"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
        className="absolute top-full left-0 w-full mt-2 z-10"
      >
        <div className="bg-white/90 dark:bg-black/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-4">
          <ResourcesInput
            description="모집 완료 시점의 재화 수량을 입력해주세요."
            onSaveResources={(resources) => {
              onPickupComplete(event.uid, resources);
              setShowCompleteAction(false);
            }}
          />
        </div>
      </Transition>
    </div>
  );
}

function InitialResources({ resources, onUpdateResources }: { resources: PickupResources, onUpdateResources: (resources: PickupResources) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedResources, setEditedResources] = useState<PickupResources>(resources);

  useEffect(() => {
    if (!isEditing) {
      setEditedResources(resources);
    }
  }, [resources, isEditing]);

  const resourceItems = [
    { type: ResourceTypeEnum.Currency, itemUid: "2", label: "청휘석", resourceKey: "pyroxene" as const },
    { type: ResourceTypeEnum.Item, itemUid: "6999", label: "10회 모집 티켓", resourceKey: "tenTimeTicket" as const },
    { type: ResourceTypeEnum.Item, itemUid: "6998", label: "1회 모집 티켓", resourceKey: "oneTimeTicket" as const },
  ];

  const handleSave = () => {
    if (onUpdateResources) {
      onUpdateResources(editedResources);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditedResources(resources);
    setIsEditing(false);
  };

  return (
    <div className="relative">
      <div className="my-4 p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {resourceItems.map(({ type, itemUid, label, resourceKey }) => (
            <div key={itemUid} className="flex items-start gap-2">
              <ResourceCard resourceType={type} itemUid={itemUid} />
              <div className="flex-1">
                <p className="text-sm font-semibold">{label}</p>
                <p className="my-1 text-sm">{resources[resourceKey].toLocaleString()}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 mt-2">
            {isEditing ? (
              <button className="px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/20 hover:bg-neutral-100 dark:hover:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800 rounded-md transition whitespace-nowrap" onClick={handleCancel}>
                취소
              </button>
            ) : (
              <button
                className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md transition whitespace-nowrap"
                onClick={() => setIsEditing(true)}
              >
                수정
              </button>
            )}
          </div>
        </div>
      </div>
      <Transition
        show={isEditing}
        as="div"
        enter="transition duration-200 ease-out"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition duration-100 ease-in"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
        className="absolute top-full left-0 w-full mt-2 z-10"
      >
        <div className="bg-white/90 dark:bg-black/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-4">
          <ResourcesInput
            description="현재 보유한 재화 수량을 입력해주세요."
            initialResources={resources}
            onSaveResources={(resources) => {
              onUpdateResources(resources);
              setIsEditing(false);
            }}
          />
        </div>
      </Transition>
    </div>
  );
}

function TimelineResources({ date, description, resources, itemUid, onDeleteItem }: { date: dayjs.Dayjs, description: string, resources: PickupResources, itemUid?: string, onDeleteItem?: (itemUid: string) => void }) {
  return (
    <div className="my-4 px-3 md:px-4 py-2 flex items-center justify-between border border-neutral-200 dark:border-neutral-700 rounded-lg">
      <div className="w-40">
        <div className="pr-3 mr-3 border-r border-neutral-200 dark:border-neutral-700">
          <p className="font-semibold text-sm">
            {date.format("YYYY-MM-DD")}({date.format("ddd")})
          </p>
          <p className="text-neutral-500 text-xs line-clamp-1">{description}</p>
        </div>
      </div>
      <div className="flex-1 flex items-center gap-1">
        {resources.pyroxene > 0 && <ResourceCard resourceType={ResourceTypeEnum.Currency} itemUid="2" label={resources.pyroxene.toLocaleString()} />}
        {resources.oneTimeTicket > 0 && <ResourceCard resourceType={ResourceTypeEnum.Item} itemUid="6998" label={resources.oneTimeTicket.toLocaleString()} />}
        {resources.tenTimeTicket > 0 && <ResourceCard resourceType={ResourceTypeEnum.Item} itemUid="6999" label={resources.tenTimeTicket.toLocaleString()} />}
      </div>
      {itemUid && onDeleteItem && (
        <button
          onClick={() => onDeleteItem(itemUid)}
          className="ml-2 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md transition whitespace-nowrap"
        >
          삭제
        </button>
      )}
    </div>
  )
}

function remainingResourceValue(count: number, diff: number): React.ReactNode {
  return (
    <>
      <p className={`font-semibold text-sm ${count > 0 ? "text-green-600" : count === 0 ? undefined : "text-red-500"}`}>
        {count.toLocaleString()}
      </p>
      <p className="-mt-1 text-neutral-500 dark:text-neutral-400 text-xs">
        ({diff === 0 ? "-" : `${Math.abs(diff).toLocaleString()}개 사용`})
      </p>
    </>
  )
}

type TimelineSource = {
  type: TimelineSourceType;
  event?: PyroxeneScheduleItem["event"];
  description?: string;
  uid?: string;
};

type TimelineDelta = {
  date: dayjs.Dayjs;
  source: TimelineSource;

  pickupTrial?: number;
  resourceDelta?: PickupResources;
};

type Timeline = {
  date: dayjs.Dayjs;
  source: TimelineSource;
  accumulatedResources: PickupResources;
  resourceDelta: PickupResources;
}[];

const MAX_REPEATED_ENTRIES = 365;

function buildTimeline(
  initialResources: PickupResources,
  initialDate: Date,
  eventDataMap: Map<string, { completed: boolean; expectedTrials: number | null }>,
  scheduleItems: PyroxeneScheduleItem[],
  options: PyroxenePlannerOptions,
): Timeline {
  const maxDate = scheduleItems.filter((item) => item.event).reduce((max, item) => max.isAfter(dayjs(item.event!.until)) ? max : dayjs(item.event!.until), dayjs(initialDate));

  const timelineDeltas: TimelineDelta[] = [];
  scheduleItems.forEach((scheduleItem) => {
    if (scheduleItem.event) {
      // 픽업 일정
      const { event } = scheduleItem;
      const eventData = eventDataMap.get(event.uid);
      if (eventData?.completed) {
        // 이미 픽업을 완료한 일정은 계산하지 않음
        timelineDeltas.push({
          date: dayjs(event.since),
          source: { type: "event", event },
          resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
        });
        return;
      }

      // Use expectedTrials if set, otherwise calculate from pickupCount
      let pickupTrial: number;
      if (eventData?.expectedTrials !== null && eventData?.expectedTrials !== undefined) {
        pickupTrial = eventData.expectedTrials;
      } else {
        const pickupCount = event.pickups.filter(({ student, favorited }) => favorited && student?.initialTier === 3).length;
        if (pickupCount === 0) {
          return;
        }
        pickupTrial = pickupCount * (options.event.pickupChance === "ceil" ? 200 : 140);
      }

      timelineDeltas.push({
        date: dayjs(event.since),
        source: { type: "event", event },
        pickupTrial,
      });
    } else if (scheduleItem.raid) {
      const { raid } = scheduleItem;
      if (raid.type === "total_assault") {
        // 총력전 종료일 기준으로 650 + 등급 보상 청휘석 획득
        let tierReward = 600;
        const tier = options.raid.tier;
        if (tier === "platinum") {
          tierReward = 1200;
        } else if (tier === "gold") {
          tierReward = 1000;
        } else if (tier === "silver") {
          tierReward = 800;
        }

        timelineDeltas.push({
          date: dayjs(raid.until),
          source: { type: "raid", description: `총력전 ${raid.name}` },
          resourceDelta: { pyroxene: 650 + tierReward, oneTimeTicket: 0, tenTimeTicket: 0 },
        });
      } else if (raid.type === "elimination") {
        // 대결전 종료일 익일 기준으로 650 청휘석, 10연차 티켓 1장 획득
        timelineDeltas.push({
          date: dayjs(raid.until).add(1, "day"),
          source: { type: "raid", description: `대결전 ${raid.name}` },
          resourceDelta: { pyroxene: 650, oneTimeTicket: 0, tenTimeTicket: 1 },
        });
      }
    } else if (scheduleItem.onetimeGain) {
      const { onetimeGain } = scheduleItem;
      timelineDeltas.push({
        date: dayjs(onetimeGain.date),
        source: { type: onetimeGain.source, uid: onetimeGain.uid, description: onetimeGain.description },
        resourceDelta: { pyroxene: onetimeGain.pyroxeneDelta ?? 0, oneTimeTicket: onetimeGain.oneTimeTicketDelta ?? 0, tenTimeTicket: onetimeGain.tenTimeTicketDelta ?? 0 },
      });
    } else if (scheduleItem.repeatedGain) {
      const { repeatedGain } = scheduleItem;
      let repeatedGainCount = 0;
      for (let date = dayjs(repeatedGain.date); date.isBefore(maxDate) && repeatedGainCount < (repeatedGain.repeatCount ?? MAX_REPEATED_ENTRIES); date = date.add(repeatedGain.repeatIntervalDays, "day")) {
        timelineDeltas.push({
          date,
          source: { type: repeatedGain.source, uid: repeatedGain.uid, description: repeatedGain.description },
          resourceDelta: { pyroxene: repeatedGain.pyroxeneDelta ?? 0, oneTimeTicket: repeatedGain.oneTimeTicketDelta ?? 0, tenTimeTicket: repeatedGain.tenTimeTicketDelta ?? 0 },
        });
        repeatedGainCount++;
      }
    }
  });

  // 일별/주간 임무 및 전술대회
  const dateFrom = dayjs(initialDate);
  let tacticalPyroxene = 20;
  if (options.tactical.level === "in200") {
    tacticalPyroxene = 25;
  } else if (options.tactical.level === "in100") {
    tacticalPyroxene = 30;
  } else if (options.tactical.level === "in10") {
    tacticalPyroxene = 35;
  }

  let dailyEntryCount = 0;
  for (let date = dateFrom; date.isBefore(maxDate) && dailyEntryCount < MAX_REPEATED_ENTRIES; date = date.add(1, "day")) {
    dailyEntryCount++;
    // 일일 임무
    timelineDeltas.push({
      date,
      source: { type: "daily_mission", description: "일일 임무" },
      resourceDelta: { pyroxene: 20, oneTimeTicket: 0, tenTimeTicket: 0 },
    });

    // 매주 일요일
    if (date.day() === 0) {
      timelineDeltas.push({
        date,
        source: { type: "weekly_mission", description: "주간 임무" },
        resourceDelta: { pyroxene: 120, oneTimeTicket: 0, tenTimeTicket: 0 },
      });
    }

    // 전술대회
    timelineDeltas.push({
      date,
      source: { type: "tactical", description: "전술대회" },
      resourceDelta: { pyroxene: tacticalPyroxene, oneTimeTicket: 0, tenTimeTicket: 0 },
    });
  }

  const initialDateDayjs = dayjs(initialDate);
  const filteredDeltas = timelineDeltas.filter((delta) => {
    // Include deltas after initialDate
    if (delta.date.isAfter(initialDateDayjs)) {
      return true;
    }
    // Include events that haven't ended yet (even if they start on/before initialDate)
    if (delta.source.event) {
      return dayjs(delta.source.event.until).isAfter(initialDateDayjs);
    }
    // Exclude all other deltas on or before initialDate
    return false;
  });

  const timeline: Timeline = [];
  let currentResources: PickupResources = initialResources;
  filteredDeltas.sort((a, b) => a.date.diff(b.date)).forEach((delta) => {
    let resourceDelta = delta.resourceDelta;
    if (!resourceDelta && delta.pickupTrial !== undefined) {
      if (delta.pickupTrial > 0) {
        resourceDelta = { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 };
        let remainingTrial = delta.pickupTrial;
        if (remainingTrial > 10) {
          resourceDelta.tenTimeTicket = -1 * Math.min(Math.floor(remainingTrial / 10), currentResources.tenTimeTicket);
          remainingTrial += resourceDelta.tenTimeTicket * 10;
        }
        if (remainingTrial > 1) {
          resourceDelta.oneTimeTicket = -1 * Math.min(remainingTrial, currentResources.oneTimeTicket);
          remainingTrial += resourceDelta.oneTimeTicket;
        }
        resourceDelta.pyroxene = -1 * remainingTrial * 120;
      } else if (delta.pickupTrial === 0) {
        // When expectedTrials is 0, still show the event with zero resource consumption
        resourceDelta = { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 };
      }
    }

    if (!resourceDelta) {
      return;
    }

    currentResources = {
      pyroxene: currentResources.pyroxene + resourceDelta.pyroxene,
      oneTimeTicket: currentResources.oneTimeTicket + resourceDelta.oneTimeTicket,
      tenTimeTicket: currentResources.tenTimeTicket + resourceDelta.tenTimeTicket,
    };

    timeline.push({
      date: delta.date,
      source: delta.source,
      resourceDelta,
      accumulatedResources: { ...currentResources },
    });
  });
  return timeline;
}
