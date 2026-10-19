import { describe, expect, it } from "@jest/globals";
import { buildQuestionHistory, type QuestionTurn } from "~/routes/ask._components/QuestionChat";

function turn(id: string, overrides: Partial<QuestionTurn> = {}): QuestionTurn {
  return {
    id,
    question: `question ${id}`,
    personalMode: false,
    result: {
      status: "answered",
      answer: { text: `answer ${id}`, sources: [], limitations: [] },
      run: {
        runId: id,
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
    ...overrides,
  };
}

describe("buildQuestionHistory", () => {
  it("omits personal-mode turns in public mode and drops failed or pending turns", () => {
    const history = buildQuestionHistory(
      [
        turn("public"),
        turn("private", { personalMode: true }),
        turn("failed", { failure: "timeout", result: undefined }),
        turn("pending", { pending: true, result: undefined }),
      ],
      false,
    );

    expect(history).toEqual([
      { role: "user", text: "question public" },
      { role: "assistant", text: "answer public" },
    ]);
  });

  it("sends at most six messages and caps each message at 4,000 Unicode code points", () => {
    const longText = "🙂".repeat(4_001);
    const longTurn = turn("long");
    if (!longTurn.result) throw new Error("test turn should include an answer");
    const history = buildQuestionHistory(
      [
        turn("old"),
        turn("long", {
          question: longText,
          result: { ...longTurn.result, answer: { text: longText, sources: [], limitations: [] } },
        }),
        turn("new-1"),
        turn("new-2"),
      ],
      true,
    );

    expect(history).toHaveLength(6);
    expect([...history[0].text]).toHaveLength(4_000);
    expect([...history[1].text]).toHaveLength(4_000);
    expect(history.slice(-4).map(({ role }) => role)).toEqual(["user", "assistant", "user", "assistant"]);
  });
});
