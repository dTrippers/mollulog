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

  it("preserves valid subjects and drops malformed optional subjects without dropping their sources", () => {
    const result = parseQuestionRunResult({
      status: "answered",
      answer: {
        text: "Answer",
        sources: [
          { sourceId: "s1", kind: "student", label: "Student", subject: { type: "student", uid: "101" } },
          { sourceId: "s2", kind: "schedule", label: "Raid", subject: { type: "raid_boss", boss: "binah" } },
          {
            sourceId: "s3",
            kind: "student",
            label: "Old source",
            subject: { type: "student", uid: "101", boss: "extra" },
          },
        ],
        limitations: [],
      },
      sourceRecords: [
        {
          sourceId: "s1",
          toolName: "get_student",
          arguments: {},
          kind: "student",
          label: "Student",
          facts: {},
          modelView: {},
          retrievedAt: "2026-10-29",
          scope: {},
          subject: { type: "student", uid: "101" },
        },
      ],
      run,
    });

    expect(result).toMatchObject({
      answer: {
        sources: [
          { sourceId: "s1", subject: { type: "student", uid: "101" } },
          { sourceId: "s2", subject: { type: "raid_boss", boss: "binah" } },
          { sourceId: "s3", label: "Old source" },
        ],
      },
      sourceRecords: [{ subject: { type: "student", uid: "101" } }],
    });
    expect(result && result.status !== "failed" ? result.answer.sources[2] : undefined).not.toHaveProperty("subject");
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
