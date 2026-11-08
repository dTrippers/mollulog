import { CheckIcon, ExclamationCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";
import type { PyroxeneEventStatus } from "~/domain/pyroxene-planner-view";
import { PYROXENE_RESOURCE_UIDS } from "~/domain/pyroxene-sources";
import { cn } from "~/lib/utils";
import { resourceImageUrl } from "~/models/assets";
import { useV2Page } from "../../layout/V2Page";
import { Dialog } from "../../primitives/Dialog";
import { Sheet } from "../../primitives/Sheet";

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
      className={cn("inline-block size-5 shrink-0 object-contain", className)}
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
      className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 text-xs leading-5 font-medium", className)}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

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
