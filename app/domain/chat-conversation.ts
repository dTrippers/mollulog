import {
  type Answer,
  type AnswerSource,
  type AnswerStatus,
  type FailureCode,
  type HistoryMessage,
  parseSourceSubject,
  REQUEST_LIMITS,
  type SourceKind,
} from "~/models/al1s-question-contract";

// The conversation list shows conversations with a message in this many days. Older conversations stay stored.
export const CHAT_CONVERSATION_LIST_DAYS = 30;
export const CHAT_TITLE_CODE_POINTS = 100;
// AL-1S stops a run after 45 seconds. A message still pending after this window lost its request and is interrupted.
export const CHAT_PENDING_STALE_MS = 2 * 60 * 1000;

// Error codes the chat action can return. Every code from `rate_limited` down to `consent_required` can also be
// stored on a message; `network` exists only on the client.
export type ChatErrorCode =
  | "rate_limited"
  | "service_unavailable"
  | FailureCode
  | "member_data_unavailable"
  | "snapshot_too_large"
  | "session_expired"
  | "consent_required"
  | "conversation_not_found"
  | "conversation_busy"
  | "network";

export type ChatMessageFailureCode = Exclude<
  ChatErrorCode,
  "rate_limited" | "session_expired" | "conversation_not_found" | "conversation_busy" | "network"
>;

export type ChatMessageStatus = "pending" | AnswerStatus | "failed";

export type ChatMessage = {
  uid: string;
  seq: number;
  question: string;
  personalMode: boolean;
  status: ChatMessageStatus;
  answer: Answer | null;
  progress: ChatProgressStep[] | null;
  failureCode: ChatMessageFailureCode | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatProgressStep = {
  callId: string;
  round: number;
  toolName: string;
  target: string | null;
  subject?: NonNullable<AnswerSource["subject"]>;
  ok: boolean;
  sourceCount: number;
};

export type ChatConversationSummary = {
  uid: string;
  title: string;
  lastMessageAt: Date;
  questionCount: number;
  latestMessage: Pick<ChatMessage, "status" | "updatedAt">;
};

export type ChatConversation = Omit<ChatConversationSummary, "questionCount" | "latestMessage"> & {
  messages: ChatMessage[];
};

export type ChatConversationListStatus = "in_progress" | "failed" | null;

export function getChatConversationListStatus(
  latestMessage: Pick<ChatMessage, "status" | "updatedAt">,
  now: Date,
): ChatConversationListStatus {
  if (latestMessage.status === "pending") {
    return isChatMessageInterrupted(latestMessage, now) ? "failed" : "in_progress";
  }
  return latestMessage.status === "failed" ? "failed" : null;
}

export type ChatMessageOutcome =
  | { status: AnswerStatus; answer: Answer; runId: string; progress?: ChatProgressStep[] }
  | { status: "failed"; failureCode: ChatMessageFailureCode; runId: string | null; progress?: ChatProgressStep[] };

const answerStatuses = new Set<string>(["answered", "needs_clarification", "insufficient_evidence"]);
const messageStatuses = new Set<string>(["pending", "failed", ...answerStatuses]);
const sourceKinds = new Set<string>(["knowledge", "student", "schedule", "raid_stats", "member"]);
const messageFailureCodes = new Set<string>([
  "service_unavailable",
  "invalid_request",
  "provider_failure",
  "budget_exhausted",
  "timeout",
  "validation_failed",
  "internal_error",
  "member_data_unavailable",
  "snapshot_too_large",
  "consent_required",
]);

export function chatConversationTitle(question: string): string {
  return [...question.trim().replace(/\s+/g, " ")].slice(0, CHAT_TITLE_CODE_POINTS).join("");
}

export function isChatMessageInterrupted(message: Pick<ChatMessage, "status" | "updatedAt">, now: Date): boolean {
  return message.status === "pending" && now.getTime() - message.updatedAt.getTime() > CHAT_PENDING_STALE_MS;
}

export function isChatMessageInProgress(message: Pick<ChatMessage, "status" | "updatedAt">, now: Date): boolean {
  return message.status === "pending" && !isChatMessageInterrupted(message, now);
}

// A failed or interrupted message can be asked again. An answered message cannot.
export function isChatMessageRetryable(message: Pick<ChatMessage, "status" | "updatedAt">, now: Date): boolean {
  return message.status === "failed" || isChatMessageInterrupted(message, now);
}

function clampHistoryText(value: string): string {
  return [...value].slice(-REQUEST_LIMITS.historyMessageCodePoints).join("");
}

// Earlier answered turns become context for the next question. A turn that sent member data is context only for
// another member-data question, so a public question never carries a personal answer.
export function buildChatHistory(
  messages: ReadonlyArray<Pick<ChatMessage, "question" | "personalMode" | "status" | "answer">>,
  personalMode: boolean,
): HistoryMessage[] {
  return messages
    .flatMap((message): HistoryMessage[] =>
      answerStatuses.has(message.status) && message.answer && (personalMode || !message.personalMode)
        ? [
            { role: "user", text: clampHistoryText(message.question) },
            { role: "assistant", text: clampHistoryText(message.answer.text) },
          ]
        : [],
    )
    .slice(-REQUEST_LIMITS.historyMessages);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseChatMessageStatus(value: string): ChatMessageStatus {
  if (!messageStatuses.has(value)) throw new Error("Stored chat message status is invalid.");
  return value as ChatMessageStatus;
}

export function parseChatMessageFailureCode(value: string | null): ChatMessageFailureCode | null {
  if (value === null) return null;
  if (!messageFailureCodes.has(value)) throw new Error("Stored chat message failure code is invalid.");
  return value as ChatMessageFailureCode;
}

export function parseChatAnswer(value: unknown): Answer | null {
  if (value === null) return null;
  const answer = record(value);
  if (
    !answer ||
    typeof answer.text !== "string" ||
    !Array.isArray(answer.sources) ||
    !Array.isArray(answer.limitations) ||
    !answer.limitations.every((limitation) => typeof limitation === "string")
  ) {
    throw new Error("Stored chat answer is invalid.");
  }
  const sources = answer.sources.map((value): AnswerSource => {
    const source = record(value);
    if (
      !source ||
      typeof source.sourceId !== "string" ||
      typeof source.kind !== "string" ||
      !sourceKinds.has(source.kind) ||
      typeof source.label !== "string"
    ) {
      throw new Error("Stored chat answer source is invalid.");
    }
    const subject = source.subject === undefined ? undefined : parseSourceSubject(source.subject);
    return {
      sourceId: source.sourceId,
      kind: source.kind as SourceKind,
      label: source.label,
      ...(subject === undefined ? {} : { subject }),
    };
  });
  return { text: answer.text, sources, limitations: answer.limitations as string[] };
}

export function parseChatProgress(value: unknown): ChatProgressStep[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) return null;
  return value.flatMap((value): ChatProgressStep[] => {
    const step = record(value);
    if (
      !step ||
      typeof step.callId !== "string" ||
      !step.callId ||
      !Number.isInteger(step.round) ||
      (step.round as number) < 0 ||
      typeof step.toolName !== "string" ||
      !step.toolName ||
      (step.target !== null && typeof step.target !== "string") ||
      typeof step.ok !== "boolean" ||
      !Number.isInteger(step.sourceCount) ||
      (step.sourceCount as number) < 0
    ) return [];
    const subject = step.subject === undefined ? undefined : parseSourceSubject(step.subject);
    if (step.subject !== undefined && subject === undefined) return [];
    return [{
      callId: step.callId,
      round: step.round as number,
      toolName: step.toolName,
      target: step.target as string | null,
      ...(subject ? { subject } : {}),
      ok: step.ok,
      sourceCount: step.sourceCount as number,
    }];
  });
}
