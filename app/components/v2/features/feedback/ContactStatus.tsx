import { ArrowPathIcon, CheckCircleIcon, ClockIcon } from "@heroicons/react/16/solid";
import type { ElementType } from "react";
import type { FeedbackTicketStatus } from "~/models/feedback";

const statusPresentation = {
  waiting: { label: "답변대기", Icon: ClockIcon, className: "text-v2-fg-secondary" },
  in_progress: { label: "처리중", Icon: ArrowPathIcon, className: "text-v2-fg-secondary" },
  resolved: { label: "답변완료", Icon: CheckCircleIcon, className: "text-v2-success" },
} as const satisfies Record<FeedbackTicketStatus, { label: string; Icon: ElementType; className: string }>;

export function ContactStatus({ status }: { status: FeedbackTicketStatus }) {
  const { label, Icon, className } = statusPresentation[status];

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
