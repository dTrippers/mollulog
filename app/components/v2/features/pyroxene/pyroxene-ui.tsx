import { CheckIcon, ExclamationCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";
import type { PyroxeneEventStatus } from "~/domain/pyroxene-planner-view";
import { PYROXENE_RESOURCE_UIDS } from "~/domain/pyroxene-sources";
import { cn } from "~/lib/utils";
import { resourceImageUrl } from "~/models/assets";
import { useV2Page } from "../../layout/V2Page";
import { Dialog } from "../../primitives/Dialog";
import { Sheet } from "../../primitives/Sheet";

export const KST = "Asia/Seoul";

export type PyroxeneResourceKey = keyof typeof PYROXENE_RESOURCE_UIDS;

export const PYROXENE_RESOURCE_LABELS: Record<PyroxeneResourceKey, string> = {
  pyroxene: "청휘석",
  tenTimeTicket: "10회 모집 티켓",
  oneTimeTicket: "1회 모집 티켓",
};

export const RECRUITMENT_STACK_LABELS = { regular: "모집 스택", limited: "특별 스택" } as const;

export function formatAmount(value: number): string {
  return value < 0 ? `−${Math.abs(value).toLocaleString()}` : value.toLocaleString();
}

export function formatSigned(value: number): string {
  if (value === 0) return "0";
  return value > 0 ? `+${value.toLocaleString()}` : `−${Math.abs(value).toLocaleString()}`;
}

export function ResourceIcon({ resource, className }: { resource: PyroxeneResourceKey; className?: string }) {
  return (
    <img
      src={resourceImageUrl(resource === "pyroxene" ? "currency" : "item", PYROXENE_RESOURCE_UIDS[resource])}
      alt={PYROXENE_RESOURCE_LABELS[resource]}
      className={cn("-my-1 inline-block size-6 shrink-0 object-contain", className)}
      loading="lazy"
    />
  );
}

const statusContent: Record<PyroxeneEventStatus, { label: string; className: string; Icon: typeof CheckIcon }> = {
  enough: { label: "충분", className: "bg-v2-success-subtle text-v2-success", Icon: CheckIcon },
  uncertain: { label: "불확실", className: "bg-v2-warning-subtle text-v2-warning", Icon: ExclamationTriangleIcon },
  short: { label: "부족", className: "bg-v2-danger-subtle text-v2-danger", Icon: ExclamationCircleIcon },
};

export function StatusPill({ status }: { status: PyroxeneEventStatus }) {
  const { label, className, Icon } = statusContent[status];
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center gap-1 rounded-full px-2 text-xs font-semibold whitespace-nowrap",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Shared columns for the schedule: date, content, change, balance, actions. Mobile keeps the numbers in fixed widths so
 * they line up across separate rows.
 *
 * A mobile row takes two lines so the title gets the full width: the title spans the first line, and the details,
 * change, balance, and actions sit on the second. The date cell spans both lines.
 */
export const SCHEDULE_GRID_CLASS_NAME =
  "grid grid-cols-[4.75rem_minmax(0,1fr)_3.5rem_3.5rem_1.75rem] gap-x-1.5 gap-y-0.5 @lg:grid-cols-[5.75rem_minmax(0,1fr)_6.5rem_11rem_4.5rem] @lg:gap-x-3 @lg:gap-y-0";
export const SCHEDULE_DATE_CELL = "row-span-2 self-stretch @lg:row-span-1 @lg:self-auto";
export const SCHEDULE_TITLE_CELL = "col-span-4 @lg:col-span-1";
export const SCHEDULE_DETAIL_CELL = "col-start-2 row-start-2 @lg:hidden";
export const SCHEDULE_CHANGE_CELL = "col-start-3 row-start-2 @lg:col-start-auto @lg:row-start-auto";
export const SCHEDULE_BALANCE_CELL = "col-start-4 row-start-2 @lg:col-start-auto @lg:row-start-auto";
export const SCHEDULE_ACTION_CELL = "col-start-5 row-start-2 @lg:col-start-auto @lg:row-start-auto";

export function balanceClassName(value: number): string {
  return value < 0 ? "text-v2-danger" : "text-v2-fg";
}

/** A dialog on side-by-side layouts and a bottom sheet on stacked ones, with a scrolling body and a footer. */
export function PlannerDialog({
  open,
  title,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { stacked } = useV2Page();
  if (stacked) {
    return (
      <Sheet open={open} title={title} onClose={onClose} footer={footer}>
        <div className="flex flex-col gap-4">{children}</div>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm">
      <div className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1">{children}</div>
      {footer ? <div className="flex justify-end gap-2">{footer}</div> : null}
    </Dialog>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-v2-fg-secondary">
      {children}
    </label>
  );
}

export const v2TextInputClassName =
  "min-h-v2-input-min w-full rounded-md border border-v2-control-border bg-v2-surface px-3 py-1 text-sm text-v2-fg tabular-nums focus:border-v2-control-border-strong";
