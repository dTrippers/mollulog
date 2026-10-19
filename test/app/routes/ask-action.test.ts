import { readFileSync } from "node:fs";
import { describe, expect, it, jest } from "@jest/globals";
import type {
  HistoryMessage,
  MemberSnapshot,
  QuestionRequest,
  QuestionRunResult,
} from "~/models/al1s-question-contract";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/models/sensei", () => ({
  getQuestionMemberDataConsentAt: jest.fn(),
  consentToQuestionMemberData: jest.fn(),
  revokeQuestionMemberDataConsent: jest.fn(),
}));

import { getActiveSensei } from "~/auth/authenticator.server";
import { runQuestion as callQuestionService } from "~/models/al1s-question.server";
import {
  consentToQuestionMemberData,
  getQuestionMemberDataConsentAt,
  revokeQuestionMemberDataConsent,
} from "~/models/sensei";
import * as askResourceRoute from "~/routes/api.ask";
import { type AskQuestionActionDependencies, filterQuestionHistory, handleAskAction } from "~/routes/api.ask";
import * as askPageRoute from "~/routes/ask";
import { loadAskPageData } from "~/routes/ask";

const now = new Date("2026-10-19T03:04:05.000Z");
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetQuestionMemberDataConsentAt = getQuestionMemberDataConsentAt as jest.MockedFunction<
  typeof getQuestionMemberDataConsentAt
>;
const mockedConsentToQuestionMemberData = consentToQuestionMemberData as jest.MockedFunction<
  typeof consentToQuestionMemberData
>;
const mockedRevokeQuestionMemberDataConsent = revokeQuestionMemberDataConsent as jest.MockedFunction<
  typeof revokeQuestionMemberDataConsent
>;
const answer: QuestionRunResult = {
  status: "answered",
  answer: { text: "Answer", sources: [], limitations: [] },
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
};

function makeDependencies(overrides: Partial<AskQuestionActionDependencies> = {}): AskQuestionActionDependencies {
  return {
    getSensei: async () => null,
    readConsent: async () => new Date("2026-10-01T00:00:00.000Z"),
    consent: async () => new Date(),
    revokeConsent: async () => undefined,
    buildSnapshot: async () => ({ version: 1, students: [], favorites: [], formations: [] }),
    runQuestion: async () => ({ ok: true, result: answer }),
    limiter: { limit: async () => ({ success: true }) },
    now: () => now,
    ...overrides,
  };
}

function actionRequest(body: unknown, headers: Record<string, string> = { "CF-Connecting-IP": "203.0.113.9" }) {
  return new Request("https://mollulog.test/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function malformedActionRequest() {
  return new Request("https://mollulog.test/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
}

function routeContext(env: Env) {
  return { cloudflare: { env, ctx: undefined } };
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("AI question page and resource action", () => {
  it("keeps JSON posts on the resource route", () => {
    const askPageSource = readFileSync("app/routes/ask.tsx", "utf8");
    const askClientSource = readFileSync("app/routes/ask._components/ask-client.ts", "utf8");
    expect("action" in askPageRoute).toBe(false);
    expect("action" in askResourceRoute).toBe(true);
    expect("default" in askResourceRoute).toBe(false);
    expect(askPageSource).not.toContain("require-admin.server");
    expect(askClientSource).toContain('fetcher("/api/ask"');
    expect(askClientSource).not.toContain('fetcher("/ask"');
  });

  it("reads consent fresh for the session account and starts enabled only for a saved timestamp", async () => {
    const readConsent = jest.fn(async (_senseiId: number) => new Date("2026-10-18T00:00:00.000Z"));
    await expect(
      loadAskPageData(async () => ({ id: 18, username: "sensei", role: "admin" }), readConsent),
    ).resolves.toEqual({
      isSignedIn: true,
      initialConsent: true,
      consentUnavailable: false,
    });
    expect(readConsent).toHaveBeenCalledWith(18);
    await expect(loadAskPageData(async () => null, readConsent)).rejects.toMatchObject({ status: 404 });
    await expect(
      loadAskPageData(async () => ({ id: 19, username: "guest", role: "guest" }), readConsent),
    ).rejects.toMatchObject({ status: 404 });
    expect(readConsent).toHaveBeenCalledTimes(1);
  });

  it("keeps consent off and reports an unavailable setting when its fresh DB read fails", async () => {
    const report = jest.fn((_error: unknown) => undefined);
    await expect(
      loadAskPageData(
        async () => ({ id: 18, username: "sensei", role: "admin" }),
        async () => {
          throw new Error("database details stay server-side");
        },
        report,
      ),
    ).resolves.toEqual({ isSignedIn: true, initialConsent: false, consentUnavailable: true });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("returns 404 from the /ask loader for signed-out and guest sessions, but loads admin data", async () => {
    const env = {} as Env;
    const args = {
      request: new Request("https://mollulog.test/ask"),
      context: routeContext(env),
      params: {},
    } as never;
    mockedGetQuestionMemberDataConsentAt.mockResolvedValue(new Date("2026-10-18T00:00:00.000Z"));

    mockedGetActiveSensei.mockResolvedValue(null);
    await expect(askPageRoute.loader(args)).rejects.toMatchObject({ status: 404 });
    mockedGetActiveSensei.mockResolvedValue({ id: 19, username: "guest", role: "guest" } as never);
    await expect(askPageRoute.loader(args)).rejects.toMatchObject({ status: 404 });
    expect(mockedGetQuestionMemberDataConsentAt).not.toHaveBeenCalled();

    mockedGetActiveSensei.mockResolvedValue({ id: 18, username: "admin", role: "admin" } as never);
    await expect(askPageRoute.loader(args)).resolves.toEqual({
      isSignedIn: true,
      initialConsent: true,
      consentUnavailable: false,
    });
    expect(mockedGetQuestionMemberDataConsentAt).toHaveBeenCalledWith(env, 18, { ctx: undefined });
  });

  it.each([
    ["question", { intent: "question", question: "Question" }],
    ["consent", { intent: "consent" }],
    ["revoke", { intent: "revoke" }],
  ])("hides the %s action from signed-out and guest sessions", async (_intent, body) => {
    const limiter = { limit: jest.fn(async () => ({ success: true })) };
    const bindingRunQuestion = jest.fn(async (_question: QuestionRequest) => answer);
    const env = { QUESTION_RATE_LIMITER: limiter, AL1S: { runQuestion: bindingRunQuestion } } as unknown as Env;
    const args = (sensei: unknown) => {
      mockedGetActiveSensei.mockResolvedValue(sensei as never);
      return askResourceRoute.action({
        request: actionRequest(body),
        context: routeContext(env),
        params: {},
      } as never);
    };

    for (const sensei of [null, { id: 19, username: "guest", role: "guest" }]) {
      limiter.limit.mockClear();
      bindingRunQuestion.mockClear();
      mockedConsentToQuestionMemberData.mockClear();
      mockedRevokeQuestionMemberDataConsent.mockClear();
      const response = await args(sensei);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not Found");
      expect(limiter.limit).not.toHaveBeenCalled();
      expect(bindingRunQuestion).not.toHaveBeenCalled();
      expect(mockedConsentToQuestionMemberData).not.toHaveBeenCalled();
      expect(mockedRevokeQuestionMemberDataConsent).not.toHaveBeenCalled();
    }
  });

  it("returns the access 404 before parsing an unauthorized request body", async () => {
    mockedGetActiveSensei.mockResolvedValue(null);
    const response = await askResourceRoute.action({
      request: malformedActionRequest(),
      context: routeContext({} as Env),
      params: {},
    } as never);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it("runs question, consent, and revoke normally for an admin session", async () => {
    const limiter = { limit: jest.fn(async (_options: { key: string }) => ({ success: true })) };
    const bindingRunQuestion = jest.fn(async (_question: QuestionRequest) => answer);
    const env = { QUESTION_RATE_LIMITER: limiter, AL1S: { runQuestion: bindingRunQuestion } } as unknown as Env;
    const context = routeContext(env);
    mockedGetActiveSensei.mockResolvedValue({ id: 18, username: "admin", role: "admin" } as never);
    mockedConsentToQuestionMemberData.mockResolvedValue(now);
    mockedRevokeQuestionMemberDataConsent.mockResolvedValue(undefined);

    const questionResponse = await askResourceRoute.action({
      request: actionRequest({ intent: "question", question: "Question" }),
      context,
      params: {},
    } as never);
    expect(questionResponse.status).toBe(200);
    expect(await responseBody(questionResponse)).toMatchObject({ intent: "question", ok: true });
    expect(limiter.limit).toHaveBeenCalledWith({ key: "18" });
    expect(bindingRunQuestion).toHaveBeenCalledTimes(1);

    const consentResponse = await askResourceRoute.action({
      request: actionRequest({ intent: "consent" }),
      context,
      params: {},
    } as never);
    expect(consentResponse.status).toBe(200);
    expect(await responseBody(consentResponse)).toEqual({ intent: "consent", ok: true });
    expect(mockedConsentToQuestionMemberData).toHaveBeenCalledWith(env, 18, { ctx: undefined });

    const revokeResponse = await askResourceRoute.action({
      request: actionRequest({ intent: "revoke" }),
      context,
      params: {},
    } as never);
    expect(revokeResponse.status).toBe(200);
    expect(await responseBody(revokeResponse)).toEqual({ intent: "revoke", ok: true });
    expect(mockedRevokeQuestionMemberDataConsent).toHaveBeenCalledWith(env, 18, { ctx: undefined });
  });

  it("stores and revokes consent using only the session account", async () => {
    const consent = jest.fn(async (_senseiId: number) => now);
    const revokeConsent = jest.fn(async (_senseiId: number) => undefined);
    const getSensei = jest.fn(async () => ({ id: 42, username: "session-user" }));
    const deps = makeDependencies({ getSensei, consent, revokeConsent });

    expect(
      await responseBody(await handleAskAction(actionRequest({ intent: "consent", senseiId: 999 }), deps)),
    ).toEqual({
      intent: "consent",
      ok: true,
    });
    expect(await responseBody(await handleAskAction(actionRequest({ intent: "revoke", senseiId: 999 }), deps))).toEqual(
      {
        intent: "revoke",
        ok: true,
      },
    );
    expect(consent).toHaveBeenCalledWith(42);
    expect(revokeConsent).toHaveBeenCalledWith(42);
  });

  it("builds a public request from server fields and bounds supplied history", async () => {
    const runQuestion = jest.fn(async (_question: QuestionRequest) => ({ ok: true as const, result: answer }));
    const buildSnapshot = jest.fn(async (_senseiId: number) => ({
      version: 1 as const,
      students: [],
      favorites: [],
      formations: [],
    }));
    const limit = jest.fn(async ({ key }: { key: string }) => {
      expect(key).toBe("14");
      return { success: true };
    });
    const validHistory: HistoryMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: "user",
      text: `turn-${index}`,
    }));
    const history: unknown[] = [...validHistory, { role: "system", text: "drop" }];
    const deps = makeDependencies({
      getSensei: async () => ({ id: 14, username: "signed-in" }),
      runQuestion,
      buildSnapshot,
      limiter: { limit },
      now: () => now,
    });

    const result = await responseBody(
      await handleAskAction(
        actionRequest({
          intent: "question",
          question: "  Public question  ",
          history,
          personalMode: false,
          profile: "internal",
          member: { secret: "must-ignore" },
        }),
        deps,
      ),
    );

    expect(result).toMatchObject({ intent: "question", ok: true });
    expect(limit).toHaveBeenCalledTimes(1);
    expect(runQuestion).toHaveBeenCalledWith({
      question: "Public question",
      context: { region: "gl", asOf: now.toISOString() },
      history: validHistory.slice(2),
      profile: "public",
    });
    expect([...filterQuestionHistory([{ role: "user", text: "🙂".repeat(4_001) }])[0].text]).toHaveLength(4_000);
    expect(buildSnapshot).not.toHaveBeenCalled();
  });

  it("sends a member profile only after session, stored consent, and client opt-in all pass", async () => {
    const snapshot: MemberSnapshot = {
      version: 1,
      students: [],
      favorites: [{ studentUid: "student-a", contentId: "pickup-a" }],
      formations: [
        {
          name: "Saved formation",
          raidType: null,
          seasonIndex: null,
          studentUids: [["student-a", null]],
        },
      ],
    };
    const bindingRunQuestion = jest.fn(async (_question: QuestionRequest) => answer);
    const deps = makeDependencies({
      getSensei: async () => ({ id: 21, username: "member" }),
      readConsent: async () => new Date("2026-10-01T00:00:00.000Z"),
      buildSnapshot: async () => snapshot,
      runQuestion: (question) =>
        callQuestionService(
          {
            AL1S: { runQuestion: bindingRunQuestion },
          },
          question,
        ),
    });

    expect(
      await responseBody(
        await handleAskAction(
          actionRequest({
            intent: "question",
            question: "What do I own?",
            personalMode: true,
          }),
          deps,
        ),
      ),
    ).toMatchObject({ intent: "question", ok: true });
    expect(bindingRunQuestion).toHaveBeenCalledWith({
      question: "What do I own?",
      context: { region: "gl", asOf: now.toISOString() },
      history: [],
      member: snapshot,
      profile: "member",
    });
  });

  it("requires a session and persisted consent before building member data", async () => {
    const buildSnapshot = jest.fn(async (_senseiId: number) => ({
      version: 1 as const,
      students: [],
      favorites: [],
      formations: [],
    }));
    const runQuestion = jest.fn(async () => ({ ok: true as const, result: answer }));
    const deps = makeDependencies({ getSensei: async () => null, buildSnapshot, runQuestion });
    expect(
      await responseBody(
        await handleAskAction(actionRequest({ intent: "question", question: "Private", personalMode: true }), deps),
      ),
    ).toEqual({ intent: "question", ok: false, code: "session_expired" });
    expect(buildSnapshot).not.toHaveBeenCalled();
    expect(runQuestion).not.toHaveBeenCalled();

    const limit = jest.fn(async (_options: { key: string }) => ({ success: true }));
    const noConsent = makeDependencies({
      getSensei: async () => ({ id: 5, username: "sensei" }),
      readConsent: async () => null,
      buildSnapshot,
      runQuestion,
      limiter: { limit },
    });
    expect(
      await responseBody(
        await handleAskAction(
          actionRequest({ intent: "question", question: "Private", personalMode: true }),
          noConsent,
        ),
      ),
    ).toEqual({ intent: "question", ok: false, code: "consent_required" });
    expect(buildSnapshot).not.toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith({ key: "5" });
  });

  it("maps snapshot loading failure to the explicit member-data error", async () => {
    const runQuestion = jest.fn(async () => ({ ok: true as const, result: answer }));
    const deps = makeDependencies({
      getSensei: async () => ({ id: 5, username: "sensei" }),
      buildSnapshot: async () => {
        throw new Error("do not expose this");
      },
      runQuestion,
    });
    expect(
      await responseBody(
        await handleAskAction(actionRequest({ intent: "question", question: "Private", personalMode: true }), deps),
      ),
    ).toEqual({ intent: "question", ok: false, code: "member_data_unavailable" });
    expect(runQuestion).not.toHaveBeenCalled();
  });

  it("rejects a snapshot above 64 KiB before the AL1S call", async () => {
    const oversized: MemberSnapshot = {
      version: 1,
      students: [
        {
          studentUid: "x".repeat(65_537),
          star: 5,
          weaponStar: 0,
          level: null,
          skills: { ex: null, normal: null, enhanced: null, sub: null },
          equipmentTiers: [null, null, null],
          equipSpecial: null,
          relationshipLevel: null,
        },
      ],
      favorites: [],
      formations: [],
    };
    const runQuestion = jest.fn(async () => ({ ok: true as const, result: answer }));
    const deps = makeDependencies({
      getSensei: async () => ({ id: 5, username: "sensei" }),
      buildSnapshot: async (_senseiId: number) => oversized,
      runQuestion,
    });
    expect(
      await responseBody(
        await handleAskAction(actionRequest({ intent: "question", question: "Private", personalMode: true }), deps),
      ),
    ).toEqual({ intent: "question", ok: false, code: "snapshot_too_large" });
    expect(runQuestion).not.toHaveBeenCalled();
  });

  it("returns safe errors for an unavailable limiter, limiter failure, and exhaustion", async () => {
    const payload = { intent: "question", question: "Question" };
    const noLimiter = makeDependencies({ limiter: undefined });
    expect(await responseBody(await handleAskAction(actionRequest(payload), noLimiter))).toEqual({
      intent: "question",
      ok: false,
      code: "service_unavailable",
    });

    const failedLimiter = makeDependencies({
      limiter: {
        limit: async () => {
          throw new Error("internal limiter detail");
        },
      },
    });
    expect(await responseBody(await handleAskAction(actionRequest(payload), failedLimiter))).toEqual({
      intent: "question",
      ok: false,
      code: "service_unavailable",
    });

    const exhaustedLimiter = makeDependencies({ limiter: { limit: async () => ({ success: false }) } });
    expect(await responseBody(await handleAskAction(actionRequest(payload), exhaustedLimiter))).toEqual({
      intent: "question",
      ok: false,
      code: "rate_limited",
    });
  });
});
