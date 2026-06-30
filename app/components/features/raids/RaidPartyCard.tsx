import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import type { ElementType, ReactNode } from "react";
import { useState } from "react";
import { StudentCard } from "~/components/features/students";
import type { Attack, Defense } from "~/graphql/graphql";
import type { Role } from "~/models/content.d";

export type RaidPartyStudentAction = {
  Icon?: ElementType;
  text: string;
  link?: string;
  onClick?: () => void;
};

export type RaidPartySlot = {
  uid: string | null;
  name?: string | null;
  attackType?: Attack;
  defenseType?: Defense;
  role?: Role;
  tier?: number | null;
  level?: number | null;
  isAssist?: boolean | null;
  grayscale?: boolean;
  badge?: ReactNode;
};

export type RaidPartyRow = {
  key: string;
  label: string;
  slots: RaidPartySlot[];
};

type RaidPartySummaryItem = {
  label: string;
  value: ReactNode;
};

type RaidPartyCardProps = {
  primaryLabel: ReactNode;
  secondaryLabel?: ReactNode;
  rows: RaidPartyRow[];
  summaryItems: RaidPartySummaryItem[];
  actions?: ReactNode;
  popupIdPrefix: string;
  surface?: "default" | "elevated";
  visibleRowCount?: number;
  emptyText?: string;
  getStudentActions?: (slot: RaidPartySlot, rowIndex: number, slotIndex: number) => RaidPartyStudentAction[];
};

const PARTY_SLOT_COUNT = 6;

export default function RaidPartyCard({
  primaryLabel,
  secondaryLabel,
  rows,
  summaryItems,
  actions,
  popupIdPrefix,
  surface = "default",
  visibleRowCount,
  emptyText = "편성 데이터가 없어요",
  getStudentActions,
}: RaidPartyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = visibleRowCount !== undefined && rows.length > visibleRowCount;
  const visibleRows = shouldCollapse && !expanded ? rows.slice(0, visibleRowCount) : rows;
  const hiddenRowCount = shouldCollapse ? rows.length - visibleRows.length : 0;

  const cardClassName =
    surface === "elevated"
      ? "rounded-lg bg-neutral-100 p-3 dark:bg-neutral-900/80 md:p-4"
      : "rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800/50 md:p-4";
  const summaryClassName =
    surface === "elevated"
      ? "grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-white/70 p-3 text-sm dark:bg-neutral-950/50 sm:grid-cols-3 lg:w-48 lg:grid-cols-1"
      : "grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-white/70 p-3 text-sm dark:bg-neutral-900/40 sm:grid-cols-3 lg:w-48 lg:grid-cols-1";

  return (
    <article className={cardClassName}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-lg font-bold leading-tight text-neutral-900 dark:text-neutral-100">{primaryLabel}</span>
          {secondaryLabel ? (
            <span className="text-sm font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
              {secondaryLabel}
            </span>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1">{actions}</div> : null}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {visibleRows.length > 0 ? (
            <div className="space-y-2">
              {visibleRows.map((row, rowIndex) => (
                <PartyRow
                  key={row.key}
                  row={row}
                  rowIndex={rowIndex}
                  popupIdPrefix={popupIdPrefix}
                  getStudentActions={getStudentActions}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">{emptyText}</p>
          )}
        </div>

        {summaryItems.length > 0 ? (
          <dl className={summaryClassName}>
            {summaryItems.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{item.label}</dt>
                <dd className="mt-0.5 truncate font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {shouldCollapse ? (
        <button
          type="button"
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
          <span>{expanded ? "접기" : `${hiddenRowCount.toLocaleString()}개 편성 더 보기`}</span>
        </button>
      ) : null}
    </article>
  );
}

function PartyRow({
  row,
  rowIndex,
  popupIdPrefix,
  getStudentActions,
}: {
  row: RaidPartyRow;
  rowIndex: number;
  popupIdPrefix: string;
  getStudentActions?: RaidPartyCardProps["getStudentActions"];
}) {
  const slots = getFixedPartySlots(row.slots);

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400 sm:mt-2 sm:w-10">
        {row.label}
      </span>
      <div className="grid w-full min-w-0 grid-cols-6 gap-1.5 sm:w-fit sm:flex-none">
        {slots.map((slot, slotIndex) => (
          <PartyStudentCard
            key={`${slot.uid ?? "empty"}-${slotIndex}`}
            slot={slot}
            popupId={`${popupIdPrefix}-${rowIndex}-${slotIndex}-${slot.uid ?? "empty"}`}
            actions={getStudentActions?.(slot, rowIndex, slotIndex) ?? []}
          />
        ))}
      </div>
    </div>
  );
}

function getFixedPartySlots(slots: RaidPartySlot[]): RaidPartySlot[] {
  return [...slots, ...Array<RaidPartySlot>(Math.max(PARTY_SLOT_COUNT - slots.length, 0)).fill({ uid: null })];
}

function PartyStudentCard({
  slot,
  popupId,
  actions,
}: {
  slot: RaidPartySlot;
  popupId: string;
  actions: RaidPartyStudentAction[];
}) {
  if (!slot.uid) {
    return (
      <div className="min-w-0 sm:w-12">
        <div className="aspect-square w-full rounded-lg bg-neutral-200/60 dark:bg-neutral-700/50" />
      </div>
    );
  }

  return (
    <div className="relative min-w-0 sm:w-12">
      <StudentCard
        uid={slot.uid}
        name={slot.name}
        nameSize="small"
        hideName
        attackType={slot.attackType}
        defenseType={slot.defenseType}
        role={slot.role}
        tier={slot.tier}
        level={slot.level}
        isAssist={slot.isAssist ?? undefined}
        grayscale={slot.grayscale}
        popups={slot.name && actions.length > 0 ? actions : undefined}
        popupId={slot.name && actions.length > 0 ? popupId : undefined}
      />
      {slot.badge}
    </div>
  );
}
