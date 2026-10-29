import type { ChatConversationSummary, ChatErrorCode, ChatMessage, ChatProgressStep } from "~/domain/chat-conversation";
import type { QuestionRunEvent, QuestionRunResult } from "~/models/al1s-question-contract";

export type LiveChatProgress = { progress: ChatProgressStep[]; activeProgressIds: string[] };

export function shouldKeepInFlightChatSend(
  send: { awaitingRefresh: boolean; conversationUid: string | null; messageUid?: string },
  messages: Array<Pick<ChatMessage, "uid" | "status">>,
  latestStatus?: ChatMessage["status"],
): boolean {
  if (!send.awaitingRefresh || !send.conversationUid) return true;
  const message = send.messageUid ? messages.find(({ uid }) => uid === send.messageUid) : undefined;
  return (message?.status ?? latestStatus) === "pending";
}

export function findChatSendOutcome<T>(
  sends: Array<{ messageUid?: string; outcome?: T }>,
  messageUid: string | undefined,
): T | undefined {
  if (!messageUid) return undefined;
  return sends.find((send) => send.messageUid === messageUid)?.outcome;
}

export function settledChatTurnState(
  outcome: { ok: false; code: ChatErrorCode } | { ok: true; result: QuestionRunResult },
): {
  pending: false;
  localInFlight: false;
  activeProgressIds: string[];
  failure?: ChatErrorCode;
  result?: Pick<
    Extract<QuestionRunResult, { status: "answered" | "needs_clarification" | "insufficient_evidence" }>,
    "status" | "answer"
  >;
} {
  const settled: { pending: false; localInFlight: false; activeProgressIds: string[] } = {
    pending: false,
    localInFlight: false,
    activeProgressIds: [],
  };
  if (!outcome.ok) return { ...settled, failure: outcome.code };
  if (outcome.result.status === "failed") return { ...settled, failure: outcome.result.error.code };
  return {
    ...settled,
    failure: undefined,
    result: { status: outcome.result.status, answer: outcome.result.answer },
  };
}

export function applyChatProgressEvent(current: LiveChatProgress, event: QuestionRunEvent): LiveChatProgress {
  const key = `${event.round}:${event.callId}`;
  if (event.type === "tool_started") {
    const step: ChatProgressStep = {
      callId: event.callId,
      round: event.round,
      toolName: event.toolName,
      target: event.target,
      ...(event.subject ? { subject: event.subject } : {}),
      ok: false,
      sourceCount: 0,
    };
    const index = current.progress.findIndex((item) => item.callId === event.callId && item.round === event.round);
    const progress = [...current.progress];
    if (index < 0) progress.push(step);
    else progress[index] = step;
    return { progress, activeProgressIds: [...new Set([...current.activeProgressIds, key])] };
  }
  const progress = current.progress.map((step) =>
    step.callId === event.callId && step.round === event.round
      ? { ...step, ok: event.ok, sourceCount: event.sources.length }
      : step,
  );
  return { progress, activeProgressIds: current.activeProgressIds.filter((active) => active !== key) };
}

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
    return local?.localInFlight && message.status === "pending" ? local : toTurn(message);
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
