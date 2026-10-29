export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type Profile = "public" | "member" | "internal";
export type QuestionContext = { region: string; asOf: string };
export type HistoryMessage = { role: "user" | "assistant"; text: string };
export type MemberSnapshot = {
  version: 1;
  students: Array<{
    studentUid: string;
    star: number;
    weaponStar: number;
    level: number | null;
    skills: { ex: number | null; normal: number | null; enhanced: number | null; sub: number | null };
    equipmentTiers: [number | null, number | null, number | null];
    equipSpecial: number | null;
    relationshipLevel: number | null;
  }>;
  favorites: Array<{ studentUid: string; contentId: string }>;
  formations: Array<{
    name: string;
    raidType: string | null;
    seasonIndex: number | null;
    studentUids: Array<Array<string | null>>;
  }>;
};

export type QuestionRequest = {
  question: string;
  context: QuestionContext;
  history?: HistoryMessage[];
  member?: MemberSnapshot;
  profile: Profile;
};

export const REQUEST_LIMITS = {
  questionCodePoints: 8192,
  historyMessages: 6,
  historyMessageCodePoints: 4000,
  memberSnapshotBytes: 65536,
} as const;

export type AnswerStatus = "answered" | "needs_clarification" | "insufficient_evidence";
export type SourceKind = "knowledge" | "student" | "schedule" | "raid_stats" | "member";
export type SourceSubject = { type: "student"; uid: string } | { type: "raid_boss"; boss: string };
export type AnswerSource = { sourceId: string; kind: SourceKind; label: string; subject?: SourceSubject };
export type QuestionRunEvent =
  | { type: "tool_started"; callId: string; round: number; toolName: string; target: string | null; subject?: SourceSubject }
  | { type: "tool_completed"; callId: string; round: number; toolName: string; ok: boolean; sources: AnswerSource[] };

export function parseSourceSubject(value: unknown): SourceSubject | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const subject = value as Record<string, unknown>;
  if (Object.keys(subject).length !== 2) return undefined;
  if (subject.type === "student" && typeof subject.uid === "string" && subject.uid.trim() !== "") {
    return { type: "student", uid: subject.uid };
  }
  if (subject.type === "raid_boss" && typeof subject.boss === "string" && subject.boss.trim() !== "") {
    return { type: "raid_boss", boss: subject.boss };
  }
  return undefined;
}

export type Answer = { text: string; sources: AnswerSource[]; limitations: string[] };
export type FailureCode =
  | "invalid_request"
  | "provider_failure"
  | "budget_exhausted"
  | "timeout"
  | "validation_failed"
  | "internal_error";
export type ToolErrorCode = "invalid_arguments" | "source_unavailable" | "tool_failure";
export type RunUsage = {
  modelCalls: number;
  toolCalls: number;
  uncachedInputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  costUsd: number;
  complete: boolean;
};
export type RunInfo = {
  runId: string;
  provider: string;
  model: string;
  promptVersion: string;
  artifactHash: string;
  usage: RunUsage;
};
export type SourceRecord = {
  sourceId: string;
  toolName: string;
  arguments: JsonValue;
  kind: SourceKind;
  label: string;
  subject?: SourceSubject;
  facts: JsonValue;
  modelView: JsonValue;
  retrievedAt: string;
  scope: { region?: string; asOf?: string };
};
export type QuestionRunResult =
  | { status: AnswerStatus; answer: Answer; run: RunInfo; sourceRecords?: SourceRecord[] }
  | { status: "failed"; error: { code: FailureCode }; run: RunInfo };
