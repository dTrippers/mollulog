import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from "@heroicons/react/16/solid";
import { type Ref, useId, useState } from "react";
import type { PyroxenePickupChance } from "~/domain/pyroxene-planner";
import type { PlannerIncomeRow, PlannerTimelineRow } from "~/domain/pyroxene-planner-view";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { IconButton } from "../../primitives/IconButton";
import { Switch } from "../../primitives/Switch";
import { EventCard, type EventCardHandlers, type PlannerEventData } from "./EventCard";
import { formatAmount, formatSigned, KST, ResourceIcon, SCHEDULE_GRID_CLASS_NAME } from "./pyroxene-ui";

export type ScheduleIncomeHandlers = {
  onDeleteItem: (itemUid: string) => void;
};

function deltaClassName(value: number): string {
  return value > 0 ? "text-v2-success" : value < 0 ? "text-v2-danger" : "text-v2-fg-tertiary";
}

const RESOURCE_ORDER = ["pyroxene", "tenTimeTicket", "oneTimeTicket"] as const;

/** Every resource a row changes, one per line with its icon, for the change column. */
function ResourceDeltas({
  delta,
  muted = false,
  subtle = false,
  className,
}: {
  delta: PlannerIncomeRow["delta"];
  // A received reward: already in the owned resources, so it no longer changes the balance.
  muted?: boolean;
  // A breakdown line under an aggregate row.
  subtle?: boolean;
  className?: string;
}) {
  const changed = RESOURCE_ORDER.filter((resource) => delta[resource] !== 0);
  return (
    <span className={cn("flex flex-col items-end gap-0.5 font-semibold tabular-nums", className)}>
      {changed.length === 0 ? <span className="text-v2-fg-tertiary">—</span> : null}
      {changed.map((resource) => (
        <span
          key={resource}
          className={cn(
            "inline-flex items-center gap-0.5",
            muted
              ? "text-v2-fg-tertiary line-through"
              : subtle
                ? "text-v2-fg-secondary"
                : deltaClassName(delta[resource]),
          )}
        >
          <ResourceIcon resource={resource} className={cn("my-0", subtle ? "size-4" : "size-5")} />
          {formatSigned(delta[resource])}
        </span>
      ))}
    </span>
  );
}

function IncomeRowView({
  row,
  expanded,
  onToggle,
  handlers,
}: {
  row: PlannerIncomeRow;
  expanded: boolean;
  onToggle: () => void;
  handlers: ScheduleIncomeHandlers;
}) {
  const breakdownId = useId();
  const breakdown = row.type === "aggregate" ? (row.breakdown ?? []) : [];
  return (
    <>
      <li className={cn(SCHEDULE_GRID_CLASS_NAME, "items-start py-1.5 pr-3 pl-4 text-[0.8125rem] @2xl:py-2 @2xl:px-4")}>
        <span className="font-semibold text-v2-fg tabular-nums">
          {row.type === "aggregate" ? <span className="font-normal text-v2-fg-tertiary">~</span> : null}
          {row.date.tz(KST).format("MM/DD")}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {breakdown.length > 0 ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={breakdownId}
              onClick={onToggle}
              className={cn(
                "inline-flex cursor-pointer items-center gap-0.5 rounded text-left text-v2-fg-secondary hover:text-v2-fg v2-interaction-transition",
                v2FocusRing,
              )}
            >
              {row.label}
              {expanded ? (
                <ChevronUpIcon className="size-3.5" aria-hidden="true" />
              ) : (
                <ChevronDownIcon className="size-3.5" aria-hidden="true" />
              )}
            </button>
          ) : (
            <span className="min-w-0 break-keep whitespace-pre-line text-v2-fg">{row.label}</span>
          )}
          {row.collected ? (
            <span className="shrink-0 rounded bg-v2-inset px-1.5 text-xs font-medium text-v2-fg-secondary">
              보상 받음
            </span>
          ) : null}
        </span>
        <ResourceDeltas delta={row.delta} muted={row.collected} />
        <span className="text-right text-v2-fg-secondary tabular-nums">{formatAmount(row.balance)}</span>
        <span className="-my-1.5 flex justify-end">
          {row.itemUid ? (
            <IconButton
              icon={TrashIcon}
              label={`${row.label} 삭제`}
              onClick={() => handlers.onDeleteItem(row.itemUid as string)}
            />
          ) : null}
        </span>
      </li>
      {breakdown.length > 0 && expanded ? (
        <li id={breakdownId}>
          <ul className="flex flex-col pb-1">
            {breakdown.map((item) => (
              <li
                key={item.type}
                className={cn(
                  SCHEDULE_GRID_CLASS_NAME,
                  "items-center py-0.5 pr-3 pl-4 text-xs text-v2-fg-secondary @2xl:px-4",
                )}
              >
                <span />
                <span className="min-w-0 pl-3">{item.label}</span>
                <ResourceDeltas delta={item.delta} subtle className="font-medium" />
                <span />
                <span />
              </li>
            ))}
          </ul>
        </li>
      ) : null}
    </>
  );
}

type ScheduleItem =
  | Exclude<PlannerTimelineRow, { kind: "income" }>
  | { kind: "incomes"; key: string; rows: PlannerIncomeRow[] };

function groupIncomeRuns(rows: PlannerTimelineRow[]): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  for (const row of rows) {
    if (row.kind !== "income") {
      items.push(row);
      continue;
    }
    const last = items[items.length - 1];
    if (last?.kind === "incomes") last.rows.push(row.row);
    else items.push({ kind: "incomes", key: row.key, rows: [row.row] });
  }
  return items;
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
  canRecordCompletion: boolean;
  // The 모집 기록 editor link of each completed event, by event uid.
  recordEditLinks: ReadonlyMap<string, string>;
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
  canRecordCompletion,
  recordEditLinks,
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
          label="관심 학생 없는 이벤트 숨기기"
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
        {groupIncomeRuns(rows).map((item) => {
          if (item.kind === "incomes") {
            // Consecutive income rows share one list, so they sit together between event cards.
            return (
              <ul key={item.key} className="flex flex-col">
                {item.rows.map((income) => (
                  <IncomeRowView
                    key={income.key}
                    row={income}
                    expanded={expanded.has(income.key)}
                    onToggle={() => toggle(income.key)}
                    handlers={incomeHandlers}
                  />
                ))}
              </ul>
            );
          }
          const row = item;
          if (row.kind === "year") {
            return (
              <p key={row.key} className="px-4 pt-3 pb-1 text-xs font-bold text-v2-fg-tertiary tabular-nums">
                {row.year}
              </p>
            );
          }
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
              canRecordCompletion={canRecordCompletion}
              recordEditLink={recordEditLinks.get(uid)}
              selected={selected}
              handlers={eventHandlers}
            />
          );
        })}
      </div>
    </section>
  );
}
