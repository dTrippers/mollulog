import { describe, expect, it, jest } from "@jest/globals";
import { parseQuestionRunResult, runQuestion } from "~/models/al1s-question.server";

const run = {
  runId: "run-1",
  provider: "test-provider",
  model: "test-model",
  promptVersion: "prompt-hash",
  artifactHash: "artifact-hash",
  usage: {
    modelCalls: 1,
    toolCalls: 0,
    uncachedInputTokens: 20,
    cacheReadInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 10,
    costUsd: 0,
    complete: true,
  },
};

describe("AL1S question result parser", () => {
  it("parses a valid answer result", () => {
    expect(
      parseQuestionRunResult({
        status: "answered",
        answer: { text: "Answer", sources: [{ sourceId: "s1", kind: "student", label: "Student" }], limitations: [] },
        run,
      }),
    ).toEqual({
      status: "answered",
      answer: { text: "Answer", sources: [{ sourceId: "s1", kind: "student", label: "Student" }], limitations: [] },
      run,
    });
  });

  it("accepts known failed results and rejects unknown shapes", () => {
    expect(parseQuestionRunResult({ status: "failed", error: { code: "timeout" }, run })).toMatchObject({
      status: "failed",
      error: { code: "timeout" },
    });
    expect(parseQuestionRunResult({ status: "unknown", run })).toBeNull();
    expect(parseQuestionRunResult({ status: "answered", answer: {}, run })).toBeNull();
  });

  it("maps missing bindings, thrown calls, and unexpected shapes to safe outcomes", async () => {
    const request = {
      question: "Question",
      context: { region: "gl", asOf: "2026-10-19T00:00:00.000Z" },
      profile: "public",
    } as const;
    await expect(runQuestion({}, request)).resolves.toEqual({ ok: false, reason: "unavailable" });
    await expect(
      runQuestion(
        {
          AL1S: {
            runQuestion: async () => {
              throw new Error("secret internal text");
            },
          },
        },
        request,
      ),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
    const runQuestionMock = jest.fn(async () => ({ bad: "shape" }));
    await expect(runQuestion({ AL1S: { runQuestion: runQuestionMock } }, request)).resolves.toEqual({
      ok: false,
      reason: "unexpected_result",
    });
  });
});
