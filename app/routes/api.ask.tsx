import type { ActionFunctionArgs } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { isAdminSensei } from "~/domain/sensei-role";
import { type QuestionServiceCall, runQuestion } from "~/models/al1s-question.server";
import {
  type HistoryMessage,
  type QuestionRequest,
  REQUEST_LIMITS,
} from "~/models/al1s-question-contract";
import { buildQuestionMemberSnapshot } from "~/models/question-member-snapshot.server";
import {
  consentToQuestionMemberData,
  getQuestionMemberDataConsentAt,
  revokeQuestionMemberDataConsent,
} from "~/models/sensei";
import type { QuestionActionErrorCode } from "./ask._components/QuestionChat";

type AskSensei = { id: number; username: string };

export type AskQuestionActionDependencies = {
  getSensei: () => Promise<AskSensei | null>;
  readConsent: (senseiId: number) => Promise<Date | null>;
  consent: (senseiId: number) => Promise<unknown>;
  revokeConsent: (senseiId: number) => Promise<void>;
  buildSnapshot: (senseiId: number) => Promise<QuestionRequest["member"]>;
  runQuestion: (question: QuestionRequest) => Promise<QuestionServiceCall>;
  limiter?: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
  now: () => Date;
};

type AskActionReply =
  | { intent: "consent" | "revoke"; ok: boolean }
  | { intent: "question"; ok: true; result: Extract<QuestionServiceCall, { ok: true }>["result"] }
  | { intent: "question"; ok: false; code: QuestionActionErrorCode };

function reply(value: AskActionReply): Response {
  return Response.json(value, { headers: { "Cache-Control": "private, no-store" } });
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimCodePoints(value: string, limit: number): string {
  return [...value].slice(-limit).join("");
}

export function filterQuestionHistory(value: unknown): HistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item): HistoryMessage[] => {
      const entry = objectRecord(item);
      if (!entry || (entry.role !== "user" && entry.role !== "assistant") || typeof entry.text !== "string") return [];
      return [{ role: entry.role, text: trimCodePoints(entry.text, REQUEST_LIMITS.historyMessageCodePoints) }];
    })
    .slice(-REQUEST_LIMITS.historyMessages);
}

export async function handleAskAction(request: Request, deps: AskQuestionActionDependencies): Promise<Response> {
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

  if (
    body.intent !== "question" ||
    typeof body.question !== "string" ||
    (body.personalMode !== undefined && typeof body.personalMode !== "boolean")
  ) {
    return reply({ intent: "question", ok: false, code: "invalid_request" });
  }
  const question = body.question.trim();
  if (!question || [...question].length > REQUEST_LIMITS.questionCodePoints) {
    return reply({ intent: "question", ok: false, code: "invalid_request" });
  }

  let sensei: AskSensei | null;
  try {
    sensei = await deps.getSensei();
  } catch {
    return reply({ intent: "question", ok: false, code: "service_unavailable" });
  }

  if (!deps.limiter) return reply({ intent: "question", ok: false, code: "service_unavailable" });
  const rateLimitKey = sensei ? String(sensei.id) : request.headers.get("CF-Connecting-IP");
  if (!rateLimitKey) return reply({ intent: "question", ok: false, code: "service_unavailable" });
  try {
    const limit = await deps.limiter.limit({ key: rateLimitKey });
    if (!limit.success) return reply({ intent: "question", ok: false, code: "rate_limited" });
  } catch {
    return reply({ intent: "question", ok: false, code: "service_unavailable" });
  }

  const personalMode = body.personalMode === true;
  let member: QuestionRequest["member"];
  if (personalMode) {
    if (!sensei) return reply({ intent: "question", ok: false, code: "session_expired" });
    try {
      if (!(await deps.readConsent(sensei.id))) {
        return reply({ intent: "question", ok: false, code: "consent_required" });
      }
    } catch {
      return reply({ intent: "question", ok: false, code: "service_unavailable" });
    }
    try {
      member = await deps.buildSnapshot(sensei.id);
    } catch {
      return reply({ intent: "question", ok: false, code: "member_data_unavailable" });
    }
    if (!member) return reply({ intent: "question", ok: false, code: "member_data_unavailable" });
    try {
      if (new TextEncoder().encode(JSON.stringify(member)).byteLength > REQUEST_LIMITS.memberSnapshotBytes) {
        return reply({ intent: "question", ok: false, code: "snapshot_too_large" });
      }
    } catch {
      return reply({ intent: "question", ok: false, code: "member_data_unavailable" });
    }
  }

  const questionRequest: QuestionRequest = {
    question,
    context: { region: "gl", asOf: requestTime.toISOString() },
    history: filterQuestionHistory(body.history),
    ...(member ? { member } : {}),
    profile: member ? "member" : "public",
  };
  try {
    const result = await deps.runQuestion(questionRequest);
    if (result.ok) return reply({ intent: "question", ok: true, result: result.result });
    return reply({
      intent: "question",
      ok: false,
      code: result.reason === "unavailable" ? "service_unavailable" : "internal_error",
    });
  } catch {
    return reply({ intent: "question", ok: false, code: "service_unavailable" });
  }
}

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!isAdminSensei(sensei)) return new Response("Not Found", { status: 404 });

  return handleAskAction(request, {
    getSensei: async () => sensei,
    readConsent: (senseiId) => getQuestionMemberDataConsentAt(env, senseiId, { ctx }),
    consent: (senseiId) => consentToQuestionMemberData(env, senseiId, { ctx }),
    revokeConsent: (senseiId) => revokeQuestionMemberDataConsent(env, senseiId, { ctx }),
    buildSnapshot: (senseiId) => buildQuestionMemberSnapshot(env, senseiId),
    runQuestion: (question) => runQuestion(env, question),
    limiter: env.QUESTION_RATE_LIMITER,
    now: () => new Date(),
  });
};
