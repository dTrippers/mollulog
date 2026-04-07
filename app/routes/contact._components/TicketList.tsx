import dayjs from "dayjs";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { EmptyView } from "~/components/primitives";
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
    <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/40">
      <div className="mb-6">
        <h2 className="text-lg font-bold">내 문의 내역</h2>
      </div>

      {tickets.length === 0 ? (
        <EmptyView Icon={ChatBubbleLeftRightIcon} text="등록된 문의가 아직 없어요." />
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Link
              key={ticket.uid}
              to={`/contact/${ticket.uid}`}
              className="block rounded-xl border border-neutral-200 px-4 py-4 transition hover:border-blue-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-blue-700 dark:hover:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-neutral-900 dark:text-neutral-100">{ticket.title}</p>
                  <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{getPreview(ticket.content)}</p>
                  <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
                    {dayjs(ticket.createdAt).format("YYYY-MM-DD HH:mm")}
                  </p>
                </div>
                <FeedbackStatusBadge status={ticket.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
