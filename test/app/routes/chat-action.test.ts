import { readFileSync } from "node:fs";
import { describe, expect, it, jest } from "@jest/globals";
import type { ChatMessage } from "~/domain/chat-conversation";
import type { MemberSnapshot, QuestionRequest, QuestionRunResult } from "~/models/al1s-question-contract";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/models/chat-conversation", () => ({
  startChatMessage: jest.fn(),
  retryChatMessage: jest.fn(),
  completeChatMessage: jest.fn(),
  listChatConversations: jest.fn(),
  readChatConversation: jest.fn(),
}));
jest.mock("~/models/sensei", () => ({
  getQuestionMemberDataConsentAt: jest.fn(),
  consentToQuestionMemberData: jest.fn(),
  revokeQuestionMemberDataConsent: jest.fn(),
}));

import { getActiveSensei } from "~/auth/authenticator.server";
import { runQuestion as callQuestionService } from "~/models/al1s-question.server";
import {
  completeChatMessage,
  listChatConversations,
  readChatConversation,
  startChatMessage,
} from "~/models/chat-conversation";
import {
  consentToQuestionMemberData,
  getQuestionMemberDataConsentAt,
  revokeQuestionMemberDataConsent,
} from "~/models/sensei";
import * as chatResourceRoute from "~/routes/api.chat";
import { type ChatActionDependencies, handleChatAction } from "~/routes/api.chat";
import * as chatPageRoute from "~/routes/chat";
import { loadChatPageData } from "~/routes/chat";

const now = new Date("2026-10-19T03:04:05.000Z");
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetQuestionMemberDataConsentAt = getQuestionMemberDataConsentAt as jest.MockedFunction<
  typeof getQuestionMemberDataConsentAt
>;
const mockedConsentToQuestionMemberData = consentToQuestionMemberData as jest.MockedFunction<
  typeof consentToQuestionMemberData
>;
const mockedStartChatMessage = startChatMessage as jest.MockedFunction<typeof startChatMessage>;
const mockedCompleteChatMessage = completeChatMessage as jest.MockedFunction<typeof completeChatMessage>;
const mockedListChatConversations = listChatConversations as jest.MockedFunction<typeof listChatConversations>;
const mockedReadChatConversation = readChatConversation as jest.MockedFunction<typeof readChatConversation>;
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

function storedMessage(uid: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
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

function started(previousMessages: ChatMessage[] = [], question = "Question") {
  return {
    ok: true as const,
    started: { conversationUid: "conversation-1", messageUid: "message-1", question, previousMessages },
  };
}

function makeDependencies(overrides: Partial<ChatActionDependencies> = {}): ChatActionDependencies {
  return {
    getSensei: async () => ({ id: 7, username: "sensei" }),
    readConsent: async () => new Date("2026-10-01T00:00:00.000Z"),
    consent: async () => new Date(),
    revokeConsent: async () => undefined,
    buildSnapshot: async () => ({ version: 1, students: [], favorites: [], formations: [] }),
    runQuestion: async () => ({ ok: true, result: answer }),
    startMessage: async (input) => started([], input.question),
    retryMessage: async () => started(),
    completeMessage: async () => undefined,
    limiter: { limit: async () => ({ success: true }) },
    now: () => now,
    ...overrides,
  };
}

function actionRequest(body: unknown, headers: Record<string, string> = { "CF-Connecting-IP": "203.0.113.9" }) {
  return new Request("https://mollulog.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function malformedActionRequest() {
  return new Request("https://mollulog.test/api/chat", {
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

describe("AI chatbot page and resource action", () => {
  it("keeps JSON posts on the resource route", () => {
    const chatPageSource = readFileSync("app/routes/chat.tsx", "utf8");
    const chatClientSource = readFileSync("app/routes/chat._components/chat-client.ts", "utf8");
    expect("action" in chatPageRoute).toBe(false);
    expect("action" in chatResourceRoute).toBe(true);
    expect("default" in chatResourceRoute).toBe(false);
    expect(chatPageSource).not.toContain("require-admin.server");
    expect(chatClientSource).toContain('fetcher("/api/chat"');
    expect(chatClientSource).not.toContain('fetcher("/chat"');
  });

  it("reads consent fresh for the session account and starts enabled only for a saved timestamp", async () => {
    const readConsent = jest.fn(async (_senseiId: number) => new Date("2026-10-18T00:00:00.000Z"));
    const readChatData = jest.fn(async () => ({ conversations: [], selectedConversation: null }));
    await expect(
      loadChatPageData(async () => ({ id: 18, username: "sensei", role: "admin" }), readConsent, readChatData, null),
    ).resolves.toMatchObject({ isSignedIn: true, initialConsent: true, consentUnavailable: false, conversations: [] });
    expect(readConsent).toHaveBeenCalledWith(18);
    await expect(loadChatPageData(async () => null, readConsent, readChatData, null)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      loadChatPageData(async () => ({ id: 19, username: "guest", role: "guest" }), readConsent, readChatData, null),
    ).rejects.toMatchObject({ status: 404 });
    expect(readConsent).toHaveBeenCalledTimes(1);
  });

  it("keeps consent off and reports an unavailable setting when its fresh DB read fails", async () => {
    const report = jest.fn((_error: unknown) => undefined);
    await expect(
      loadChatPageData(
        async () => ({ id: 18, username: "sensei", role: "admin" }),
        async () => {
          throw new Error("database details stay server-side");
        },
        async () => ({ conversations: [], selectedConversation: null }),
        null,
        report,
      ),
    ).resolves.toMatchObject({ isSignedIn: true, initialConsent: false, consentUnavailable: true, conversations: [] });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("returns 404 from the /chat loader for signed-out and guest sessions, but loads admin data", async () => {
    const env = {} as Env;
    const args = {
      request: new Request("https://mollulog.test/chat"),
      context: routeContext(env),
      params: {},
    } as never;
    mockedGetQuestionMemberDataConsentAt.mockResolvedValue(new Date("2026-10-18T00:00:00.000Z"));
    mockedListChatConversations.mockResolvedValue([]);
    mockedReadChatConversation.mockResolvedValue(null);

    mockedGetActiveSensei.mockResolvedValue(null);
    await expect(chatPageRoute.loader(args)).rejects.toMatchObject({ status: 404 });
    mockedGetActiveSensei.mockResolvedValue({ id: 19, username: "guest", role: "guest" } as never);
    await expect(chatPageRoute.loader(args)).rejects.toMatchObject({ status: 404 });
    expect(mockedGetQuestionMemberDataConsentAt).not.toHaveBeenCalled();

    mockedGetActiveSensei.mockResolvedValue({ id: 18, username: "admin", role: "admin" } as never);
    await expect(chatPageRoute.loader(args)).resolves.toMatchObject({
      isSignedIn: true,
      initialConsent: true,
      consentUnavailable: false,
      conversations: [],
      selectedUid: null,
      selectedConversation: null,
    });
    expect(mockedGetQuestionMemberDataConsentAt).toHaveBeenCalledWith(env, 18, { ctx: undefined });
    expect(mockedListChatConversations).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ senseiId: 18, listDays: 30, now: expect.any(Date) }),
      { ctx: undefined },
    );
  });

  it("scopes selected conversation reads to the admin session and keeps missing IDs as not found", async () => {
    const env = {} as Env;
    const args = {
      request: new Request("https://mollulog.test/chat?c=private-id"),
      context: routeContext(env),
      params: {},
    } as never;
    mockedGetActiveSensei.mockResolvedValue({ id: 18, username: "admin", role: "admin" } as never);
    mockedGetQuestionMemberDataConsentAt.mockResolvedValue(null);
    mockedListChatConversations.mockResolvedValue([]);
    mockedReadChatConversation.mockResolvedValue(null);

    await expect(chatPageRoute.loader(args)).resolves.toMatchObject({
      selectedUid: "private-id",
      selectedConversation: null,
    });
    expect(mockedReadChatConversation).toHaveBeenCalledWith(
      env,
      { senseiId: 18, conversationUid: "private-id" },
      { ctx: undefined },
    );
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
      return chatResourceRoute.action({
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
    const response = await chatResourceRoute.action({
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
    mockedStartChatMessage.mockResolvedValue(started());
    mockedCompleteChatMessage.mockResolvedValue(undefined);

    const questionResponse = await chatResourceRoute.action({
      request: actionRequest({ intent: "question", question: "Question" }),
      context,
      params: {},
    } as never);
    expect(questionResponse.status).toBe(200);
    expect(await responseBody(questionResponse)).toMatchObject({
      intent: "question",
      ok: true,
      conversationUid: "conversation-1",
      messageUid: "message-1",
    });
    expect(limiter.limit).toHaveBeenCalledWith({ key: "18" });
    expect(mockedStartChatMessage).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ senseiId: 18, conversationUid: null, question: "Question", personalMode: false }),
      { ctx: undefined },
    );
    expect(mockedCompleteChatMessage).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        messageUid: "message-1",
        outcome: { status: "answered", answer: { text: "Answer", sources: [], limitations: [] }, runId: "run-1" },
      }),
      { ctx: undefined },
    );
    expect(bindingRunQuestion).toHaveBeenCalledTimes(1);

    const consentResponse = await chatResourceRoute.action({
      request: actionRequest({ intent: "consent" }),
      context,
      params: {},
    } as never);
    expect(consentResponse.status).toBe(200);
    expect(await responseBody(consentResponse)).toEqual({ intent: "consent", ok: true });
    expect(mockedConsentToQuestionMemberData).toHaveBeenCalledWith(env, 18, { ctx: undefined });

    const revokeResponse = await chatResourceRoute.action({
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
      await responseBody(await handleChatAction(actionRequest({ intent: "consent", senseiId: 999 }), deps)),
    ).toEqual({
      intent: "consent",
      ok: true,
    });
    expect(
      await responseBody(await handleChatAction(actionRequest({ intent: "revoke", senseiId: 999 }), deps)),
    ).toEqual({
      intent: "revoke",
      ok: true,
    });
    expect(consent).toHaveBeenCalledWith(42);
    expect(revokeConsent).toHaveBeenCalledWith(42);
  });

  it("builds a public request from server fields and stored history, ignoring client history", async () => {
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
    const startMessage = jest.fn(async (input: Parameters<ChatActionDependencies["startMessage"]>[0]) =>
      started(
        [
          storedMessage("old", { seq: 1 }),
          storedMessage("private", { seq: 2, personalMode: true }),
          storedMessage("failed", { seq: 3, status: "failed", answer: null, failureCode: "timeout" }),
        ],
        input.question,
      ),
    );
    const deps = makeDependencies({
      getSensei: async () => ({ id: 14, username: "signed-in" }),
      runQuestion,
      buildSnapshot,
      startMessage,
      limiter: { limit },
      now: () => now,
    });

    const result = await responseBody(
      await handleChatAction(
        actionRequest({
          intent: "question",
          question: "  Public question  ",
          conversationUid: "conversation-1",
          history: [{ role: "user", text: "forged" }],
          personalMode: false,
          profile: "internal",
          member: { secret: "must-ignore" },
        }),
        deps,
      ),
    );

    expect(result).toMatchObject({ intent: "question", ok: true, conversationUid: "conversation-1" });
    expect(limit).toHaveBeenCalledTimes(1);
    expect(startMessage).toHaveBeenCalledWith({
      senseiId: 14,
      conversationUid: "conversation-1",
      question: "Public question",
      personalMode: false,
      now,
    });
    expect(runQuestion).toHaveBeenCalledWith({
      question: "Public question",
      context: { region: "gl", asOf: now.toISOString() },
      history: [
        { role: "user", text: "question old" },
        { role: "assistant", text: "answer old" },
      ],
      profile: "public",
    });
    expect(buildSnapshot).not.toHaveBeenCalled();
  });

  it("retries the stored question of a message and requires its conversation", async () => {
    const runQuestion = jest.fn(async (_question: QuestionRequest) => ({ ok: true as const, result: answer }));
    const retryMessage = jest.fn(async (_input: Parameters<ChatActionDependencies["retryMessage"]>[0]) =>
      started([storedMessage("old")], "Stored question"),
    );
    const startMessage = jest.fn(async () => started());
    const deps = makeDependencies({ runQuestion, retryMessage, startMessage });

    expect(
      await responseBody(
        await handleChatAction(actionRequest({ intent: "question", retryMessageUid: "message-1" }), deps),
      ),
    ).toEqual({ intent: "question", ok: false, code: "invalid_request" });
    expect(retryMessage).not.toHaveBeenCalled();

    expect(
      await responseBody(
        await handleChatAction(
          actionRequest({
            intent: "question",
            question: "Edited text is ignored",
            conversationUid: "conversation-1",
            retryMessageUid: "message-1",
          }),
          deps,
        ),
      ),
    ).toMatchObject({ intent: "question", ok: true, messageUid: "message-1" });
    expect(retryMessage).toHaveBeenCalledWith({
      senseiId: 7,
      conversationUid: "conversation-1",
      messageUid: "message-1",
      personalMode: false,
      now,
    });
    expect(startMessage).not.toHaveBeenCalled();
    expect(runQuestion).toHaveBeenCalledWith(expect.objectContaining({ question: "Stored question" }));
  });

  it.each([
    ["not_found", "conversation_not_found"],
    ["busy", "conversation_busy"],
    ["not_retryable", "invalid_request"],
  ] as const)("maps a %s start to %s without calling AL1S", async (reason, code) => {
    const runQuestion = jest.fn(async () => ({ ok: true as const, result: answer }));
    const deps = makeDependencies({ runQuestion, startMessage: async () => ({ ok: false, reason }) });
    expect(
      await responseBody(
        await handleChatAction(
          actionRequest({ intent: "question", question: "Question", conversationUid: "conversation-1" }),
          deps,
        ),
      ),
    ).toEqual({ intent: "question", ok: false, code });
    expect(runQuestion).not.toHaveBeenCalled();
  });

  it("stores failures after the message starts, but not rate-limited or invalid requests", async () => {
    const completeMessage = jest.fn(
      async (_input: Parameters<ChatActionDependencies["completeMessage"]>[0]) => undefined,
    );
    const startMessage = jest.fn(async () => started());
    const failedRun: QuestionRunResult = { status: "failed", error: { code: "timeout" }, run: answer.run };

    const failedDeps = makeDependencies({
      completeMessage,
      startMessage,
      runQuestion: async () => ({ ok: true, result: failedRun }),
    });
    expect(
      await responseBody(
        await handleChatAction(actionRequest({ intent: "question", question: "Question" }), failedDeps),
      ),
    ).toMatchObject({ intent: "question", ok: true, result: { status: "failed" }, messageUid: "message-1" });
    expect(completeMessage).toHaveBeenLastCalledWith({
      messageUid: "message-1",
      outcome: { status: "failed", failureCode: "timeout", runId: "run-1" },
      now,
    });

    const unavailableDeps = makeDependencies({
      completeMessage,
      startMessage,
      runQuestion: async () => ({ ok: false, reason: "unavailable" }),
    });
    expect(
      await responseBody(
        await handleChatAction(actionRequest({ intent: "question", question: "Question" }), unavailableDeps),
      ),
    ).toEqual({
      intent: "question",
      ok: false,
      code: "service_unavailable",
      conversationUid: "conversation-1",
      messageUid: "message-1",
    });
    expect(completeMessage).toHaveBeenLastCalledWith({
      messageUid: "message-1",
      outcome: { status: "failed", failureCode: "service_unavailable", runId: null },
      now,
    });

    completeMessage.mockClear();
    startMessage.mockClear();
    const limited = makeDependencies({
      completeMessage,
      startMessage,
      limiter: { limit: async () => ({ success: false }) },
    });
    await handleChatAction(actionRequest({ intent: "question", question: "Question" }), limited);
    await handleChatAction(actionRequest({ intent: "question", question: "" }), limited);
    expect(startMessage).not.toHaveBeenCalled();
    expect(completeMessage).not.toHaveBeenCalled();
  });

  it("still returns the answer when saving it fails, and reports the failure", async () => {
    const reportError = jest.fn((_message: string, _error: unknown) => undefined);
    const deps = makeDependencies({
      reportError,
      completeMessage: async () => {
        throw new Error("database details stay server-side");
      },
    });
    expect(
      await responseBody(await handleChatAction(actionRequest({ intent: "question", question: "Question" }), deps)),
    ).toMatchObject({ intent: "question", ok: true, result: { status: "answered" } });
    expect(reportError).toHaveBeenCalledWith("Failed to save an AI chat message", expect.any(Error));
  });

  it("returns service_unavailable without calling AL1S when the message cannot be stored", async () => {
    const runQuestion = jest.fn(async () => ({ ok: true as const, result: answer }));
    const deps = makeDependencies({
      runQuestion,
      startMessage: async () => {
        throw new Error("database details stay server-side");
      },
    });
    expect(
      await responseBody(await handleChatAction(actionRequest({ intent: "question", question: "Question" }), deps)),
    ).toEqual({ intent: "question", ok: false, code: "service_unavailable" });
    expect(runQuestion).not.toHaveBeenCalled();
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
        await handleChatAction(
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
        await handleChatAction(actionRequest({ intent: "question", question: "Private", personalMode: true }), deps),
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
        await handleChatAction(
          actionRequest({ intent: "question", question: "Private", personalMode: true }),
          noConsent,
        ),
      ),
    ).toEqual({
      intent: "question",
      ok: false,
      code: "consent_required",
      conversationUid: "conversation-1",
      messageUid: "message-1",
    });
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
        await handleChatAction(actionRequest({ intent: "question", question: "Private", personalMode: true }), deps),
      ),
    ).toEqual({
      intent: "question",
      ok: false,
      code: "member_data_unavailable",
      conversationUid: "conversation-1",
      messageUid: "message-1",
    });
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
        await handleChatAction(actionRequest({ intent: "question", question: "Private", personalMode: true }), deps),
      ),
    ).toEqual({
      intent: "question",
      ok: false,
      code: "snapshot_too_large",
      conversationUid: "conversation-1",
      messageUid: "message-1",
    });
    expect(runQuestion).not.toHaveBeenCalled();
  });

  it("returns safe errors for an unavailable limiter, limiter failure, and exhaustion", async () => {
    const payload = { intent: "question", question: "Question" };
    const noLimiter = makeDependencies({ limiter: undefined });
    expect(await responseBody(await handleChatAction(actionRequest(payload), noLimiter))).toEqual({
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
    expect(await responseBody(await handleChatAction(actionRequest(payload), failedLimiter))).toEqual({
      intent: "question",
      ok: false,
      code: "service_unavailable",
    });

    const exhaustedLimiter = makeDependencies({ limiter: { limit: async () => ({ success: false }) } });
    expect(await responseBody(await handleChatAction(actionRequest(payload), exhaustedLimiter))).toEqual({
      intent: "question",
      ok: false,
      code: "rate_limited",
    });
  });
});
