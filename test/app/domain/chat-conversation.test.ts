import { describe, expect, it } from "@jest/globals";
import {
  buildChatHistory,
  CHAT_PENDING_STALE_MS,
  type ChatMessage,
  chatConversationTitle,
  isChatMessageInProgress,
  isChatMessageInterrupted,
  isChatMessageRetryable,
  parseChatAnswer,
  parseChatMessageFailureCode,
  parseChatMessageStatus,
} from "~/domain/chat-conversation";

const now = new Date("2026-10-29T03:00:00.000Z");

function message(uid: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    uid,
    seq: 1,
    question: `question ${uid}`,
    personalMode: false,
    status: "answered",
    answer: { text: `answer ${uid}`, sources: [], limitations: [] },
    failureCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("chatConversationTitle", () => {
  it("collapses whitespace and keeps the first 100 Unicode code points", () => {
    expect(chatConversationTitle("  이번   총력전\n미카  ")).toBe("이번 총력전 미카");
    expect([...chatConversationTitle("🙂".repeat(120))]).toHaveLength(100);
  });
});

describe("buildChatHistory", () => {
  it("omits member-data turns from a public question and drops unanswered turns", () => {
    const history = buildChatHistory(
      [
        message("public"),
        message("private", { personalMode: true }),
        message("failed", { status: "failed", answer: null, failureCode: "timeout" }),
        message("pending", { status: "pending", answer: null }),
      ],
      false,
    );

    expect(history).toEqual([
      { role: "user", text: "question public" },
      { role: "assistant", text: "answer public" },
    ]);
  });

  it("keeps member-data turns for a member-data question and keeps clarification turns", () => {
    const history = buildChatHistory(
      [message("private", { personalMode: true }), message("clarify", { status: "needs_clarification" })],
      true,
    );

    expect(history.map(({ text }) => text)).toEqual([
      "question private",
      "answer private",
      "question clarify",
      "answer clarify",
    ]);
  });

  it("sends at most six messages and caps each message at 4,000 Unicode code points", () => {
    const longText = "🙂".repeat(4_001);
    const history = buildChatHistory(
      [
        message("old"),
        message("long", { question: longText, answer: { text: longText, sources: [], limitations: [] } }),
        message("new-1"),
        message("new-2"),
      ],
      true,
    );

    expect(history).toHaveLength(6);
    expect([...history[0].text]).toHaveLength(4_000);
    expect([...history[1].text]).toHaveLength(4_000);
    expect(history.slice(-4).map(({ text }) => text)).toEqual([
      "question new-1",
      "answer new-1",
      "question new-2",
      "answer new-2",
    ]);
  });
});

describe("message state", () => {
  it("treats a pending message as interrupted only after the stale window", () => {
    const fresh = message("fresh", { status: "pending", answer: null });
    const stale = message("stale", {
      status: "pending",
      answer: null,
      updatedAt: new Date(now.getTime() - CHAT_PENDING_STALE_MS - 1),
    });

    expect(isChatMessageInProgress(fresh, now)).toBe(true);
    expect(isChatMessageInterrupted(fresh, now)).toBe(false);
    expect(isChatMessageRetryable(fresh, now)).toBe(false);
    expect(isChatMessageInProgress(stale, now)).toBe(false);
    expect(isChatMessageInterrupted(stale, now)).toBe(true);
    expect(isChatMessageRetryable(stale, now)).toBe(true);
  });

  it("retries failed messages but not answered ones", () => {
    expect(isChatMessageRetryable(message("failed", { status: "failed", answer: null }), now)).toBe(true);
    expect(isChatMessageRetryable(message("answered"), now)).toBe(false);
  });
});

describe("stored value parsers", () => {
  it("accepts stored answers, statuses, and failure codes", () => {
    const answer = {
      text: "Answer",
      sources: [{ sourceId: "s1", kind: "student", label: "미카" }],
      limitations: ["한계"],
    };
    expect(parseChatAnswer(answer)).toEqual(answer);
    expect(parseChatAnswer(null)).toBeNull();
    expect(parseChatMessageStatus("insufficient_evidence")).toBe("insufficient_evidence");
    expect(parseChatMessageFailureCode("member_data_unavailable")).toBe("member_data_unavailable");
    expect(parseChatMessageFailureCode(null)).toBeNull();
  });

  it("fails explicitly for malformed stored values", () => {
    expect(() =>
      parseChatAnswer({ text: "Answer", sources: [{ sourceId: "s1", kind: "unknown", label: "x" }], limitations: [] }),
    ).toThrow();
    expect(() => parseChatAnswer({ text: "Answer", sources: [], limitations: [1] })).toThrow();
    expect(() => parseChatMessageStatus("done")).toThrow();
    expect(() => parseChatMessageFailureCode("rate_limited")).toThrow();
  });
});
