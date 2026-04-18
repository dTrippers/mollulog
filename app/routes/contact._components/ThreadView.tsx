import dayjs from "dayjs";
import { MessageSquareTextIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import type { FeedbackReply, FeedbackTicket } from "~/models/feedback";
import FeedbackStatusBadge from "./FeedbackStatusBadge";

type ThreadViewProps = {
  ticket: FeedbackTicket;
  replies: FeedbackReply[];
};

export default function ThreadView({ ticket, replies }: ThreadViewProps) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <CardTitle className="text-lg md:text-xl">{ticket.title}</CardTitle>
            <CardDescription>{dayjs(ticket.createdAt).format("YYYY-MM-DD HH:mm")}</CardDescription>
          </div>
          <FeedbackStatusBadge status={ticket.status} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-7">
        <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
          <p className="text-sm font-medium">문의 내용</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{ticket.content}</p>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">대화 내역</h2>
            <p className="text-sm text-muted-foreground">{replies.length}개의 답글</p>
          </div>

          {replies.length === 0 ? (
            <Alert className="rounded-xl border-dashed bg-muted/20">
              <MessageSquareTextIcon />
              <AlertTitle>아직 등록된 답글이 없어요.</AlertTitle>
              <AlertDescription>열심히 검토하고 있으니 조금만 기다려주세요.</AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-4">
              {replies.map((reply) => (
                <div key={reply.uid} className={cn("flex", reply.isAdmin ? "justify-start" : "justify-end")}>
                  <div
                    className={cn(
                      "flex w-full max-w-2xl flex-col gap-2 rounded-xl border px-4 py-3",
                      reply.isAdmin
                        ? "border-primary/20 bg-primary/5"
                        : "border-border/70 bg-card",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {reply.isAdmin ? "운영팀 답변" : "내 문의"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dayjs(reply.createdAt).format("YYYY-MM-DD HH:mm")}
                      </p>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{reply.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
