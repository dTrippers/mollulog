import type { FeedbackTicketStatus } from "~/models/feedback";
import { cn } from "~/lib/utils";

const feedbackStatusMeta = {
  waiting: {
    text: "답변대기",
    className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  in_progress: {
    text: "처리중",
    className: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  resolved: {
    text: "답변완료",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
} as const satisfies Record<FeedbackTicketStatus, { text: string; className: string }>;

export function getFeedbackStatusText(status: FeedbackTicketStatus): string {
  return feedbackStatusMeta[status].text;
}

export default function FeedbackStatusBadge({ status }: { status: FeedbackTicketStatus }) {
  const meta = feedbackStatusMeta[status];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium md:text-sm",
        meta.className,
      )}
    >
      {meta.text}
    </span>
  );
}
