import { ChevronDownIcon, ChevronRightIcon, FunnelIcon, TrashIcon } from "@heroicons/react/16/solid";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon as SolidCheckCircleIcon } from "@heroicons/react/24/solid";
import { type Ref, useId, useRef, useState } from "react";
import type { PyroxenePickupChance, TimelineSourceType } from "~/domain/pyroxene-planner";
import {
  getBalanceRange,
  type PlannerIncomeRow,
  type PlannerTimelineRow,
  type PyroxenePlannerSummary,
} from "~/domain/pyroxene-planner-view";
import type { RecruitmentStacks } from "~/domain/pyroxene-recruitment-goal";
import { PYROXENE_SOURCE_DEFINITIONS } from "~/domain/pyroxene-sources";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Checkbox } from "../../primitives/Checkbox";
import { IconButton } from "../../primitives/IconButton";
import { Popover } from "../../primitives/Popover";
import { Switch } from "../../primitives/Switch";
import { EventCard, type EventCardHandlers, MarkerBadge, type PlannerEventData } from "./EventCard";
import {
  balanceClassName,
  formatAmount,
  formatSigned,
  KST,
  ResourceIcon,
  SCHEDULE_GRID_CLASS_NAME,
  ScheduleDateRange,
} from "./pyroxene-ui";

export function PlannerSummary({ summary }: { summary: PyroxenePlannerSummary }) {
  const { targetCount, statusCounts, firstShort, last } = summary;
  const lastRange = last ? getBalanceRange(last) : null;
  return (
    <div className="grid grid-cols-2 gap-2 @md:grid-cols-3">
      <div className="rounded-lg bg-v2-surface p-3">
        <p className="text-xs text-v2-fg-secondary tabular-nums">
          목표 <span className="hidden @md:inline">이벤트</span>
          <span className="@md:hidden">{targetCount}개</span>
        </p>
        <p className="hidden text-xl font-semibold text-v2-fg tabular-nums @md:block">{targetCount}개</p>
        {targetCount > 0 ? (
          <p className="mt-1.5 text-sm font-semibold tabular-nums @md:mt-0 @md:text-xs @md:font-medium">
            <span className="text-v2-success">충분 {statusCounts.enough}</span>
            <span className="text-v2-fg-tertiary"> · </span>
            <span className="text-v2-warning">불확실 {statusCounts.uncertain}</span>
            <span className="text-v2-fg-tertiary"> · </span>
            <span className="text-v2-danger">부족 {statusCounts.short}</span>
          </p>
        ) : (
          <p className="text-xs text-v2-fg-tertiary">일정에서 학생을 눌러 목표로 추가해주세요</p>
        )}
      </div>
      <div className="order-first col-span-2 rounded-lg bg-v2-surface p-3 @md:order-none @md:col-span-1">
        <p className="text-xs text-v2-fg-secondary">처음 부족한 모집</p>
        {firstShort ? (
          <>
            <p className="text-xl font-semibold text-v2-danger tabular-nums">
              {Math.abs(firstShort.entry.accumulatedResources.pyroxene).toLocaleString()} 부족
            </p>
            <p className="flex min-w-0 items-center gap-1 text-xs text-v2-fg-secondary tabular-nums">
              {firstShort.marker !== null ? <MarkerBadge marker={firstShort.marker} short /> : null}
              <span className="shrink-0">{firstShort.entry.date.tz(KST).format("MM/DD")}</span>
              <span className="truncate">{firstShort.entry.source.event?.name}</span>
            </p>
          </>
        ) : (
          <p className="text-xl font-semibold text-v2-fg">없음</p>
        )}
      </div>
      <div className="rounded-lg bg-v2-surface p-3">
        <p className="text-xs text-v2-fg-secondary tabular-nums">
          <span className="hidden @md:inline">마지막 일정 후 </span>
          {last ? last.date.tz(KST).format("MM/DD") : null}
          <span className="@md:hidden">{last ? " 이후" : "마지막 일정 후"}</span>
        </p>
        {last ? (
          <>
            <p
              className={cn("text-xl font-semibold tabular-nums", balanceClassName(last.accumulatedResources.pyroxene))}
            >
              {formatAmount(last.accumulatedResources.pyroxene)}
            </p>
            {lastRange ? (
              <p className="hidden text-xs text-v2-fg-secondary tabular-nums @md:block">
                상하위 10% 이내 {formatAmount(lastRange.low)} ~ {formatAmount(lastRange.high)}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-xl font-semibold text-v2-fg-tertiary">—</p>
        )}
      </div>
    </div>
  );
}

const FILTERABLE_SOURCES = PYROXENE_SOURCE_DEFINITIONS.filter((source) => source.type !== "event");

function DisplayFilter({
  display,
  onChange,
}: {
  display: readonly TimelineSourceType[];
  onChange: (display: TimelineSourceType[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const idPrefix = useId();
  const visibleCount = FILTERABLE_SOURCES.filter((source) => display.includes(source.type)).length;
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`표시할 수급 종류, ${FILTERABLE_SOURCES.length}개 중 ${visibleCount}개 표시`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-md bg-v2-inset px-2 text-xs text-v2-fg tabular-nums hover:bg-v2-filled-hover",
          v2FocusRing,
        )}
      >
        <FunnelIcon className="size-3.5 text-v2-fg-secondary" aria-hidden="true" />
        {visibleCount}/{FILTERABLE_SOURCES.length}
        <ChevronDownIcon className="size-3.5 text-v2-fg-tertiary" aria-hidden="true" />
      </button>
      <Popover
        open={open}
        label="표시할 수급 종류"
        onClose={() => setOpen(false)}
        returnFocusRef={buttonRef}
        anchorRef={buttonRef}
        className="w-60"
      >
        <div className="flex flex-col gap-1.5 p-3">
          <p className="text-xs text-v2-fg-tertiary">숨긴 수급도 계산에는 들어가요. 모집 소비는 항상 표시해요.</p>
          {FILTERABLE_SOURCES.map((source) => (
            <Checkbox
              key={source.type}
              id={`${idPrefix}-${source.type}`}
              checked={display.includes(source.type)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...display, source.type] : display.filter((type) => type !== source.type))
              }
            >
              {source.label}
            </Checkbox>
          ))}
        </div>
      </Popover>
    </>
  );
}

export type ScheduleIncomeHandlers = {
  onDeleteItem: (itemUid: string) => void;
  onCollectedSourceChange: (sourceKey: string, collected: boolean) => void;
};

function deltaClassName(value: number): string {
  return value > 0 ? "text-v2-success" : value < 0 ? "text-v2-danger" : "text-v2-fg-tertiary";
}

function IncomeRowView({
  row,
  nested,
  handlers,
}: {
  row: PlannerIncomeRow;
  nested: boolean;
  handlers: ScheduleIncomeHandlers;
}) {
  const tickets = (["tenTimeTicket", "oneTimeTicket"] as const).filter((resource) => row.delta[resource] !== 0);
  return (
    <li
      className={cn(
        SCHEDULE_GRID_CLASS_NAME,
        "items-center pr-3 pl-7 text-[0.8125rem] @lg:px-3",
        nested ? "min-h-8 py-1" : "min-h-9 py-1.5",
      )}
    >
      {nested ? (
        <span className="text-v2-fg-secondary tabular-nums">
          {row.type === "aggregate" ? "~" : ""}
          {row.date.tz(KST).format("MM/DD")}
        </span>
      ) : (
        <span className="font-semibold text-v2-fg tabular-nums">
          {row.type === "aggregate" ? <span className="font-normal text-v2-fg-tertiary">~</span> : null}
          {row.date.tz(KST).format("MM/DD")}
        </span>
      )}
      <span className={cn("flex min-w-0 flex-wrap items-center gap-x-2", nested && "@lg:pl-5.5")}>
        <span className="truncate text-v2-fg">{row.label}</span>
        {tickets.map((resource) => (
          <span key={resource} className="inline-flex items-center gap-0.5 text-xs text-v2-fg-secondary tabular-nums">
            <ResourceIcon resource={resource} className="size-3.5" />
            {formatSigned(row.delta[resource])}
          </span>
        ))}
      </span>
      <span className={cn("text-right font-semibold tabular-nums", deltaClassName(row.delta.pyroxene))}>
        {row.delta.pyroxene === 0 ? "—" : formatSigned(row.delta.pyroxene)}
      </span>
      <span className="text-right text-v2-fg-secondary tabular-nums">{formatAmount(row.balance)}</span>
      <span className="flex flex-col items-end justify-center gap-0.5 @lg:flex-row @lg:justify-end">
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
    </li>
  );
}

export type PlannerScheduleProps = {
  rows: PlannerTimelineRow[];
  pending: boolean;
  display: readonly TimelineSourceType[];
  onDisplayChange: (display: TimelineSourceType[]) => void;
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
  display,
  onDisplayChange,
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
        <DisplayFilter display={display} onChange={onDisplayChange} />
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
      <div className={cn(SCHEDULE_GRID_CLASS_NAME, "hidden px-3 text-xs font-medium text-v2-fg-tertiary @lg:grid")}>
        <span>날짜</span>
        <span>내용</span>
        <span className="text-right">변화</span>
        <span className="text-right">남은 재화</span>
        <span />
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((row) => {
          if (row.kind === "year") {
            return (
              <p key={row.key} className="px-3 pt-3 pb-1 text-xs font-bold text-v2-fg-tertiary tabular-nums">
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
                <IncomeRowView row={row.row} nested={false} handlers={incomeHandlers} />
              </ul>
            );
          }
          const open = expanded.has(row.key);
          return (
            <div key={row.key}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(row.key)}
                className={cn(
                  SCHEDULE_GRID_CLASS_NAME,
                  "min-h-9 w-full cursor-pointer items-center rounded-md py-1.5 pr-3 pl-7 text-left text-[0.8125rem] hover:bg-v2-hover @lg:px-3",
                  v2FocusRing,
                )}
              >
                <span className="-ml-4.5 flex min-w-0 items-center gap-1 @lg:ml-0">
                  {open ? (
                    <ChevronDownIcon className="size-3.5 shrink-0 text-v2-fg-tertiary @lg:hidden" aria-hidden="true" />
                  ) : (
                    <ChevronRightIcon className="size-3.5 shrink-0 text-v2-fg-tertiary @lg:hidden" aria-hidden="true" />
                  )}
                  <ScheduleDateRange from={row.from} to={row.to} />
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {open ? (
                    <ChevronDownIcon
                      className="hidden size-3.5 shrink-0 text-v2-fg-tertiary @lg:block"
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronRightIcon
                      className="hidden size-3.5 shrink-0 text-v2-fg-tertiary @lg:block"
                      aria-hidden="true"
                    />
                  )}
                  <span className="shrink-0 text-v2-fg">
                    <span className="hidden @lg:inline">수급 </span>
                    {row.rows.length}건
                  </span>
                  <span className="truncate text-xs text-v2-fg-tertiary">
                    {row.breakdown
                      .map(({ label, count }) => (count === null ? label : `${label} ${count}`))
                      .join(" · ")}
                  </span>
                </span>
                <span className={cn("text-right font-semibold tabular-nums", deltaClassName(row.delta))}>
                  {formatSigned(row.delta)}
                </span>
                <span className={cn("text-right tabular-nums", balanceClassName(row.balance))}>
                  {formatAmount(row.balance)}
                </span>
                <span />
              </button>
              {open ? (
                <ul className="flex flex-col">
                  {row.rows.map((income) => (
                    <IncomeRowView key={income.key} row={income} nested handlers={incomeHandlers} />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
