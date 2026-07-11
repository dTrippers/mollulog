import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { Link } from "react-router";
import { Callout } from "~/components/primitives";
import type { FeedbackTicket } from "~/models/feedback";
import FeedbackStatusBadge from "./FeedbackStatusBadge";

function getPreview(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 110) {
    return normalized;
  }

  return `${normalized.slice(0, 110)}...`;
}

export default function TicketList({ tickets }: { tickets: FeedbackTicket[] }) {
  return (
    <section className="rounded-lg bg-card p-5 text-card-foreground shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">내 문의 내역</h2>
      </div>

      {tickets.length === 0 ? (
        <Callout
          Icon={ChatBubbleLeftRightIcon}
          title="등록된 문의가 아직 없어요."
          description="아래 폼에서 첫 문의를 남겨보세요."
          tone="info"
        />
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Link
              key={ticket.uid}
              to={`/contact/${ticket.uid}`}
              className="block rounded-lg bg-background px-4 py-4 transition-colors hover:bg-muted/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{ticket.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{getPreview(ticket.content)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {dayjs(ticket.createdAt).format("YYYY-MM-DD HH:mm")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <FeedbackStatusBadge status={ticket.status} />
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
