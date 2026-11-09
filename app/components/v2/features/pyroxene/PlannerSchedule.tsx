import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from "@heroicons/react/16/solid";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon as SolidCheckCircleIcon } from "@heroicons/react/24/solid";
import { type Ref, useId, useState } from "react";
import type { PyroxenePickupChance } from "~/domain/pyroxene-planner";
import type { PlannerIncomeRow, PlannerTimelineRow } from "~/domain/pyroxene-planner-view";
import type { RecruitmentStacks } from "~/domain/pyroxene-recruitment-goal";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { IconButton } from "../../primitives/IconButton";
import { Switch } from "../../primitives/Switch";
import { EventCard, type EventCardHandlers, type PlannerEventData } from "./EventCard";
import { formatAmount, formatSigned, KST, ResourceIcon, SCHEDULE_GRID_CLASS_NAME } from "./pyroxene-ui";

export type ScheduleIncomeHandlers = {
  onDeleteItem: (itemUid: string) => void;
  onCollectedSourceChange: (sourceKey: string, collected: boolean) => void;
};

function deltaClassName(value: number): string {
  return value > 0 ? "text-v2-success" : value < 0 ? "text-v2-danger" : "text-v2-fg-tertiary";
}

const RESOURCE_ORDER = ["pyroxene", "tenTimeTicket", "oneTimeTicket"] as const;

/** Every resource a row changes, one per line with its icon, for the change column. */
function ResourceDeltas({ delta, className }: { delta: PlannerIncomeRow["delta"]; className?: string }) {
  const changed = RESOURCE_ORDER.filter((resource) => delta[resource] !== 0);
  return (
    <span className={cn("flex flex-col items-end gap-0.5 font-semibold tabular-nums", className)}>
      {changed.length === 0 ? <span className="text-v2-fg-tertiary">—</span> : null}
      {changed.map((resource) => (
        <span key={resource} className={cn("inline-flex items-center gap-0.5", deltaClassName(delta[resource]))}>
          <ResourceIcon resource={resource} className="my-0 size-5" />
          {formatSigned(delta[resource])}
        </span>
      ))}
    </span>
  );
}

function IncomeRowView({ row, handlers }: { row: PlannerIncomeRow; handlers: ScheduleIncomeHandlers }) {
  return (
    // Stacked layouts keep a short title on one line with the amounts and wrap the amounts below only when the title
    // needs the room. The wrappers dissolve into the shared grid on wide containers.
    <li
      className={cn(
        SCHEDULE_GRID_CLASS_NAME,
        "flex items-start py-1.5 pr-3 pl-4 text-[0.8125rem] @2xl:grid @2xl:min-h-9 @2xl:items-center @2xl:px-4",
      )}
    >
      <span className="w-12 shrink-0 py-0.5 font-semibold text-v2-fg tabular-nums @2xl:w-auto @2xl:py-0">
        {row.type === "aggregate" ? <span className="font-normal text-v2-fg-tertiary">~</span> : null}
        {row.date.tz(KST).format("MM/DD")}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 @2xl:contents">
        <span className="min-w-0 grow py-0.5 break-keep whitespace-pre-line text-v2-fg @2xl:py-0">{row.label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-x-1.5 @2xl:contents">
          <ResourceDeltas delta={row.delta} className="w-16 py-0.5 @2xl:w-auto @2xl:py-0" />
          <span className="w-14 py-0.5 text-right @2xl:py-0 text-v2-fg-secondary tabular-nums @2xl:w-auto">
            {formatAmount(row.balance)}
          </span>
          <span className="-my-1.5 flex w-7 flex-col items-end justify-center gap-0.5 @2xl:my-0 @2xl:w-auto @2xl:flex-row @2xl:justify-end">
            {row.collectedSourceKey && row.collectable ? (
              <IconButton
                icon={row.collected ? SolidCheckCircleIcon : CheckCircleIcon}
                label={`${row.label} 받은 보상으로 표시`}
                pressed={row.collected}
                onClick={() => handlers.onCollectedSourceChange(row.collectedSourceKey as string, !row.collected)}
              />
            ) : null}
            {row.itemUid ? (
              <IconButton
                icon={TrashIcon}
                label={`${row.label} 삭제`}
                onClick={() => handlers.onDeleteItem(row.itemUid as string)}
              />
            ) : null}
          </span>
        </span>
      </span>
    </li>
  );
}

export type PlannerScheduleProps = {
  rows: PlannerTimelineRow[];
  pending: boolean;
  hideUntargeted: boolean;
  onHideUntargetedChange: (value: boolean) => void;
  selectedEventUid: string | null;
  selectedEventRef: Ref<HTMLDivElement>;
  selectedEventMissing: boolean;
  eventDataMap: ReadonlyMap<string, PlannerEventData>;
  defaultBasis: PyroxenePickupChance;
  recruitedStudentUids: ReadonlySet<string>;
  currentStacks: RecruitmentStacks;
  canRecordCompletion: boolean;
  eventHandlers: EventCardHandlers;
  incomeHandlers: ScheduleIncomeHandlers;
};

export function PlannerSchedule({
  rows,
  pending,
  hideUntargeted,
  onHideUntargetedChange,
  selectedEventUid,
  selectedEventRef,
  selectedEventMissing,
  eventDataMap,
  defaultBasis,
  recruitedStudentUids,
  currentStacks,
  canRecordCompletion,
  eventHandlers,
  incomeHandlers,
}: PlannerScheduleProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const switchId = useId();
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section aria-labelledby={`${switchId}-title`} className="@container flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${switchId}-title`} className="mr-auto text-base font-semibold text-v2-fg">
          일정
          {pending ? <span className="ml-2 text-xs font-normal text-v2-fg-tertiary">계산 중…</span> : null}
        </h2>
        <Switch
          id={switchId}
          size="sm"
          layout="inline"
          checked={hideUntargeted}
          onCheckedChange={onHideUntargetedChange}
          label="목표 없는 이벤트 숨기기"
        />
      </div>
      {selectedEventMissing ? (
        <p role="status" className="rounded-md bg-v2-inset px-3 py-2 text-sm text-v2-fg-secondary">
          선택한 이벤트를 지금 일정에서 찾을 수 없어요.
        </p>
      ) : null}
      {!pending && rows.length === 0 ? (
        <p className="rounded-lg bg-v2-surface px-3 py-6 text-center text-sm text-v2-fg-secondary">
          표시할 일정이 없어요. 미래시에서 관심 학생을 등록하거나 수급 계획을 추가해주세요.
        </p>
      ) : null}
      <div className={cn(SCHEDULE_GRID_CLASS_NAME, "hidden px-4 text-xs font-medium text-v2-fg-tertiary @2xl:grid")}>
        <span>날짜</span>
        <span>내용</span>
        <span className="text-right">재화 증감</span>
        <span className="text-right">남은 재화</span>
        <span />
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => {
          if (row.kind === "year") {
            return (
              <p key={row.key} className="px-4 pt-3 pb-1 text-xs font-bold text-v2-fg-tertiary tabular-nums">
                {row.year}
              </p>
            );
          }
          if (row.kind === "event") {
            const uid = row.entry.source.event?.uid ?? "";
            const selected = uid === selectedEventUid;
            return (
              <EventCard
                key={row.key}
                ref={selected ? selectedEventRef : undefined}
                entry={row.entry}
                marker={row.marker}
                eventData={eventDataMap.get(uid)}
                defaultBasis={defaultBasis}
                recruitedStudentUids={recruitedStudentUids}
                currentStacks={currentStacks}
                canRecordCompletion={canRecordCompletion}
                selected={selected}
                handlers={eventHandlers}
              />
            );
          }
          if (row.kind === "income") {
            return (
              <ul key={row.key}>
                <IncomeRowView row={row.row} handlers={incomeHandlers} />
              </ul>
            );
          }
          const open = expanded.has(row.key);
          const visible = open ? row.rows : [row.rows[row.leadIndex]];
          return (
            <ul key={row.key} className="flex flex-col">
              {visible.map((income) => (
                <IncomeRowView key={income.key} row={income} handlers={incomeHandlers} />
              ))}
              <li className={cn(SCHEDULE_GRID_CLASS_NAME, "min-h-7 items-center pr-3 pl-4 text-xs @2xl:px-4")}>
                <span />
                <span className="flex min-w-0 items-center whitespace-nowrap">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggle(row.key)}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-0.5 rounded font-medium text-v2-fg-secondary hover:text-v2-fg",
                      v2FocusRing,
                    )}
                  >
                    {open ? "접기" : `${row.rows.length - 1}개 일정 더 보기`}
                    {open ? (
                      <ChevronUpIcon className="size-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                    )}
                  </button>
                </span>
                {/* The group's pyroxene total sits in the change column, under the rows it adds up. */}
                <span className="inline-flex items-center justify-end gap-0.5 font-medium text-v2-fg-tertiary tabular-nums">
                  <ResourceIcon resource="pyroxene" className="my-0 size-5" />
                  <span className="sr-only">합계 </span>
                  {formatSigned(row.delta)}
                </span>
                <span />
                <span />
              </li>
            </ul>
          );
        })}
      </div>
    </section>
  );
}
