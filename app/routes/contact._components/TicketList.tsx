import dayjs from "dayjs";
import { Link } from "react-router";
import { ChevronRightIcon, MessageSquareTextIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemHeader, ItemTitle } from "~/components/ui/item";
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
    <Card>
      <CardHeader>
        <CardTitle>내 문의 내역</CardTitle>
      </CardHeader>

      <CardContent>
        {tickets.length === 0 ? (
          <Alert className="rounded-xl border-dashed bg-muted/20">
            <MessageSquareTextIcon />
            <AlertTitle>등록된 문의가 아직 없어요.</AlertTitle>
            <AlertDescription>아래 폼에서 첫 문의를 남겨보세요.</AlertDescription>
          </Alert>
        ) : (
          <ItemGroup className="gap-3">
            {tickets.map((ticket) => (
              <Item key={ticket.uid} asChild variant="muted" className="rounded-xl">
                <Link to={`/contact/${ticket.uid}`}>
                  <ItemContent className="min-w-0 gap-2">
                    <ItemHeader className="min-w-0 items-start">
                      <ItemTitle className="min-w-0 max-w-full flex-1">{ticket.title}</ItemTitle>
                      <FeedbackStatusBadge status={ticket.status} />
                    </ItemHeader>
                    <ItemDescription>{getPreview(ticket.content)}</ItemDescription>
                    <p className="text-xs text-muted-foreground">
                      {dayjs(ticket.createdAt).format("YYYY-MM-DD HH:mm")}
                    </p>
                  </ItemContent>
                  <ItemActions className="text-muted-foreground">
                    <ChevronRightIcon />
                  </ItemActions>
                </Link>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
