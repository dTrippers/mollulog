import dayjs from "dayjs";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { EmptyView } from "~/components/primitives";
import type { FeedbackReply, FeedbackTicket } from "~/models/feedback";
import FeedbackStatusBadge from "./FeedbackStatusBadge";

type ThreadViewProps = {
  ticket: FeedbackTicket;
  replies: FeedbackReply[];
};

export default function ThreadView({ ticket, replies }: ThreadViewProps) {
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="mt-1 text-xl font-bold">{ticket.title}</h2>
          </div>
          <FeedbackStatusBadge status={ticket.status} />
        </div>

        <div className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
          <p>{dayjs(ticket.createdAt).format("YYYY-MM-DD HH:mm")}</p>
        </div>

        <div className="mt-5 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900">
          <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">문의 내용</p>
          <p className="mt-2 whitespace-pre-wrap break-words leading-7 text-neutral-900 dark:text-neutral-100">
            {ticket.content}
          </p>
        </div>
      </section>

      <section>
        {replies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 px-4 dark:border-neutral-700">
            <EmptyView Icon={ChatBubbleLeftRightIcon} text="아직 등록된 답글이 없어요." />
          </div>
        ) : (
          <div className="space-y-4">
            {replies.map((reply) => (
              <div key={reply.uid} className={`flex ${reply.isAdmin ? "justify-start" : "justify-end"}`}>
                <div
                  className={`w-full max-w-2xl rounded-xl border p-4 ${
                    reply.isAdmin
                      ? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
                      : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/60"
                  }`}
                >
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {dayjs(reply.createdAt).format("YYYY-MM-DD HH:mm")}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words leading-7 text-neutral-900 dark:text-neutral-100">
                    {reply.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
