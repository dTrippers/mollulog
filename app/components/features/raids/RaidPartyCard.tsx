import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import type { ElementType, ReactNode } from "react";
import { useState } from "react";
import { StudentCard } from "~/components/features/students";
import type { Attack, Defense } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
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
  unrecruited?: boolean;
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
  primaryLabel?: ReactNode;
  secondaryLabel?: ReactNode;
  rows: RaidPartyRow[];
  summaryItems: RaidPartySummaryItem[];
  actions?: ReactNode;
  popupIdPrefix: string;
  visibleRowCount?: number;
  centerRowLabels?: boolean;
  emptyText?: string;
  className?: string;
  summaryClassName?: string;
  slotCount?: 6 | 10;
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
  visibleRowCount,
  centerRowLabels = false,
  emptyText = "편성 데이터가 없어요",
  className,
  summaryClassName,
  slotCount = PARTY_SLOT_COUNT,
  getStudentActions,
}: RaidPartyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = visibleRowCount !== undefined && rows.length > visibleRowCount;
  const visibleRows = shouldCollapse && !expanded ? rows.slice(0, visibleRowCount) : rows;
  const hiddenRowCount = shouldCollapse ? rows.length - visibleRows.length : 0;
  const hasHeader = primaryLabel != null || secondaryLabel != null || actions != null;

  return (
    <article className={cn("rounded-lg bg-card p-3 md:p-4", className)}>
      {hasHeader ? (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {primaryLabel != null ? (
              <span className="text-lg font-bold leading-tight text-foreground">{primaryLabel}</span>
            ) : null}
            {secondaryLabel != null ? (
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">{secondaryLabel}</span>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1">{actions}</div> : null}
        </div>
      ) : null}

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
                  centerRowLabel={centerRowLabels}
                  slotCount={slotCount}
                  getStudentActions={getStudentActions}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
          )}
        </div>

        {summaryItems.length > 0 ? (
          <dl
            className={cn(
              "grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-background/70 p-3 text-sm sm:grid-cols-3 lg:w-48 lg:grid-cols-1",
              summaryClassName,
            )}
          >
            {summaryItems.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
                <dd className="mt-0.5 truncate font-semibold tabular-nums text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {shouldCollapse ? (
        <button
          type="button"
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
  centerRowLabel,
  slotCount,
  getStudentActions,
}: {
  row: RaidPartyRow;
  rowIndex: number;
  popupIdPrefix: string;
  centerRowLabel: boolean;
  slotCount: 6 | 10;
  getStudentActions?: RaidPartyCardProps["getStudentActions"];
}) {
  const slots = getFixedPartySlots(row.slots, slotCount);

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 sm:flex-row sm:gap-2",
        centerRowLabel ? "sm:items-center" : "sm:items-start",
      )}
    >
      <span
        className={cn("shrink-0 text-xs font-medium tabular-nums text-muted-foreground", !centerRowLabel && "sm:mt-2")}
      >
        {row.label}
      </span>
      <div
        className={cn(
          "grid w-full min-w-0 sm:flex-1",
          slotCount === 10 ? "grid-cols-10 gap-1 sm:max-w-[34rem] sm:gap-1.5" : "grid-cols-6 gap-1.5 sm:max-w-80",
        )}
      >
        {slots.map((slot, slotIndex) => (
          <PartyStudentCard
            // biome-ignore lint/suspicious/noArrayIndexKey: party slots have stable positional identity
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

function getFixedPartySlots(slots: RaidPartySlot[], slotCount: 6 | 10): RaidPartySlot[] {
  return [...slots, ...Array<RaidPartySlot>(Math.max(slotCount - slots.length, 0)).fill({ uid: null })].slice(
    0,
    slotCount,
  );
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
      <div className="min-w-0">
        <div className="aspect-square w-full rounded-lg bg-muted/60" />
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
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
      {slot.badge ??
        (slot.unrecruited ? (
          <span className="pointer-events-none absolute top-1 right-0 origin-top-right scale-75 rounded-sm bg-neutral-900/80 px-1 py-0.5 text-xs font-bold leading-none text-white shadow-sm dark:bg-neutral-50/90 dark:text-neutral-900">
            미모집
          </span>
        ) : null)}
    </div>
  );
}
