import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { Callout } from "~/components/primitives";
import { cn } from "~/lib/utils";
import type { FeedbackReply, FeedbackTicket } from "~/models/feedback";
import FeedbackStatusBadge from "./FeedbackStatusBadge";

type ThreadViewProps = {
  ticket: FeedbackTicket;
  replies: FeedbackReply[];
};

export default function ThreadView({ ticket, replies }: ThreadViewProps) {
  return (
    <section className="rounded-lg bg-card p-5 text-card-foreground shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-lg font-semibold md:text-xl">{ticket.title}</h2>
          <p className="text-sm text-muted-foreground">{dayjs(ticket.createdAt).format("YYYY-MM-DD HH:mm")}</p>
        </div>
        <FeedbackStatusBadge status={ticket.status} />
      </div>

      <section className="mt-6 flex flex-col gap-3 rounded-lg bg-muted/40 p-4">
        <p className="text-sm font-medium">문의 내용</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{ticket.content}</p>
      </section>

      <section className="mt-8 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">대화 내역</h3>
          <p className="text-sm text-muted-foreground">{replies.length}개의 답글</p>
        </div>

        {replies.length === 0 ? (
          <Callout
            Icon={ChatBubbleLeftRightIcon}
            title="아직 등록된 답글이 없어요."
            description="열심히 검토하고 있으니 조금만 기다려주세요."
            tone="info"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {replies.map((reply) => (
              <div key={reply.uid} className={cn("flex", reply.isAdmin ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "flex w-full max-w-2xl flex-col gap-2 rounded-lg px-4 py-3",
                    reply.isAdmin ? "bg-primary/10" : "bg-background",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {reply.isAdmin ? "운영팀 답변" : "내 문의"}
                    </p>
                    <p className="text-xs text-muted-foreground">{dayjs(reply.createdAt).format("YYYY-MM-DD HH:mm")}</p>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{reply.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
