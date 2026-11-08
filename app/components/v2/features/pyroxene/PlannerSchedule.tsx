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
import { balanceClassName, formatAmount, formatSigned } from "./pyroxene-ui";

export function PlannerSummary({ summary }: { summary: PyroxenePlannerSummary }) {
  const { targetCount, statusCounts, firstShort, last } = summary;
  const lastRange = last ? getBalanceRange(last) : null;
  return (
    <div className="grid grid-cols-1 gap-2 @md:grid-cols-3">
      <div className="rounded-lg bg-v2-surface p-3">
        <p className="text-xs text-v2-fg-secondary">목표 이벤트</p>
        <p className="text-xl font-semibold text-v2-fg tabular-nums">{targetCount}개</p>
        {targetCount > 0 ? (
          <p className="text-xs font-medium tabular-nums">
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
      <div className="rounded-lg bg-v2-surface p-3">
        <p className="text-xs text-v2-fg-secondary">처음 부족한 모집</p>
        {firstShort ? (
          <>
            <p className="text-xl font-semibold text-v2-danger tabular-nums">
              {Math.abs(firstShort.entry.accumulatedResources.pyroxene).toLocaleString()} 부족
            </p>
            <p className="flex min-w-0 items-center gap-1 text-xs text-v2-fg-secondary tabular-nums">
              {firstShort.marker !== null ? <MarkerBadge marker={firstShort.marker} short /> : null}
              <span className="shrink-0">{firstShort.entry.date.tz("Asia/Seoul").format("MM/DD")}</span>
              <span className="truncate">{firstShort.entry.source.event?.name}</span>
            </p>
          </>
        ) : (
          <p className="text-xl font-semibold text-v2-fg">없음</p>
        )}
      </div>
      <div className="rounded-lg bg-v2-surface p-3">
        <p className="text-xs text-v2-fg-secondary tabular-nums">
          마지막 일정 후{last ? ` ${last.date.tz("Asia/Seoul").format("MM/DD")}` : ""}
        </p>
        {last ? (
          <>
            <p
              className={cn("text-xl font-semibold tabular-nums", balanceClassName(last.accumulatedResources.pyroxene))}
            >
              {formatAmount(last.accumulatedResources.pyroxene)}
            </p>
            {lastRange ? (
              <p className="text-xs text-v2-fg-secondary tabular-nums">
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

function IncomeRowView({
  row,
  nested,
  handlers,
}: {
  row: PlannerIncomeRow;
  nested: boolean;
  handlers: ScheduleIncomeHandlers;
}) {
  const ticketText = [
    row.delta.tenTimeTicket !== 0 ? `10회 티켓 ${formatSigned(row.delta.tenTimeTicket)}` : null,
    row.delta.oneTimeTicket !== 0 ? `1회 티켓 ${formatSigned(row.delta.oneTimeTicket)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="grid min-h-8 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 text-sm @lg:grid-cols-[4.5rem_minmax(0,1fr)_5rem_6rem_3.5rem]">
      <span className="text-xs text-v2-fg-secondary tabular-nums">
        {row.type === "aggregate" ? "~" : ""}
        {row.date.tz("Asia/Seoul").format("MM/DD")}
      </span>
      <span className={cn("min-w-0", nested && "@lg:pl-4")}>
        <span className="block truncate text-v2-fg">{row.label}</span>
        {ticketText ? <span className="block text-xs text-v2-fg-tertiary tabular-nums">{ticketText}</span> : null}
      </span>
      <span
        className={cn(
          "text-right tabular-nums",
          row.delta.pyroxene > 0
            ? "text-v2-success"
            : row.delta.pyroxene < 0
              ? "text-v2-danger"
              : "text-v2-fg-tertiary",
        )}
      >
        {row.delta.pyroxene === 0 ? "—" : formatSigned(row.delta.pyroxene)}
      </span>
      <span className="hidden text-right text-v2-fg-secondary tabular-nums @lg:block">{formatAmount(row.balance)}</span>
      <span className="col-span-3 flex justify-end gap-0.5 empty:hidden @lg:col-span-1">
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
      <div className="hidden grid-cols-[4.5rem_minmax(0,1fr)_5rem_6rem_3.5rem] gap-x-3 px-3 text-xs text-v2-fg-tertiary @lg:grid">
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
              <p key={row.key} className="px-3 pt-2 text-xs font-semibold text-v2-fg-secondary tabular-nums">
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
          const sameDay = row.from.isSame(row.to, "day");
          return (
            <div key={row.key}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(row.key)}
                className={cn(
                  "grid min-h-8 w-full cursor-pointer grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-3 text-left text-sm hover:bg-v2-hover @lg:grid-cols-[4.5rem_minmax(0,1fr)_5rem_6rem_3.5rem]",
                  v2FocusRing,
                )}
              >
                <span className="text-xs text-v2-fg-secondary tabular-nums">
                  {row.from.tz("Asia/Seoul").format("MM/DD")}
                  {sameDay ? "" : ` ~${row.to.tz("Asia/Seoul").format("MM/DD")}`}
                </span>
                <span className="flex min-w-0 items-center gap-1">
                  {open ? (
                    <ChevronDownIcon className="size-3.5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
                  ) : (
                    <ChevronRightIcon className="size-3.5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
                  )}
                  <span className="shrink-0 text-v2-fg">수급 {row.rows.length}건</span>
                  <span className="truncate text-xs text-v2-fg-tertiary">
                    {row.breakdown.map(({ label, count }) => `${label} ${count}`).join(" · ")}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    row.delta > 0 ? "text-v2-success" : row.delta < 0 ? "text-v2-danger" : "text-v2-fg-tertiary",
                  )}
                >
                  {formatSigned(row.delta)}
                </span>
                <span className={cn("hidden text-right tabular-nums @lg:block", balanceClassName(row.balance))}>
                  {formatAmount(row.balance)}
                </span>
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
