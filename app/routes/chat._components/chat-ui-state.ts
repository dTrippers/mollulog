import type { ChatConversationSummary, ChatMessage } from "~/domain/chat-conversation";

export type InFlightChatSend = {
  requestId: string;
  conversationUid: string | null;
  title: string;
  startedAt: Date;
  questionCount: number;
};

export function getChatScreenKey(conversationUid: string | null, resetToken: number): string {
  return `${conversationUid ?? "new"}:${resetToken}`;
}

export function canApplyChatResponse(
  mounted: boolean,
  conversationUid: string | null,
  pendingLocation?: { pathname: string; search: string },
): boolean {
  if (!mounted) return false;
  if (!pendingLocation) return true;
  if (pendingLocation.pathname !== "/chat") return false;
  return new URLSearchParams(pendingLocation.search).get("c") === conversationUid;
}

export function reconcileChatTurns<T extends { messageUid?: string; localInFlight?: boolean }>(
  current: T[],
  messages: ChatMessage[],
  toTurn: (message: ChatMessage) => T,
): T[] {
  const currentByUid = new Map<string, T>();
  for (const turn of current) {
    if (turn.messageUid) currentByUid.set(turn.messageUid, turn);
  }
  const next = messages.map((message) => {
    const local = currentByUid.get(message.uid);
    return local?.localInFlight ? local : toTurn(message);
  });
  next.push(...current.filter((turn) => !turn.messageUid));
  return next;
}

export function addInFlightChatSends(
  conversations: ChatConversationSummary[],
  sends: InFlightChatSend[],
): ChatConversationSummary[] {
  const summaries = new Map(conversations.map((conversation) => [conversation.uid, conversation]));
  const active = new Map<string, ChatConversationSummary>();
  for (const send of [...sends].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())) {
    if (!send.conversationUid || active.has(send.conversationUid)) continue;
    const saved = summaries.get(send.conversationUid);
    active.set(send.conversationUid, {
      uid: send.conversationUid,
      title: saved?.title ?? send.title,
      lastMessageAt: send.startedAt,
      questionCount: send.questionCount,
      latestMessage: { status: "pending", updatedAt: send.startedAt },
    });
  }
  const activeUids = new Set(active.keys());
  return [...active.values(), ...conversations.filter((conversation) => !activeUids.has(conversation.uid))];
}
