import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/16/solid";
import type { ElementType, ReactNode } from "react";
import { cn } from "~/lib/utils";

export type StatusNoticeProps = {
  tone: "danger" | "warning" | "neutral" | "success";
  children: ReactNode;
  Icon?: ElementType;
  action?: ReactNode;
  // A boxed notice sits on a tinted panel, for a notice that stands apart from the surrounding content.
  boxed?: boolean;
  className?: string;
};

const toneClassName = {
  danger: "text-v2-danger",
  warning: "text-v2-warning",
  neutral: "text-v2-fg-secondary",
  success: "text-v2-success",
} as const;

const boxedClassName = {
  danger: "rounded-lg bg-v2-danger-subtle px-3 py-2.5",
  warning: "rounded-lg bg-v2-warning-subtle px-3 py-2.5",
  neutral: "rounded-lg bg-v2-inset px-3 py-2.5",
  success: "rounded-lg bg-v2-success-subtle px-3 py-2.5",
} as const;

const Icon = {
  danger: XCircleIcon,
  warning: ExclamationTriangleIcon,
  neutral: InformationCircleIcon,
  success: CheckCircleIcon,
} as const;

// A status line: the icon and the text carry the meaning together, so color is never the only signal.
// Danger is announced as an alert, and the other tones as a status update.
export function StatusNotice({
  tone,
  children,
  Icon: CustomIcon,
  action,
  boxed = false,
  className,
}: StatusNoticeProps) {
  const ToneIcon = CustomIcon ?? Icon[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-2 text-sm", toneClassName[tone], boxed && boxedClassName[tone], className)}
    >
      <ToneIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className={cn("min-w-0 flex-1", boxed && tone === "neutral" ? "text-v2-fg-secondary" : "text-v2-fg")}>
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
