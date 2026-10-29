import {
  ArrowPathIcon,
  Bars3Icon,
  ChatBubbleLeftRightIcon,
  ExclamationCircleIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { PageToolbar, PanelSheet, useV2Page } from "~/components/v2/layout";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button } from "~/components/v2/primitives/Button";
import { useDisplayTimeZone, useIsDisplayTimeZoneResolved } from "~/contexts/TimeZoneProvider";
import { type ChatConversationSummary, getChatConversationListStatus } from "~/domain/chat-conversation";
import { formatInstant, formatInstantDateKey } from "~/lib/date-time";
import dayjs from "~/lib/dayjs";

type ChatHistoryPanelProps = {
  conversations: ChatConversationSummary[];
  selectedUid: string | null;
  loadedAt: Date;
  onNewConversation: () => void;
};

function getDayGroup(lastMessageAt: Date, loadedAt: Date, timeZone: string): "today" | "yesterday" | "older" {
  const messageDay = formatInstantDateKey(lastMessageAt, timeZone);
  const today = formatInstantDateKey(loadedAt, timeZone);
  if (messageDay === today) return "today";
  const yesterday = dayjs(loadedAt).tz(timeZone).subtract(1, "day").format("YYYY-MM-DD");
  return messageDay === yesterday ? "yesterday" : "older";
}

export function ChatHistoryPanel({ conversations, selectedUid, loadedAt, onNewConversation }: ChatHistoryPanelProps) {
  const timeZone = useDisplayTimeZone();
  const timeZoneResolved = useIsDisplayTimeZoneResolved();
  const today = timeZoneResolved ? formatInstantDateKey(loadedAt, timeZone) : null;
  const groups = new Map<string, ChatConversationSummary[]>();
  if (timeZoneResolved) {
    for (const conversation of conversations) {
      const group = getDayGroup(conversation.lastMessageAt, loadedAt, timeZone);
      const items = groups.get(group) ?? [];
      items.push(conversation);
      groups.set(group, items);
    }
  }

  const renderConversation = (conversation: ChatConversationSummary) => {
    const active = selectedUid === conversation.uid;
    const status = timeZoneResolved ? getChatConversationListStatus(conversation.latestMessage, loadedAt) : null;
    let metadata = `질문 ${conversation.questionCount}개`;
    if (timeZoneResolved) {
      const dateKey = formatInstantDateKey(conversation.lastMessageAt, timeZone);
      const time = formatInstant(conversation.lastMessageAt, {
        timeZone,
        format: dateKey === today ? "HH:mm" : "MM/DD",
      });
      metadata = `${time} · ${metadata}`;
    }

    return (
      <li key={conversation.uid}>
        <Link
          to={`/chat?c=${encodeURIComponent(conversation.uid)}`}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-v2-row-min min-w-0 items-center gap-2 rounded-md px-2 py-1.5 ${v2FocusRing} ${
            active ? "bg-v2-nav-active text-v2-fg" : "text-v2-fg hover:bg-v2-hover"
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm ${active ? "font-semibold" : "font-medium"}`}>
              {conversation.title}
            </span>
            <span className="block text-xs tabular-nums text-v2-fg-tertiary">{metadata}</span>
          </span>
          {status ? (
            <span
              className={`inline-flex shrink-0 items-center gap-1 text-xs ${
                status === "failed" ? "text-v2-danger" : "text-v2-fg-secondary"
              }`}
            >
              {status === "failed" ? (
                <ExclamationCircleIcon className="size-3.5" aria-hidden="true" />
              ) : (
                <ArrowPathIcon className="size-3.5" aria-hidden="true" />
              )}
              {status === "failed" ? "실패" : "답변 중"}
            </span>
          ) : null}
        </Link>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-v2-block-gap">
      <Button variant="secondary" onClick={onNewConversation} className="v2-chat-new-conversation-wide w-full">
        <PencilSquareIcon className="size-4" aria-hidden="true" />새 대화
      </Button>
      <PanelSheet
        panelId="chat-history"
        title="대화 기록"
        description="최근 30일 동안의 대화"
        Icon={ChatBubbleLeftRightIcon}
        headerAction={
          <Button variant="secondary" onClick={onNewConversation} className="v2-chat-new-conversation-stacked">
            <PencilSquareIcon className="size-4" aria-hidden="true" />새 대화
          </Button>
        }
      >
        {conversations.length === 0 ? (
          <p className="py-2 text-sm text-v2-fg-tertiary">아직 대화가 없어요</p>
        ) : !timeZoneResolved ? (
          <ul className="mt-1 flex flex-col gap-1">{conversations.map(renderConversation)}</ul>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {(["today", "yesterday", "older"] as const).map((group) => {
              const items = groups.get(group);
              if (!items?.length) return null;
              return (
                <li key={group}>
                  <h2 className="px-2 pb-1 pt-2 text-xs font-semibold text-v2-fg-tertiary">
                    {group === "today" ? "오늘" : group === "yesterday" ? "어제" : "지난 30일"}
                  </h2>
                  <ul className="flex flex-col gap-1">{items.map(renderConversation)}</ul>
                </li>
              );
            })}
          </ul>
        )}
      </PanelSheet>
    </div>
  );
}

export function ChatMobileToolbar({ title, onNewConversation }: { title: string; onNewConversation: () => void }) {
  const { openSheet } = useV2Page();
  return (
    <PageToolbar stackedOnly>
      <div className="flex min-h-10 items-center gap-2">
        <Button
          variant="text"
          aria-label="대화 기록"
          onClick={() => openSheet("chat-history")}
          className="size-10 shrink-0 px-0"
        >
          <Bars3Icon className="size-5" aria-hidden="true" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-v2-fg">{title}</span>
        <Button variant="text" aria-label="새 대화" onClick={onNewConversation} className="size-10 shrink-0 px-0">
          <PencilSquareIcon className="size-5" aria-hidden="true" />
        </Button>
      </div>
    </PageToolbar>
  );
}
