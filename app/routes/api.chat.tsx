import type { ActionFunctionArgs } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  buildChatHistory,
  type ChatErrorCode,
  type ChatMessageFailureCode,
  type ChatMessageOutcome,
  type ChatProgressStep,
} from "~/domain/chat-conversation";
import { isAdminSensei } from "~/domain/sensei-role";
import { getLogger } from "~/lib/observability.server";
import { type QuestionServiceCall, runQuestion } from "~/models/al1s-question.server";
import { type QuestionRequest, type QuestionRunEvent, REQUEST_LIMITS } from "~/models/al1s-question-contract";
import {
  completeChatMessage,
  retryChatMessage,
  type StartChatMessageResult,
  startChatMessage,
} from "~/models/chat-conversation";
import { buildQuestionMemberSnapshot } from "~/models/question-member-snapshot.server";
import {
  consentToQuestionMemberData,
  getQuestionMemberDataConsentAt,
  revokeQuestionMemberDataConsent,
} from "~/models/sensei";

type ChatSensei = { id: number; username: string };

export type ChatActionDependencies = {
  getSensei: () => Promise<ChatSensei | null>;
  readConsent: (senseiId: number) => Promise<Date | null>;
  consent: (senseiId: number) => Promise<unknown>;
  revokeConsent: (senseiId: number) => Promise<void>;
  buildSnapshot: (senseiId: number) => Promise<QuestionRequest["member"]>;
  runQuestion: (question: QuestionRequest, onEvent?: (event: QuestionRunEvent) => void) => Promise<QuestionServiceCall>;
  startMessage: (input: {
    senseiId: number;
    conversationUid: string | null;
    question: string;
    personalMode: boolean;
    now: Date;
  }) => Promise<StartChatMessageResult>;
  retryMessage: (input: {
    senseiId: number;
    conversationUid: string;
    messageUid: string;
    personalMode: boolean;
    now: Date;
  }) => Promise<StartChatMessageResult>;
  completeMessage: (input: { messageUid: string; outcome: ChatMessageOutcome; now: Date }) => Promise<void>;
  waitUntil?: (promise: Promise<void>) => void;
  reportError?: (message: string, error: unknown) => void;
  limiter?: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
  now: () => Date;
};

type ChatMessageIds = { conversationUid: string; messageUid: string };
type ChatActionReply =
  | { intent: "consent" | "revoke"; ok: boolean }
  | ({ intent: "question"; ok: true; result: Extract<QuestionServiceCall, { ok: true }>["result"] } & ChatMessageIds)
  | ({ intent: "question"; ok: false; code: ChatErrorCode } & Partial<ChatMessageIds>);

const UID_MAX_LENGTH = 64;

function reply(value: ChatActionReply): Response {
  if (value.intent !== "question") return Response.json(value, { headers: { "Cache-Control": "private, no-store" } });
  return new Response(`${JSON.stringify({ type: "result", ...value })}\n`, {
    headers: { "Cache-Control": "private, no-store", "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

function encodeLine(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalUid(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && value.length > 0 && value.length <= UID_MAX_LENGTH ? value : undefined;
}

const startFailureCodes = {
  not_found: "conversation_not_found",
  busy: "conversation_busy",
  not_retryable: "invalid_request",
} as const satisfies Record<Extract<StartChatMessageResult, { ok: false }>["reason"], ChatErrorCode>;

export async function handleChatAction(request: Request, deps: ChatActionDependencies): Promise<Response> {
  const requestTime = deps.now();
  let submitted: unknown;
  try {
    submitted = await request.json();
  } catch {
    return reply({ intent: "question", ok: false, code: "invalid_request" });
  }
  const body = objectRecord(submitted);
  if (!body) return reply({ intent: "question", ok: false, code: "invalid_request" });

  if (body.intent === "consent" || body.intent === "revoke") {
    try {
      const sensei = await deps.getSensei();
      if (!sensei) return reply({ intent: body.intent, ok: false });
      if (body.intent === "consent") await deps.consent(sensei.id);
      else await deps.revokeConsent(sensei.id);
      return reply({ intent: body.intent, ok: true });
    } catch {
      return reply({ intent: body.intent, ok: false });
    }
  }

  const conversationUid = optionalUid(body.conversationUid);
  const retryMessageUid = optionalUid(body.retryMessageUid);
  if (
    body.intent !== "question" ||
    (body.personalMode !== undefined && typeof body.personalMode !== "boolean") ||
    conversationUid === undefined ||
    retryMessageUid === undefined ||
    (retryMessageUid !== null && conversationUid === null)
  ) {
    return reply({ intent: "question", ok: false, code: "invalid_request" });
  }
  // A retry asks the stored question again, so only a new message carries question text.
  let question = "";
  if (retryMessageUid === null) {
    if (typeof body.question !== "string") return reply({ intent: "question", ok: false, code: "invalid_request" });
    question = body.question.trim();
    if (!question || [...question].length > REQUEST_LIMITS.questionCodePoints) {
      return reply({ intent: "question", ok: false, code: "invalid_request" });
    }
  }

  let sensei: ChatSensei | null;
  try {
    sensei = await deps.getSensei();
  } catch {
    return reply({ intent: "question", ok: false, code: "service_unavailable" });
  }
  if (!sensei) return reply({ intent: "question", ok: false, code: "session_expired" });

  if (!deps.limiter) return reply({ intent: "question", ok: false, code: "service_unavailable" });
  try {
    const limit = await deps.limiter.limit({ key: String(sensei.id) });
    if (!limit.success) return reply({ intent: "question", ok: false, code: "rate_limited" });
  } catch {
    return reply({ intent: "question", ok: false, code: "service_unavailable" });
  }

  const personalMode = body.personalMode === true;
  let start: StartChatMessageResult;
  try {
    start =
      retryMessageUid !== null && conversationUid !== null
        ? await deps.retryMessage({
            senseiId: sensei.id,
            conversationUid,
            messageUid: retryMessageUid,
            personalMode,
            now: requestTime,
          })
        : await deps.startMessage({ senseiId: sensei.id, conversationUid, question, personalMode, now: requestTime });
  } catch (error) {
    deps.reportError?.("Failed to start an AI chat message", error);
    return reply({ intent: "question", ok: false, code: "service_unavailable" });
  }
  if (!start.ok) return reply({ intent: "question", ok: false, code: startFailureCodes[start.reason] });
  const { started } = start;
  const ids: ChatMessageIds = { conversationUid: started.conversationUid, messageUid: started.messageUid };

  // The reply does not wait on a lost write: the stored message stays pending and later reads as interrupted.
  const complete = async (outcome: ChatMessageOutcome) => {
    try {
      await deps.completeMessage({ messageUid: started.messageUid, outcome, now: deps.now() });
    } catch (error) {
      deps.reportError?.("Failed to save an AI chat message", error);
    }
  };
  let progress: ChatProgressStep[] = [];
  const process = async (emit: (value: unknown) => void) => {
    const fail = async (code: ChatMessageFailureCode, runId: string | null = null, saveProgress = false) => {
      await complete({ status: "failed", failureCode: code, runId, ...(saveProgress ? { progress } : {}) });
      emit({ type: "result", intent: "question", ok: false, code, ...ids });
    };
    let member: QuestionRequest["member"];
    if (personalMode) {
      try {
        if (!(await deps.readConsent(sensei.id))) return fail("consent_required");
      } catch {
        return fail("service_unavailable");
      }
      try {
        member = await deps.buildSnapshot(sensei.id);
      } catch {
        return fail("member_data_unavailable");
      }
      if (!member) return fail("member_data_unavailable");
      try {
        if (new TextEncoder().encode(JSON.stringify(member)).byteLength > REQUEST_LIMITS.memberSnapshotBytes) {
          return fail("snapshot_too_large");
        }
      } catch {
        return fail("member_data_unavailable");
      }
    }

    const questionRequest: QuestionRequest = {
      question: started.question,
      context: { region: "gl", asOf: requestTime.toISOString() },
      history: buildChatHistory(started.previousMessages, personalMode),
      ...(member ? { member } : {}),
      profile: member ? "member" : "public",
    };
    let call: QuestionServiceCall;
    try {
      call = await deps.runQuestion(questionRequest, (event) => {
        if (event.type === "tool_started") {
          const existing = progress.findIndex((step) => step.callId === event.callId && step.round === event.round);
          const step: ChatProgressStep = {
            callId: event.callId,
            round: event.round,
            toolName: event.toolName,
            target: event.target,
            ...(event.subject ? { subject: event.subject } : {}),
            ok: false,
            sourceCount: 0,
          };
          if (existing < 0) progress = [...progress, step];
          else progress = progress.map((current, index) => index === existing ? step : current);
        } else {
          progress = progress.map((step) =>
            step.callId === event.callId && step.round === event.round
              ? { ...step, ok: event.ok, sourceCount: event.sources.length }
              : step,
          );
        }
        emit({ type: "event", event });
      });
    } catch {
      return fail("service_unavailable", null, true);
    }
    if (!call.ok) return fail(call.reason === "unavailable" ? "service_unavailable" : "internal_error", null, true);
    const result = call.result;
    await complete(
      result.status === "failed"
        ? { status: "failed", failureCode: result.error.code, runId: result.run.runId, progress }
        : { status: result.status, answer: result.answer, runId: result.run.runId, progress },
    );
    emit({ type: "result", intent: "question", ok: true, result, ...ids });
  };

  let task: Promise<void> = Promise.resolve();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let connected = true;
      const emit = (value: unknown) => {
        if (!connected) return;
        try {
          controller.enqueue(encodeLine(value));
        } catch {
          connected = false;
        }
      };
      emit({ type: "started", ...ids });
      task = process(emit).catch(async (error) => {
        deps.reportError?.("Failed to process an AI chat message", error);
        await complete({ status: "failed", failureCode: "service_unavailable", runId: null, progress });
        emit({ type: "result", intent: "question", ok: false, code: "service_unavailable", ...ids });
      }).finally(() => {
        if (connected) controller.close();
      });
    },
    cancel() {
      // The action's waitUntil task continues even after the browser disconnects.
    },
  });
  deps.waitUntil?.(task);
  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-store, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!isAdminSensei(sensei)) return new Response("Not Found", { status: 404 });
  const logger = getLogger(env, ctx, { route: "api.chat.action" });

  return handleChatAction(request, {
    getSensei: async () => sensei,
    readConsent: (senseiId) => getQuestionMemberDataConsentAt(env, senseiId, { ctx }),
    consent: (senseiId) => consentToQuestionMemberData(env, senseiId, { ctx }),
    revokeConsent: (senseiId) => revokeQuestionMemberDataConsent(env, senseiId, { ctx }),
    buildSnapshot: (senseiId) => buildQuestionMemberSnapshot(env, senseiId),
    runQuestion: (question, onEvent) => runQuestion(env, question, onEvent),
    startMessage: (input) => startChatMessage(env, input, { ctx }),
    retryMessage: (input) => retryChatMessage(env, input, { ctx }),
    completeMessage: (input) => completeChatMessage(env, input, { ctx }),
    waitUntil: ctx ? (promise) => ctx.waitUntil(promise) : undefined,
    reportError: (message, error) => logger.error(message, error),
    limiter: env.QUESTION_RATE_LIMITER,
    now: () => new Date(),
  });
};
