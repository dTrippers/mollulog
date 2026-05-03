import dayjs from "dayjs";
import { ActionCard, type ActionCardAction } from "~/components/features/editor";
import { StudentCards } from "~/components/features/students";
import { useEffect, useMemo, useState } from "react";
import { ResourceTypeEnum } from "~/graphql/graphql";
import ResourcesInput from "./planner-input/ResourcesInput";
import { Transition } from "@headlessui/react";
import type { PyroxenePlannerOptions } from "~/models/pyroxene-planner";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { Button, EmptyView, MultilineText, NumberInput, ResourceCard, SubTitle } from "~/components/primitives";
import PyroxeneChart from "./PyroxeneChart";
import { buildTimeline, type PickupResources, type PyroxeneScheduleItem } from "~/models/pyroxene-timeline";

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
      <InitialResources
        resources={initialResources}
        onUpdateResources={(resources) => onPickupComplete(null, resources)}
      />
      {availableOneTimePackages.length > 0 && (
        <AvailableOneTimePackages packages={availableOneTimePackages} onDeleteItem={onDeleteItem} />
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
        }
        if (source.description) {
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
      <button
        type="button"
        className="flex w-full items-center justify-center rounded-lg bg-neutral-100 p-4 dark:bg-neutral-900"
        onClick={() => setShow((prev) => !prev)}
        aria-expanded={show}
      >
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">적용중인 월간 패키지</p>
        <ChevronDownIcon
          className={`size-4 text-neutral-500 dark:text-neutral-400 transition-transform duration-200 ease-in-out ${show ? "rotate-180" : ""}`}
        />
      </button>

      {show &&
        packages.map(({ uid, date, description, pyroxeneDelta }) => (
          <TimelineResources
            key={uid}
            date={dayjs(date)}
            description={description}
            resources={{ pyroxene: pyroxeneDelta ?? 0, oneTimeTicket: 0, tenTimeTicket: 0 }}
            itemUid={uid}
            onDeleteItem={onDeleteItem}
          />
        ))}
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

function TimelineEvent({
  event,
  accumulatedResources,
  resourceDelta,
  completed,
  expectedTrials,
  pickupChance,
  onDeletePickupComplete,
  onPickupComplete,
  onUpdateEventData,
}: TimelineEventProps) {
  if (!event) {
    return null;
  }

  const [showCompleteAction, setShowCompleteAction] = useState(false);
  const [showExpectedTrialsAction, setShowExpectedTrialsAction] = useState(false);
  const [expectedTrialsInputValue, setExpectedTrialsInputValue] = useState<number>(expectedTrials ?? 0);
  const [confirmingPickupDelete, setConfirmingPickupDelete] = useState(false);

  const actions: ActionCardAction[] = [];
  if (completed) {
    actions.push({
      text: confirmingPickupDelete ? "정말 삭제할까요?" : "모집 기록 삭제",
      color: "red",
      onClick: () => {
        if (confirmingPickupDelete) {
          onDeletePickupComplete(event.uid);
        } else {
          setConfirmingPickupDelete(true);
          setTimeout(() => setConfirmingPickupDelete(false), 3000);
        }
      },
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
            students={event.recruitments.flatMap(({ favorited, student }) => {
              if (!favorited || !student) {
                return [];
              }
              return [{ uid: student.uid, tier: student.initialTier }];
            })}
            pcGrid={10}
          />
        </div>
        {!completed && (
          <div className="my-4 space-y-4">
            <div className="relative flex items-end gap-x-2">
              <div className="flex-1">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">모집 목표 횟수</p>
                <p className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  {expectedTrials !== null
                    ? `총 ${expectedTrials}회`
                    : pickupChance === "ceil"
                      ? "★3 학생 당 200회(천장)"
                      : "★3 학생 당 140회(평균)"}
                </p>
              </div>
              {expectedTrials !== null && (
                <Button
                  type="button"
                  size="xs"
                  onClick={() => {
                    setExpectedTrialsInputValue(0);
                    onUpdateEventData(event.uid, { expectedTrials: null });
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/20 hover:bg-neutral-100 dark:hover:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800 rounded-md transition whitespace-nowrap"
                >
                  초기화
                </Button>
              )}
              <Button
                text={showExpectedTrialsAction ? "변경 취소" : "목표 변경"}
                onClick={() => setShowExpectedTrialsAction((prev) => !prev)}
                variant="tint-blue"
                size="xs"
              />
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

        {completed && <p className="mt-4 text-center text-neutral-500 text-sm">모집 완료</p>}
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

function InitialResources({
  resources,
  onUpdateResources,
}: { resources: PickupResources; onUpdateResources: (resources: PickupResources) => void }) {
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
              <button
                type="button"
                className="px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/20 hover:bg-neutral-100 dark:hover:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800 rounded-md transition whitespace-nowrap"
                onClick={handleCancel}
              >
                취소
              </button>
            ) : (
              <button
                type="button"
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

function TimelineResources({
  date,
  description,
  resources,
  itemUid,
  onDeleteItem,
}: {
  date: dayjs.Dayjs;
  description: string;
  resources: PickupResources;
  itemUid?: string;
  onDeleteItem?: (itemUid: string) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleDeleteClick = () => {
    if (!itemUid || !onDeleteItem) return;
    if (confirmingDelete) {
      onDeleteItem(itemUid);
    } else {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
    }
  };

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
        {resources.pyroxene > 0 && (
          <ResourceCard
            resourceType={ResourceTypeEnum.Currency}
            itemUid="2"
            label={resources.pyroxene.toLocaleString()}
          />
        )}
        {resources.oneTimeTicket > 0 && (
          <ResourceCard
            resourceType={ResourceTypeEnum.Item}
            itemUid="6998"
            label={resources.oneTimeTicket.toLocaleString()}
          />
        )}
        {resources.tenTimeTicket > 0 && (
          <ResourceCard
            resourceType={ResourceTypeEnum.Item}
            itemUid="6999"
            label={resources.tenTimeTicket.toLocaleString()}
          />
        )}
      </div>
      {itemUid && onDeleteItem && (
        <button
          type="button"
          onClick={handleDeleteClick}
          className={`ml-2 px-2.5 py-1 text-xs font-medium border rounded-md transition whitespace-nowrap ${
            confirmingDelete
              ? "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 animate-pulse"
              : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border-red-200 dark:border-red-800"
          }`}
        >
          {confirmingDelete ? "정말 삭제할까요?" : "삭제"}
        </button>
      )}
    </div>
  );
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
  );
}
