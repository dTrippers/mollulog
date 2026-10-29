import { describe, expect, it } from "@jest/globals";
import {
  type ChatConversationSummary,
  type ChatMessage,
  getChatConversationListStatus,
} from "~/domain/chat-conversation";
import {
  addInFlightChatSends,
  applyChatProgressEvent,
  canApplyChatResponse,
  findChatSendOutcome,
  getChatScreenKey,
  reconcileChatTurns,
  settledChatTurnState,
  shouldKeepInFlightChatSend,
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
    progress: null,
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

  it("ignores late starts and responses after their screen unmounts or another conversation is opening", () => {
    expect(canApplyChatResponse(false, "conversation-a")).toBe(false);
    expect(canApplyChatResponse(true, "conversation-a", { pathname: "/chat", search: "" })).toBe(false);
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
    const next = reconcileChatTurns(current, [message("stored"), message("in-flight", "pending")], (stored) => ({
      messageUid: stored.uid,
      state: stored.status,
    }));

    expect(next).toEqual([
      { messageUid: "stored", state: "answered" },
      { messageUid: "in-flight", state: "local in-flight", localInFlight: true },
      { state: "unsaved local turn" },
    ]);
    expect(
      reconcileChatTurns(current, [message("in-flight", "failed")], (stored) => ({
        messageUid: stored.uid,
        state: stored.status,
      })),
    ).toMatchObject([{ messageUid: "in-flight", state: "failed" }, { state: "unsaved local turn" }]);
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

  it("keeps a send while its own message is pending and removes it when that message settles", () => {
    const send = { awaitingRefresh: true, conversationUid: "conversation-1", messageUid: "message-1" };
    expect(shouldKeepInFlightChatSend(send, [{ uid: "message-1", status: "pending" }], "answered")).toBe(true);
    expect(shouldKeepInFlightChatSend(send, [{ uid: "message-1", status: "failed" }], "pending")).toBe(false);
    expect(shouldKeepInFlightChatSend(send, [], "pending")).toBe(true);
  });

  it("looks up and applies a final outcome by message UID after a screen remount", () => {
    const networkFailure = { ok: false as const, code: "network" as const };
    expect(
      findChatSendOutcome(
        [
          { messageUid: "other-message", outcome: "answer" },
          { messageUid: "message-1", outcome: "network" },
        ],
        "message-1",
      ),
    ).toBe("network");
    expect(settledChatTurnState(networkFailure)).toEqual({
      pending: false,
      localInFlight: false,
      activeProgressIds: [],
      failure: "network",
    });
    expect(
      settledChatTurnState({
        ok: true,
        result: {
          status: "answered",
          answer: { text: "answer", sources: [], limitations: [] },
          run: {
            runId: "run-1",
            provider: "provider",
            model: "model",
            promptVersion: "prompt",
            artifactHash: "artifact",
            usage: {
              modelCalls: 1,
              toolCalls: 0,
              uncachedInputTokens: 0,
              cacheReadInputTokens: 0,
              cacheWriteInputTokens: 0,
              outputTokens: 0,
              costUsd: 0,
              complete: true,
            },
          },
        },
      }),
    ).toEqual({
      pending: false,
      localInFlight: false,
      activeProgressIds: [],
      failure: undefined,
      result: { status: "answered", answer: { text: "answer", sources: [], limitations: [] } },
    });
  });
});

describe("live chat progress state", () => {
  it("appends starts in arrival order and replaces each row on completion", () => {
    const started = applyChatProgressEvent(
      { progress: [], activeProgressIds: [] },
      {
        type: "tool_started",
        callId: "call-1",
        round: 1,
        toolName: "get_student",
        target: "미카",
        subject: { type: "student", uid: "101" },
      },
    );
    expect(started).toEqual({
      progress: [
        {
          callId: "call-1",
          round: 1,
          toolName: "get_student",
          target: "미카",
          subject: { type: "student", uid: "101" },
          ok: false,
          sourceCount: 0,
        },
      ],
      activeProgressIds: ["1:call-1"],
    });
    expect(
      applyChatProgressEvent(started, {
        type: "tool_completed",
        callId: "call-1",
        round: 1,
        toolName: "get_student",
        ok: false,
        sources: [{ sourceId: "s1", kind: "student", label: "미카" }],
      }),
    ).toEqual({
      progress: [{ ...started.progress[0], ok: false, sourceCount: 1 }],
      activeProgressIds: [],
    });
  });
});
