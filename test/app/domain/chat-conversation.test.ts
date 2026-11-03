import { describe, expect, it } from "@jest/globals";
import {
  buildChatHistory,
  CHAT_PENDING_STALE_MS,
  type ChatMessage,
  chatAnswerCopyText,
  chatConversationTitle,
  getChatConversationListStatus,
  isChatMessageInProgress,
  isChatMessageInterrupted,
  isChatMessageRetryable,
  parseChatAnswer,
  parseChatMessageFailureCode,
  parseChatMessageStatus,
  parseChatProgress,
} from "~/domain/chat-conversation";

const now = new Date("2026-10-29T03:00:00.000Z");

function message(uid: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    uid,
    seq: 1,
    question: `question ${uid}`,
    personalMode: false,
    status: "answered",
    answer: {
      text: `answer ${uid}`,
      blocks: [{ type: "plaintext", text: `answer ${uid}` }],
      sources: [],
      limitations: [],
    },
    progress: null,
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
        message("long", {
          question: longText,
          answer: { text: longText, blocks: [{ type: "plaintext", text: longText }], sources: [], limitations: [] },
        }),
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

describe("chatAnswerCopyText", () => {
  it("copies markdown as plain text and appends chart rows in block order", () => {
    expect(
      chatAnswerCopyText({
        text: "결론입니다.",
        blocks: [
          { type: "markdown", text: "**결론**입니다." },
          {
            type: "bar_chart",
            title: "사용률",
            unit: "fraction",
            categories: ["루나틱", "토먼트"],
            series: [
              { name: "미카", sourceId: "s1", values: [0.998, null] },
              { name: "아리스", sourceId: "s2", values: [0.441, 0] },
            ],
          },
        ],
        sources: [],
        limitations: [],
      }),
    ).toBe("결론입니다.\n\n사용률\n- 루나틱: 미카 99.8%, 아리스 44.1%\n- 토먼트: 미카 –, 아리스 0.0%");
  });

  it("copies an unnamed points series as bare values", () => {
    expect(
      chatAnswerCopyText({
        text: "",
        blocks: [
          {
            type: "bar_chart",
            title: "직접 편성 비율",
            unit: "percent",
            categories: ["아코", "히마리"],
            series: [{ name: null, sourceIds: ["s1", "s2"], values: [32.3, null] }],
          },
        ],
        sources: [],
        limitations: [],
      }),
    ).toBe("직접 편성 비율\n- 아코: 32.3%\n- 히마리: –");
  });

  it("strips matched bold markers beside Hangul while preserving spaced and unmatched asterisks", () => {
    expect(
      chatAnswerCopyText({
        text: "",
        blocks: [{ type: "markdown", text: "**이로하(수영복)**의 비율\n\n2 ** 3\n\nunmatched ** marker" }],
        sources: [],
        limitations: [],
      }),
    ).toBe("이로하(수영복)의 비율\n\n2 ** 3\n\nunmatched ** marker");
  });

  it("copies legacy plaintext verbatim", () => {
    expect(
      chatAnswerCopyText({
        text: "**평문**",
        blocks: [{ type: "plaintext", text: "**평문**" }],
        sources: [],
        limitations: [],
      }),
    ).toBe("**평문**");
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

  it("shows pending and stale final messages with the conversation-list status", () => {
    expect(getChatConversationListStatus(message("fresh", { status: "pending", answer: null }), now)).toBe(
      "in_progress",
    );
    expect(
      getChatConversationListStatus(
        message("stale", {
          status: "pending",
          answer: null,
          updatedAt: new Date(now.getTime() - CHAT_PENDING_STALE_MS - 1),
        }),
        now,
      ),
    ).toBe("failed");
    expect(
      getChatConversationListStatus(message("failed", { status: "failed", answer: null, failureCode: "timeout" }), now),
    ).toBe("failed");
    expect(getChatConversationListStatus(message("answered"), now)).toBeNull();
  });
});

describe("stored value parsers", () => {
  it("accepts stored answers, statuses, and failure codes", () => {
    const answer = {
      text: "Answer",
      blocks: [{ type: "plaintext", text: "Answer" }],
      sources: [
        { sourceId: "s1", kind: "student", label: "미카" },
        { sourceId: "c1", kind: "content", label: "이벤트 보상" },
      ],
      limitations: ["한계"],
    };
    expect(parseChatAnswer(answer)).toEqual(answer);
    expect(parseChatAnswer(null)).toBeNull();
    expect(parseChatMessageStatus("insufficient_evidence")).toBe("insufficient_evidence");
    expect(parseChatMessageFailureCode("member_data_unavailable")).toBe("member_data_unavailable");
    expect(parseChatMessageFailureCode(null)).toBeNull();
  });

  it("keeps valid source subjects after persistence and drops malformed ones", () => {
    expect(
      parseChatAnswer({
        text: "Answer",
        sources: [
          { sourceId: "s1", kind: "student", label: "미카", subject: { type: "student", uid: "101" } },
          { sourceId: "s2", kind: "schedule", label: "레이드", subject: { type: "raid_boss", boss: "binah" } },
          { sourceId: "s3", kind: "student", label: "기존 출처", subject: { type: "unknown", uid: "101" } },
        ],
        limitations: [],
      }),
    ).toEqual({
      text: "Answer",
      blocks: [{ type: "plaintext", text: "Answer" }],
      sources: [
        { sourceId: "s1", kind: "student", label: "미카", subject: { type: "student", uid: "101" } },
        { sourceId: "s2", kind: "schedule", label: "레이드", subject: { type: "raid_boss", boss: "binah" } },
        { sourceId: "s3", kind: "student", label: "기존 출처" },
      ],
      limitations: [],
    });
  });

  it("fails explicitly for malformed stored values", () => {
    expect(() =>
      parseChatAnswer({ text: "Answer", sources: [{ sourceId: "s1", kind: "unknown", label: "x" }], limitations: [] }),
    ).toThrow();
    expect(() => parseChatAnswer({ text: "Answer", sources: [], limitations: [1] })).toThrow();
    expect(() => parseChatMessageStatus("done")).toThrow();
    expect(() => parseChatMessageFailureCode("rate_limited")).toThrow();
  });

  it("keeps valid progress entries and drops malformed entries", () => {
    expect(
      parseChatProgress([
        {
          callId: "call-1",
          round: 1,
          toolName: "get_student",
          target: "미카",
          subject: { type: "student", uid: "101" },
          ok: false,
          sourceCount: 0,
        },
        { callId: "bad", round: -1, toolName: "unknown", target: null, ok: true, sourceCount: 0 },
      ]),
    ).toEqual([
      {
        callId: "call-1",
        round: 1,
        toolName: "get_student",
        target: "미카",
        subject: { type: "student", uid: "101" },
        ok: false,
        sourceCount: 0,
      },
    ]);
    expect(parseChatProgress(null)).toBeNull();
  });
});
