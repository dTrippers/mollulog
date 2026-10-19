import type {
  AnswerSource,
  AnswerStatus,
  FailureCode,
  JsonValue,
  QuestionRequest,
  QuestionRunResult,
  RunInfo,
  RunUsage,
  SourceKind,
  SourceRecord,
} from "./al1s-question-contract";

export type QuestionServiceCall =
  | { ok: true; result: QuestionRunResult }
  | { ok: false; reason: "unavailable" | "unexpected_result" };

const sourceKinds = new Set<SourceKind>(["knowledge", "student", "schedule", "raid_stats", "member"]);
const answerStatuses = new Set<AnswerStatus>(["answered", "needs_clarification", "insufficient_evidence"]);
const failureCodes = new Set<FailureCode>([
  "invalid_request",
  "provider_failure",
  "budget_exhausted",
  "timeout",
  "validation_failed",
  "internal_error",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown): value is string {
  return typeof value === "string";
}

function nonEmptyString(value: unknown): value is string {
  return string(value) && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function jsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  const object = record(value);
  return object !== null && Object.values(object).every(jsonValue);
}

function parseRun(value: unknown): RunInfo | null {
  const run = record(value);
  const usage = record(run?.usage);
  if (
    !run ||
    !usage ||
    !nonEmptyString(run.runId) ||
    !nonEmptyString(run.provider) ||
    !nonEmptyString(run.model) ||
    !nonEmptyString(run.promptVersion) ||
    !nonEmptyString(run.artifactHash) ||
    !Number.isInteger(usage.modelCalls) ||
    !Number.isInteger(usage.toolCalls) ||
    !Number.isInteger(usage.uncachedInputTokens) ||
    !Number.isInteger(usage.cacheReadInputTokens) ||
    !Number.isInteger(usage.cacheWriteInputTokens) ||
    !Number.isInteger(usage.outputTokens) ||
    !finiteNumber(usage.costUsd) ||
    typeof usage.complete !== "boolean"
  )
    return null;
  return {
    runId: run.runId,
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
    artifactHash: run.artifactHash,
    usage: {
      modelCalls: usage.modelCalls as number,
      toolCalls: usage.toolCalls as number,
      uncachedInputTokens: usage.uncachedInputTokens as number,
      cacheReadInputTokens: usage.cacheReadInputTokens as number,
      cacheWriteInputTokens: usage.cacheWriteInputTokens as number,
      outputTokens: usage.outputTokens as number,
      costUsd: usage.costUsd,
      complete: usage.complete,
    } satisfies RunUsage,
  };
}

function parseSourceRecord(value: unknown): SourceRecord | null {
  const source = record(value);
  const scope = record(source?.scope);
  if (
    !source ||
    !scope ||
    !nonEmptyString(source.sourceId) ||
    !nonEmptyString(source.toolName) ||
    !string(source.kind) ||
    !sourceKinds.has(source.kind as SourceKind) ||
    !nonEmptyString(source.label) ||
    !nonEmptyString(source.retrievedAt) ||
    !jsonValue(source.arguments) ||
    !jsonValue(source.facts) ||
    !jsonValue(source.modelView) ||
    (scope.region !== undefined && !string(scope.region)) ||
    (scope.asOf !== undefined && !string(scope.asOf))
  )
    return null;
  return {
    sourceId: source.sourceId,
    toolName: source.toolName,
    arguments: source.arguments,
    kind: source.kind as SourceKind,
    label: source.label,
    facts: source.facts,
    modelView: source.modelView,
    retrievedAt: source.retrievedAt,
    scope: {
      ...(string(scope.region) ? { region: scope.region } : {}),
      ...(string(scope.asOf) ? { asOf: scope.asOf } : {}),
    },
  };
}

export function parseQuestionRunResult(value: unknown): QuestionRunResult | null {
  const result = record(value);
  const run = parseRun(result?.run);
  if (!result || !run) return null;
  if (result.status === "failed") {
    const error = record(result.error);
    if (!error || typeof error.code !== "string" || !failureCodes.has(error.code as FailureCode)) return null;
    return { status: "failed", error: { code: error.code as FailureCode }, run };
  }
  if (typeof result.status !== "string" || !answerStatuses.has(result.status as AnswerStatus)) return null;
  const answer = record(result.answer);
  if (!answer || !nonEmptyString(answer.text) || !Array.isArray(answer.sources) || !Array.isArray(answer.limitations))
    return null;
  const sources: AnswerSource[] = [];
  for (const sourceValue of answer.sources) {
    const source = record(sourceValue);
    if (
      !source ||
      !nonEmptyString(source.sourceId) ||
      !string(source.kind) ||
      !sourceKinds.has(source.kind as SourceKind) ||
      !nonEmptyString(source.label)
    ) {
      return null;
    }
    sources.push({ sourceId: source.sourceId, kind: source.kind as SourceKind, label: source.label });
  }
  if (!answer.limitations.every(string)) return null;
  if (result.sourceRecords !== undefined && !Array.isArray(result.sourceRecords)) return null;
  const sourceRecords = Array.isArray(result.sourceRecords) ? result.sourceRecords.map(parseSourceRecord) : undefined;
  if (sourceRecords?.some((source) => source === null)) return null;
  return {
    status: result.status as AnswerStatus,
    answer: { text: answer.text, sources, limitations: answer.limitations as string[] },
    run,
    ...(sourceRecords ? { sourceRecords: sourceRecords as SourceRecord[] } : {}),
  };
}

export async function runQuestion(
  env: Partial<Pick<Env, "AL1S">>,
  request: QuestionRequest,
): Promise<QuestionServiceCall> {
  if (!env.AL1S) return { ok: false, reason: "unavailable" };
  try {
    const result = parseQuestionRunResult(await env.AL1S.runQuestion(request));
    return result ? { ok: true, result } : { ok: false, reason: "unexpected_result" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
