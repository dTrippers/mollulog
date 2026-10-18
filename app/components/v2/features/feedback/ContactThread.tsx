import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant } from "~/lib/date-time";
import type { FeedbackReply, FeedbackTicket } from "~/models/feedback";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";

export function ContactThread({ ticket, replies }: { ticket: FeedbackTicket; replies: FeedbackReply[] }) {
  const timeZone = useDisplayTimeZone();

  return (
    <section className="rounded-lg bg-v2-surface p-v2-block-p">
      <div className="flex flex-col gap-1 rounded-md bg-v2-inset px-4 py-3">
        <p className="text-xs font-medium text-v2-fg-tertiary">문의 내용</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-7 text-v2-fg">{ticket.content}</p>
      </div>

      <section className="mt-v2-group-gap flex flex-col gap-3" aria-labelledby="contact-thread-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="contact-thread-heading" className="text-sm font-semibold text-v2-fg">
            대화 내역
          </h2>
          <p className="shrink-0 text-xs tabular-nums text-v2-fg-tertiary">{replies.length}개의 답글</p>
        </div>

        {replies.length === 0 ? (
          <StatusNotice tone="neutral">
            <div className="flex flex-col gap-1">
              <p className="font-medium">아직 등록된 답글이 없어요.</p>
              <p className="text-sm text-v2-fg-secondary">
                {ticket.status === "in_progress"
                  ? "문의를 확인 후 처리중이에요. 조금만 기다려주세요."
                  : "열심히 검토하고 있으니 조금만 기다려주세요."}
              </p>
            </div>
          </StatusNotice>
        ) : (
          <ol className="flex flex-col gap-v2-group-gap">
            {replies.map((reply) => (
              <li key={reply.uid} className={`flex ${reply.isAdmin ? "justify-start" : "justify-end"}`}>
                <article
                  className={`flex w-fit max-w-[85%] flex-col gap-1.5 rounded-lg px-4 py-3 ${
                    reply.isAdmin ? "bg-v2-inset" : "bg-v2-canvas"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <p className={reply.isAdmin ? "text-xs font-semibold text-v2-fg-secondary" : "text-xs text-v2-fg-tertiary"}>
                      {reply.isAdmin ? "운영팀 답변" : "내 문의"}
                    </p>
                    <time dateTime={reply.createdAt} className="text-xs tabular-nums text-v2-fg-tertiary">
                      {formatInstant(reply.createdAt, { timeZone, format: "YYYY/MM/DD HH:mm" })}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7 text-v2-fg">{reply.content}</p>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
