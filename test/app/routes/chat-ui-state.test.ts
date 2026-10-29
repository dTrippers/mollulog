import { describe, expect, it } from "@jest/globals";
import {
  type ChatConversationSummary,
  type ChatMessage,
  getChatConversationListStatus,
} from "~/domain/chat-conversation";
import {
  addInFlightChatSends,
  canApplyChatResponse,
  getChatScreenKey,
  reconcileChatTurns,
} from "~/routes/chat._components/chat-ui-state";

const now = new Date("2026-10-29T03:00:00.000Z");

function message(uid: string, status: ChatMessage["status"] = "answered"): ChatMessage {
  return {
    uid,
    seq: 1,
    question: `question ${uid}`,
    personalMode: false,
    status,
    answer: status === "answered" ? { text: `answer ${uid}`, sources: [], limitations: [] } : null,
    failureCode: null,
    createdAt: now,
    updatedAt: now,
  };
}

function summary(uid: string, overrides: Partial<ChatConversationSummary> = {}): ChatConversationSummary {
  return {
    uid,
    title: `title ${uid}`,
    lastMessageAt: now,
    questionCount: 2,
    latestMessage: { status: "failed", updatedAt: now },
    ...overrides,
  };
}

describe("chat screen state", () => {
  it("changes the screen key when 새 대화 resets the same /chat URL", () => {
    expect(getChatScreenKey(null, 1)).not.toBe(getChatScreenKey(null, 2));
  });

  it("does not apply a response after its screen unmounts or another conversation is opening", () => {
    expect(canApplyChatResponse(false, "conversation-a")).toBe(false);
    expect(canApplyChatResponse(true, "conversation-a", { pathname: "/chat", search: "?c=conversation-b" })).toBe(
      false,
    );
    expect(canApplyChatResponse(true, "conversation-a", { pathname: "/chat", search: "?c=conversation-a" })).toBe(true);
    expect(canApplyChatResponse(true, null)).toBe(true);
  });

  it("reconciles loader messages by UID while retaining local in-flight and unsaved turns", () => {
    const current = [
      { messageUid: "stored", state: "old pending" },
      { messageUid: "in-flight", state: "local in-flight", localInFlight: true },
      { state: "unsaved local turn" },
    ];
    const next = reconcileChatTurns(current, [message("stored"), message("in-flight")], (stored) => ({
      messageUid: stored.uid,
      state: stored.status,
    }));

    expect(next).toEqual([
      { messageUid: "stored", state: "answered" },
      { messageUid: "in-flight", state: "local in-flight", localInFlight: true },
      { state: "unsaved local turn" },
    ]);
  });
});

describe("in-flight chat list state", () => {
  it("moves an active saved conversation to the top with a pending status", () => {
    const other = summary("other", { latestMessage: { status: "answered", updatedAt: now } });
    const active = summary("active");
    const startedAt = new Date(now.getTime() + 1_000);
    const conversations = addInFlightChatSends(
      [other, active],
      [
        {
          requestId: "request-new-chat",
          conversationUid: null,
          title: "new question",
          startedAt,
          questionCount: 1,
        },
        {
          requestId: "request-active-chat",
          conversationUid: "active",
          title: active.title,
          startedAt,
          questionCount: 3,
        },
      ],
    );

    expect(conversations.map(({ uid }) => uid)).toEqual(["active", "other"]);
    expect(conversations[0]).toMatchObject({
      title: active.title,
      lastMessageAt: startedAt,
      questionCount: 3,
      latestMessage: { status: "pending", updatedAt: startedAt },
    });
    expect(getChatConversationListStatus(conversations[0].latestMessage, startedAt)).toBe("in_progress");
  });
});
