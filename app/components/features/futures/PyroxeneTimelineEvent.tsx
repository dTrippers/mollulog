import { Transition } from "@headlessui/react";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { StudentCards } from "~/components/features/students";
import { Button, NumberInput, ResourceCard } from "~/components/primitives";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { PYROXENE_RESOURCE_UIDS } from "~/models/pyroxene-planner-source-config";
import type { PickupResources } from "~/models/pyroxene-timeline";
import type { PyroxeneScheduleItem } from "./types";
import ResourcesInput from "./planner-input/ResourcesInput";

type PyroxeneTimelineEventProps = {
  event: NonNullable<PyroxeneScheduleItem["event"]>;
  accumulatedResources: PickupResources;
  resourceDelta: PickupResources;
  completed: boolean;
  expectedTrials: number | null;
  pickupChance: "ceil" | "average";
  onDeletePickupComplete: (eventUid: string) => void;
  onPickupComplete: (eventUid: string, resources: PickupResources) => void;
  onUpdateEventData: (eventUid: string, data: { completed?: boolean; expectedTrials?: number | null }) => void;
};

export default function PyroxeneTimelineEvent({
  event,
  accumulatedResources,
  resourceDelta,
  completed,
  expectedTrials,
  pickupChance,
  onDeletePickupComplete,
  onPickupComplete,
  onUpdateEventData,
}: PyroxeneTimelineEventProps) {
  const [showCompleteAction, setShowCompleteAction] = useState(false);
  const [showExpectedTrialsAction, setShowExpectedTrialsAction] = useState(false);
  const [expectedTrialsInputValue, setExpectedTrialsInputValue] = useState<number>(expectedTrials ?? 0);
  const [confirmingPickupDelete, setConfirmingPickupDelete] = useState(false);
  const favoritedStudents = useMemo(
    () =>
      event.recruitments.flatMap(({ favorited, student }) => {
        if (!favorited || !student) {
          return [];
        }
        return [{ uid: student.uid, name: student.name, tier: student.initialTier }];
      }),
    [event.recruitments],
  );

  const canComplete = !completed && dayjs(event.since).isBefore(dayjs());
  const expectedTrialsLabel =
    expectedTrials !== null
      ? `총 ${expectedTrials}회`
      : pickupChance === "ceil"
        ? "★3 학생 당 200회(천장)"
        : "★3 학생 당 140회(평균)";

  const handleDeletePickupComplete = () => {
    if (confirmingPickupDelete) {
      onDeletePickupComplete(event.uid);
      return;
    }

    setConfirmingPickupDelete(true);
    setTimeout(() => setConfirmingPickupDelete(false), 3000);
  };

  return (
    <div className="relative my-3">
      <div className="rounded-lg bg-neutral-100 p-4 dark:bg-neutral-900 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:gap-5">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="min-w-0">
              <p className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                {dayjs(event.since).format("YYYY-MM-DD")} ~ {dayjs(event.until).format("YYYY-MM-DD")}
              </p>
              <h3 className="line-clamp-2 whitespace-pre-line text-base font-semibold leading-tight text-neutral-950 dark:text-neutral-50">
                {event.name}
              </h3>
            </div>

            {favoritedStudents.length > 0 && (
              <StudentCards
                students={favoritedStudents}
                layout="wrap"
                cardSize="md"
                gap="tight"
                namePlacement="overlay"
              />
            )}
          </div>

          <aside className="relative flex flex-col gap-2 md:w-60">
            {completed ? (
              <>
                <div className="rounded-md border border-neutral-200/80 bg-white/70 px-3 py-2 dark:border-neutral-700/80 dark:bg-neutral-950/40">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">상태</p>
                  <p className="mt-0.5 font-bold text-neutral-950 dark:text-neutral-50">모집 완료</p>
                </div>
                <div className="flex justify-end">
                  <Button
                    text={confirmingPickupDelete ? "정말 삭제할까요?" : "기록 삭제"}
                    variant="tint-red"
                    size="xs"
                    onClick={handleDeletePickupComplete}
                  />
                </div>
              </>
            ) : (
              <>
                <TimelineEventStats
                  expectedTrialsLabel={expectedTrialsLabel}
                  accumulatedResources={accumulatedResources}
                  resourceDelta={resourceDelta}
                />
                <div className="flex flex-wrap justify-end gap-1.5">
                  {expectedTrials !== null && (
                    <Button
                      text="초기화"
                      variant="tint"
                      size="xs"
                      onClick={() => {
                        setExpectedTrialsInputValue(0);
                        onUpdateEventData(event.uid, { expectedTrials: null });
                      }}
                    />
                  )}
                  <Button
                    text={showExpectedTrialsAction ? "변경 취소" : "목표 변경"}
                    onClick={() => setShowExpectedTrialsAction((prev) => !prev)}
                    variant="tint-blue"
                    size="xs"
                  />
                  {canComplete && (
                    <Button
                      text={showCompleteAction ? "취소" : "모집 완료"}
                      variant={showCompleteAction ? "tint" : "tint-blue"}
                      size="xs"
                      onClick={() => setShowCompleteAction((prev) => !prev)}
                    />
                  )}
                </div>
                <ExpectedTrialsPopover
                  show={showExpectedTrialsAction}
                  value={expectedTrialsInputValue}
                  onChange={setExpectedTrialsInputValue}
                  onCancel={() => setShowExpectedTrialsAction(false)}
                  onSave={() => {
                    onUpdateEventData(event.uid, { expectedTrials: expectedTrialsInputValue });
                    setShowExpectedTrialsAction(false);
                  }}
                />
              </>
            )}
          </aside>
        </div>
      </div>

      <CompletePickupPopover
        show={showCompleteAction}
        onSaveResources={(resources) => {
          onPickupComplete(event.uid, resources);
          setShowCompleteAction(false);
        }}
      />
    </div>
  );
}

function TimelineEventStats({
  expectedTrialsLabel,
  accumulatedResources,
  resourceDelta,
}: {
  expectedTrialsLabel: string;
  accumulatedResources: PickupResources;
  resourceDelta: PickupResources;
}) {
  return (
    <div className="grid divide-y divide-neutral-200 overflow-hidden rounded-md border border-neutral-200/80 bg-white/70 dark:divide-neutral-700 dark:border-neutral-700/80 dark:bg-neutral-950/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0 md:block md:divide-x-0 md:divide-y">
      <TimelineEventStat label="모집 목표" value={expectedTrialsLabel} />
      <TimelineResourcesStat
        pyroxene={accumulatedResources.pyroxene}
        pyroxeneDelta={resourceDelta.pyroxene}
        tenTimeTicket={accumulatedResources.tenTimeTicket}
        tenTimeTicketDelta={resourceDelta.tenTimeTicket}
        oneTimeTicket={accumulatedResources.oneTimeTicket}
        oneTimeTicketDelta={resourceDelta.oneTimeTicket}
      />
    </div>
  );
}

function TimelineEventStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-neutral-950 dark:text-neutral-50 md:text-base">{value}</p>
    </div>
  );
}

function TimelineResourcesStat({
  pyroxene,
  pyroxeneDelta,
  tenTimeTicket,
  tenTimeTicketDelta,
  oneTimeTicket,
  oneTimeTicketDelta,
}: {
  pyroxene: number;
  pyroxeneDelta: number;
  tenTimeTicket: number;
  tenTimeTicketDelta: number;
  oneTimeTicket: number;
  oneTimeTicketDelta: number;
}) {
  return (
    <div className="px-3 py-2">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">남은 재화</p>
      <div className="mt-1 space-y-1.5">
        <CompactResource
          resourceType={ResourceTypeEnum.Currency}
          itemUid={PYROXENE_RESOURCE_UIDS.pyroxene}
          count={pyroxene}
          diff={pyroxeneDelta}
        />
        <div className="grid grid-cols-2 gap-2">
          <CompactResource
            resourceType={ResourceTypeEnum.Item}
            itemUid={PYROXENE_RESOURCE_UIDS.tenTimeTicket}
            count={tenTimeTicket}
            diff={tenTimeTicketDelta}
          />
          <CompactResource
            resourceType={ResourceTypeEnum.Item}
            itemUid={PYROXENE_RESOURCE_UIDS.oneTimeTicket}
            count={oneTimeTicket}
            diff={oneTimeTicketDelta}
          />
        </div>
      </div>
    </div>
  );
}

function CompactResource({
  resourceType,
  itemUid,
  count,
  diff,
}: {
  resourceType: ResourceTypeEnum;
  itemUid: string;
  count: number;
  diff: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <ResourceCard resourceType={resourceType} itemUid={itemUid} />
      <RemainingResourceText count={count} diff={diff} />
    </div>
  );
}

function ExpectedTrialsPopover({
  show,
  value,
  onChange,
  onCancel,
  onSave,
}: {
  show: boolean;
  value: number;
  onChange: (value: number) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Transition
      show={show}
      as="div"
      enter="transition duration-200 ease-out"
      enterFrom="opacity-0 scale-95"
      enterTo="opacity-100 scale-100"
      leave="transition duration-100 ease-in"
      leaveFrom="opacity-100 scale-100"
      leaveTo="opacity-0 scale-95"
      className="absolute top-full right-0 z-10 mt-2"
    >
      <div className="min-w-[280px] rounded-lg border border-neutral-200 bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:border-neutral-700 dark:bg-black/80">
        <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">이 이벤트의 목표 모집 횟수를 입력해주세요</p>
        <div className="mb-4">
          <NumberInput size="md" defaultValue={value} onChange={onChange} />
        </div>
        <div className="flex justify-end gap-2">
          <Button text="취소" variant="tint" size="xs" onClick={onCancel} />
          <Button text="저장" variant="tint-blue" size="xs" onClick={onSave} />
        </div>
      </div>
    </Transition>
  );
}

function CompletePickupPopover({
  show,
  onSaveResources,
}: {
  show: boolean;
  onSaveResources: (resources: PickupResources) => void;
}) {
  return (
    <Transition
      show={show}
      as="div"
      enter="transition duration-200 ease-out"
      enterFrom="opacity-0 scale-95"
      enterTo="opacity-100 scale-100"
      leave="transition duration-100 ease-in"
      leaveFrom="opacity-100 scale-100"
      leaveTo="opacity-0 scale-95"
      className="absolute top-full left-0 z-10 mt-2 w-full"
    >
      <div className="rounded-lg border border-neutral-200 bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:border-neutral-700 dark:bg-black/80">
        <ResourcesInput description="모집 완료 시점의 재화 수량을 입력해주세요." onSaveResources={onSaveResources} />
      </div>
    </Transition>
  );
}

function RemainingResourceText({ count, diff }: { count: number; diff: number }) {
  return (
    <div className="min-w-0">
      <p className={`text-sm font-semibold ${count > 0 ? "text-green-600" : count === 0 ? "" : "text-red-500"}`}>
        {count.toLocaleString()}
      </p>
      <p className="-mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
        ({diff === 0 ? "-" : `${Math.abs(diff).toLocaleString()}개 사용`})
      </p>
    </div>
  );
}
