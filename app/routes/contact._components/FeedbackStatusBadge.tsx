import { OptionBadge } from "~/components/primitives";
import type { FeedbackTicketStatus } from "~/models/feedback";

const feedbackStatusMeta = {
  waiting: {
    text: "답변대기",
    color: "yellow",
  },
  in_progress: {
    text: "처리중",
    color: "blue",
  },
  resolved: {
    text: "답변완료",
    color: "green",
  },
} as const satisfies Record<FeedbackTicketStatus, { text: string; color: "yellow" | "blue" | "green" }>;

export function getFeedbackStatusText(status: FeedbackTicketStatus): string {
  return feedbackStatusMeta[status].text;
}

export default function FeedbackStatusBadge({ status }: { status: FeedbackTicketStatus }) {
  const meta = feedbackStatusMeta[status];

  return <OptionBadge text={meta.text} color={meta.color} bgColor="light" />;
}
