import { ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export type StatusNoticeProps = {
  tone: "danger" | "warning" | "neutral";
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

const toneClassName = {
  danger: "text-v2-danger",
  warning: "text-v2-warning",
  neutral: "text-v2-fg-secondary",
} as const;

const Icon = {
  danger: XCircleIcon,
  warning: ExclamationTriangleIcon,
  neutral: InformationCircleIcon,
} as const;

// A status line: the icon and the text carry the meaning together, so color is never the only signal.
// Danger is announced as an alert, and the other tones as a status update.
export function StatusNotice({ tone, children, action, className }: StatusNoticeProps) {
  const ToneIcon = Icon[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-2 text-sm", toneClassName[tone], className)}
    >
      <ToneIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-v2-fg">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
