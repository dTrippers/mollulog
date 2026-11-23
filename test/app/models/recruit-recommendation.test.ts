import { describe, expect, it, jest } from "@jest/globals";
import { getRecruitRecommendations } from "~/models/recruit-recommendation.server";
import { parseRecruitRecommendationAnswer } from "~/models/recruit-recommendation-contract";

const boss = {
  bossUid: "binah",
  bossName: "비나",
  usage: 0.82,
  source: "window",
  raidType: "total_assault",
  startAt: "2026-12-01T02:00:00.000Z",
};

function answer(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    goal: "top",
    computedAt: "2026-11-24T00:00:00.000Z",
    students: [
      {
        studentUid: "10001",
        tags: [
          { kind: "substitute", value: "대체", substituteStudentUid: "10002", sourceCount: 2 },
          { kind: "content", value: "총력전", sourceCount: 1 },
        ],
        recommendation: {
          verdict: { kind: "general", level: 2, evidence: "window" },
          tileBosses: [boss],
          bosses: [boss],
          communityLevel: 2,
          growth: {
            sampleCount: 240,
            distribution: [
              { tier: 5, weaponTier: null, count: 40 },
              { tier: 5, weaponTier: 2, count: 200 },
            ],
            modal: { tier: 5, weaponTier: 2, share: 0.83 },
          },
          newbie: null,
        },
      },
    ],
    pickups: [{ studentUid: "10001", startAt: "2026-11-25T02:00:00.000Z", aiRecommended: true }],
    ...overrides,
  };
}

function withRecommendation(overrides: Record<string, unknown>) {
  const value = answer();
  return {
    ...value,
    students: [{ ...value.students[0], recommendation: { ...value.students[0].recommendation, ...overrides } }],
  };
}

describe("recruit recommendation answer parser", () => {
  it("reads a complete answer", () => {
    const parsed = parseRecruitRecommendationAnswer(answer());

    expect(parsed).toEqual({
      status: "ok",
      answer: {
        goal: "top",
        computedAt: "2026-11-24T00:00:00.000Z",
        students: answer().students,
        pickups: answer().pickups,
      },
    });
  });

  it("reads a student without growth, community level, or verdict kind, and a newbie rank", () => {
    const parsed = parseRecruitRecommendationAnswer(
      withRecommendation({
        verdict: { kind: null, level: 0, evidence: null },
        communityLevel: null,
        growth: null,
        newbie: { rank: 3, group: "limited", evidence: "community" },
      }),
    );

    expect(parsed.status).toBe("ok");
    expect(parsed.status === "ok" && parsed.answer.students[0].recommendation).toMatchObject({
      verdict: { kind: null, level: 0, evidence: null },
      communityLevel: null,
      growth: null,
      newbie: { rank: 3, group: "limited", evidence: "community" },
    });
  });

  it("passes on the service's own failures", () => {
    expect(parseRecruitRecommendationAnswer({ status: "unavailable" })).toEqual({ status: "unavailable" });
    expect(parseRecruitRecommendationAnswer({ status: "invalid_request" })).toEqual({ status: "invalid_request" });
  });

  it.each([
    ["a non-object", null],
    ["an unknown goal", answer({ goal: "casual" })],
    ["a bad computed time", answer({ computedAt: "yesterday" })],
    ["a pickup without its mark", answer({ pickups: [{ studentUid: "10001", startAt: "2026-11-25T02:00:00.000Z" }] })],
    ["a usage over 1", withRecommendation({ bosses: [{ ...boss, usage: 1.2 }] })],
    ["an unknown raid type", withRecommendation({ tileBosses: [{ ...boss, raidType: "joint" }] })],
    ["a community level of 3", withRecommendation({ communityLevel: 3 })],
    [
      "a weapon tier of 5",
      withRecommendation({ growth: { sampleCount: 1, distribution: [], modal: { tier: 5, weaponTier: 5, share: 1 } } }),
    ],
    ["a newbie rank of 0", withRecommendation({ newbie: { rank: 0, group: "usual", evidence: "statistics" } })],
    ["an unknown verdict kind", withRecommendation({ verdict: { kind: "support", level: 2, evidence: "window" } })],
  ])("treats an answer with %s as unexpected", (_case, value) => {
    expect(parseRecruitRecommendationAnswer(value)).toEqual({ status: "unexpected" });
  });

  it("treats a tag with an empty substitute as unexpected", () => {
    const value = answer();
    value.students[0].tags = [{ kind: "substitute", value: "대체", substituteStudentUid: "", sourceCount: 2 }];

    expect(parseRecruitRecommendationAnswer(value)).toEqual({ status: "unexpected" });
  });
});

describe("recruit recommendation service call", () => {
  const request = { goal: "top" as const, pickups: [{ studentUid: "10001", startAt: "2026-11-25T02:00:00.000Z" }] };

  function binding(result: () => Promise<unknown>) {
    const getRecruitRecommendations = jest.fn(result);
    return { env: { AL1S_RECOMMENDATIONS: { getRecruitRecommendations } } as never, getRecruitRecommendations };
  }

  it("sends the request and returns the parsed answer", async () => {
    const { env, getRecruitRecommendations: call } = binding(async () => answer());

    await expect(getRecruitRecommendations(env, request)).resolves.toMatchObject({ ok: true, answer: { goal: "top" } });
    expect(call).toHaveBeenCalledWith(request);
  });

  it("fails without the binding, on a thrown call, and on the service's unavailable answer", async () => {
    await expect(getRecruitRecommendations({}, request)).resolves.toEqual({ ok: false, reason: "unavailable" });
    await expect(
      getRecruitRecommendations(
        binding(async () => {
          throw new Error("down");
        }).env,
        request,
      ),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
    await expect(
      getRecruitRecommendations(binding(async () => ({ status: "unavailable" })).env, request),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("fails on an answer for another goal or an answer that does not match the contract", async () => {
    await expect(
      getRecruitRecommendations(binding(async () => answer({ goal: "platinum" })).env, request),
    ).resolves.toEqual({ ok: false, reason: "unexpected_result" });
    await expect(getRecruitRecommendations(binding(async () => ({ status: "ok" })).env, request)).resolves.toEqual({
      ok: false,
      reason: "unexpected_result",
    });
  });
});
