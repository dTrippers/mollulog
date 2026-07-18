export const WALKTHROUGH_TIMELINE_SCHEMA_VERSION = 1 as const;
export const WALKTHROUGH_TIMELINE_LIMITS = {
  parties: 20,
  stepsPerParty: 200,
  actionsPerStep: 20,
} as const;

export const WALKTHROUGH_TIMELINE_VISIBILITIES = ["public", "unlisted", "private"] as const;
export type WalkthroughTimelineVisibility = (typeof WALKTHROUGH_TIMELINE_VISIBILITIES)[number];

export function isWalkthroughTimelineVisibility(value: unknown): value is WalkthroughTimelineVisibility {
  return WALKTHROUGH_TIMELINE_VISIBILITIES.some((visibility) => visibility === value);
}

export const WALKTHROUGH_TIMELINE_DIFFICULTIES = [
  "normal",
  "hard",
  "very_hard",
  "hardcore",
  "extreme",
  "insane",
  "torment",
  "lunatic",
] as const;
export type WalkthroughTimelineDifficulty = (typeof WALKTHROUGH_TIMELINE_DIFFICULTIES)[number];
export const WALKTHROUGH_TIMELINE_DEFENSE_TYPES = ["light", "heavy", "special", "elastic"] as const;
export type WalkthroughTimelineDefenseType = (typeof WALKTHROUGH_TIMELINE_DEFENSE_TYPES)[number];
export const WALKTHROUGH_TIMELINE_TERRAINS = ["indoor", "outdoor", "street"] as const;
export type WalkthroughTimelineTerrain = (typeof WALKTHROUGH_TIMELINE_TERRAINS)[number];

export type WalkthroughTimelineDocument = {
  type: "walkthrough_timeline";
  schemaVersion: typeof WALKTHROUGH_TIMELINE_SCHEMA_VERSION;
  partySize: 6 | 10;
  context: {
    bossUid: string;
    terrain: WalkthroughTimelineTerrain;
    defenseType: WalkthroughTimelineDefenseType;
    maxDifficulty: WalkthroughTimelineDifficulty;
  };
  parties: WalkthroughParty[];
};

export type WalkthroughParty = {
  uid: string;
  order: number;
  startingSkillStudentUids: string[];
  units: WalkthroughUnit[];
  steps: TimelineStep[];
};

export type WalkthroughUnit = {
  slot: number;
  studentUid: string | null;
  snapshot?: {
    tier?: number;
    level?: number;
    skillEx?: number;
    skillNormal?: number;
    skillEnhanced?: number;
    skillSub?: number;
    equip1?: number;
    equip2?: number;
    equip3?: number;
    equipSpecial?: number;
    weaponLevel?: number;
    abilityHp?: number;
    abilityAtk?: number;
    abilityHeal?: number;
  };
};

export type TimelineMarker = {
  kind: "time_remaining" | "cost" | "after" | "immediate" | "manual";
  value?: string;
};

export type TimelineAction = {
  kind: "student_ex" | "normal_skill" | "boss_gimmick" | "free_text";
  studentUid?: string;
  targetStudentUid?: string;
  copied?: boolean;
  text?: string;
};

export type TimelineStep = {
  uid: string;
  order: number;
  kind: "actions" | "note" | "divider";
  marker?: TimelineMarker;
  actions: TimelineAction[];
  note?: string;
  sourceText?: string;
};

export type WalkthroughTimelineRecord = {
  uid: string;
  userId: number;
  title: string;
  description: string;
  visibility: WalkthroughTimelineVisibility;
  bossUid: string;
  terrain: WalkthroughTimelineTerrain;
  defenseType: WalkthroughTimelineDefenseType;
  maxDifficulty: WalkthroughTimelineDifficulty;
  document: WalkthroughTimelineDocument;
  createdAt: Date;
  updatedAt: Date;
};

export class InvalidWalkthroughTimelineDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWalkthroughTimelineDocumentError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, path: string, nullable = false): asserts value is string {
  if (typeof value !== "string" || (!nullable && value.trim().length === 0)) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path} 값이 올바른 문자열이 아니에요.`);
  }
}

function assertOptionalNumber(value: unknown, path: string) {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path} 값이 올바른 숫자가 아니에요.`);
  }
}

function assertMarker(value: unknown, path: string): asserts value is TimelineMarker {
  if (!isObject(value)) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path} 값이 올바른 marker가 아니에요.`);
  }
  if (!["time_remaining", "cost", "after", "immediate", "manual"].includes(String(value.kind))) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.kind 값이 지원되지 않아요.`);
  }
  if (value.value !== undefined && typeof value.value !== "string") {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.value 값이 올바른 문자열이 아니에요.`);
  }
}

function assertAction(value: unknown, path: string): asserts value is TimelineAction {
  if (!isObject(value)) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path} 값이 올바른 action이 아니에요.`);
  }
  if (!["student_ex", "normal_skill", "boss_gimmick", "free_text"].includes(String(value.kind))) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.kind 값이 지원되지 않아요.`);
  }
  for (const key of ["studentUid", "targetStudentUid", "text"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      throw new InvalidWalkthroughTimelineDocumentError(`${path}.${key} 값이 올바른 문자열이 아니에요.`);
    }
  }
  if (value.copied !== undefined && typeof value.copied !== "boolean") {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.copied 값이 올바른 boolean이 아니에요.`);
  }
  if ((value.kind === "student_ex" || value.kind === "normal_skill") && !value.studentUid) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.studentUid 값이 필요해요.`);
  }
  if ((value.kind === "free_text" || value.kind === "boss_gimmick") && !value.text) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.text 값이 필요해요.`);
  }
}

function assertStep(value: unknown, path: string): asserts value is TimelineStep {
  if (!isObject(value)) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path} 값이 올바른 step이 아니에요.`);
  }
  assertString(value.uid, `${path}.uid`);
  if (!Number.isInteger(value.order) || Number(value.order) < 0) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.order 값이 올바르지 않아요.`);
  }
  if (!["actions", "note", "divider"].includes(String(value.kind))) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.kind 값이 지원되지 않아요.`);
  }
  if (value.marker !== undefined) assertMarker(value.marker, `${path}.marker`);
  if (!Array.isArray(value.actions)) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.actions 값이 배열이 아니에요.`);
  }
  if (value.actions.length > WALKTHROUGH_TIMELINE_LIMITS.actionsPerStep) {
    throw new InvalidWalkthroughTimelineDocumentError(
      `${path}.actions는 ${WALKTHROUGH_TIMELINE_LIMITS.actionsPerStep}개를 넘을 수 없어요.`,
    );
  }
  value.actions.forEach((action, index) => {
    assertAction(action, `${path}.actions[${index}]`);
  });
  if (value.kind === "actions" && value.actions.length === 0) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.actions에 실행 내용이 필요해요.`);
  }
  if (value.note !== undefined && typeof value.note !== "string") {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.note 값이 올바른 문자열이 아니에요.`);
  }
  if (value.sourceText !== undefined && typeof value.sourceText !== "string") {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.sourceText 값이 올바른 문자열이 아니에요.`);
  }
}

function assertParty(value: unknown, path: string, partySize: 6 | 10): asserts value is WalkthroughParty {
  if (!isObject(value)) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path} 값이 올바른 party가 아니에요.`);
  }
  assertString(value.uid, `${path}.uid`);
  if (!Number.isInteger(value.order) || Number(value.order) < 0) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.order 값이 올바르지 않아요.`);
  }
  if (
    !Array.isArray(value.startingSkillStudentUids) ||
    value.startingSkillStudentUids.some((uid) => typeof uid !== "string")
  ) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.startingSkillStudentUids 값이 올바르지 않아요.`);
  }
  if (value.startingSkillStudentUids.length > 3) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.startingSkillStudentUids는 3개를 넘을 수 없어요.`);
  }
  if (!Array.isArray(value.units)) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.units 값이 배열이 아니에요.`);
  }
  if (value.units.length > partySize) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.units는 ${partySize}개를 넘을 수 없어요.`);
  }
  const occupiedSlots = new Set<number>();
  const selectedStudentUids = new Set<string>();
  for (const [index, unit] of value.units.entries()) {
    if (!isObject(unit) || !Number.isInteger(unit.slot) || Number(unit.slot) < 0 || Number(unit.slot) >= partySize) {
      throw new InvalidWalkthroughTimelineDocumentError(`${path}.units[${index}] 값이 올바르지 않아요.`);
    }
    if (occupiedSlots.has(Number(unit.slot))) {
      throw new InvalidWalkthroughTimelineDocumentError(`${path}.units에 중복된 slot이 있어요.`);
    }
    occupiedSlots.add(Number(unit.slot));
    if (unit.studentUid !== null && typeof unit.studentUid !== "string") {
      throw new InvalidWalkthroughTimelineDocumentError(`${path}.units[${index}].studentUid 값이 올바르지 않아요.`);
    }
    if (typeof unit.studentUid === "string") {
      if (selectedStudentUids.has(unit.studentUid)) {
        throw new InvalidWalkthroughTimelineDocumentError(`${path}.units에 같은 학생이 중복됐어요.`);
      }
      selectedStudentUids.add(unit.studentUid);
    }
    if (unit.snapshot !== undefined && !isObject(unit.snapshot)) {
      throw new InvalidWalkthroughTimelineDocumentError(`${path}.units[${index}].snapshot 값이 올바르지 않아요.`);
    }
    if (isObject(unit.snapshot)) {
      for (const [field, fieldValue] of Object.entries(unit.snapshot)) {
        assertOptionalNumber(fieldValue, `${path}.units[${index}].snapshot.${field}`);
      }
    }
  }
  if (value.startingSkillStudentUids.some((uid) => !selectedStudentUids.has(uid))) {
    throw new InvalidWalkthroughTimelineDocumentError(
      `${path}.startingSkillStudentUids에 편성되지 않은 학생이 있어요.`,
    );
  }
  if (!Array.isArray(value.steps)) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.steps 값이 배열이 아니에요.`);
  }
  if (value.steps.length > WALKTHROUGH_TIMELINE_LIMITS.stepsPerParty) {
    throw new InvalidWalkthroughTimelineDocumentError(
      `${path}.steps는 ${WALKTHROUGH_TIMELINE_LIMITS.stepsPerParty}개를 넘을 수 없어요.`,
    );
  }
  value.steps.forEach((step, index) => {
    assertStep(step, `${path}.steps[${index}]`);
  });
}

export function parseWalkthroughTimelineDocument(value: unknown): WalkthroughTimelineDocument {
  if (!isObject(value) || value.type !== "walkthrough_timeline") {
    throw new InvalidWalkthroughTimelineDocumentError("walkthrough_timeline 문서가 아니에요.");
  }
  if (value.schemaVersion !== WALKTHROUGH_TIMELINE_SCHEMA_VERSION) {
    throw new InvalidWalkthroughTimelineDocumentError(
      `지원하지 않는 schemaVersion이에요: ${String(value.schemaVersion)}`,
    );
  }
  if (value.partySize !== 6 && value.partySize !== 10) {
    throw new InvalidWalkthroughTimelineDocumentError("partySize 값은 6 또는 10이어야 해요.");
  }
  const partySize = value.partySize;
  if (!isObject(value.context)) {
    throw new InvalidWalkthroughTimelineDocumentError("context 값이 올바르지 않아요.");
  }
  assertString(value.context.bossUid, "context.bossUid");
  if (!WALKTHROUGH_TIMELINE_TERRAINS.includes(value.context.terrain as WalkthroughTimelineTerrain)) {
    throw new InvalidWalkthroughTimelineDocumentError("context.terrain 값이 지원되지 않아요.");
  }
  if (!WALKTHROUGH_TIMELINE_DEFENSE_TYPES.includes(value.context.defenseType as WalkthroughTimelineDefenseType)) {
    throw new InvalidWalkthroughTimelineDocumentError("context.defenseType 값이 지원되지 않아요.");
  }
  if (!WALKTHROUGH_TIMELINE_DIFFICULTIES.includes(value.context.maxDifficulty as WalkthroughTimelineDifficulty)) {
    throw new InvalidWalkthroughTimelineDocumentError("context.maxDifficulty 값이 지원되지 않아요.");
  }
  if (!Array.isArray(value.parties)) {
    throw new InvalidWalkthroughTimelineDocumentError("parties 값이 배열이 아니에요.");
  }
  if (value.parties.length > WALKTHROUGH_TIMELINE_LIMITS.parties) {
    throw new InvalidWalkthroughTimelineDocumentError(
      `parties는 ${WALKTHROUGH_TIMELINE_LIMITS.parties}개를 넘을 수 없어요.`,
    );
  }
  value.parties.forEach((party, index) => {
    assertParty(party, `parties[${index}]`, partySize);
  });
  return value as WalkthroughTimelineDocument;
}

export function createEmptyWalkthroughTimelineDocument(
  context: WalkthroughTimelineDocument["context"],
  partySize: WalkthroughTimelineDocument["partySize"] = 6,
): WalkthroughTimelineDocument {
  return {
    type: "walkthrough_timeline",
    schemaVersion: WALKTHROUGH_TIMELINE_SCHEMA_VERSION,
    partySize,
    context,
    parties: [],
  };
}
