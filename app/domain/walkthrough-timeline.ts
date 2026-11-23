import type { GuideBody } from "./guide-body";

export const LEGACY_WALKTHROUGH_TIMELINE_SCHEMA_VERSION = 1 as const;
export const WALKTHROUGH_TIMELINE_SCHEMA_VERSION = 2 as const;
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
  body: GuideBody | null;
  visibility: WalkthroughTimelineVisibility;
  isAuto: boolean;
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

function assertParty(
  value: unknown,
  path: string,
  partySize: 6 | 10,
  schemaVersion: typeof LEGACY_WALKTHROUGH_TIMELINE_SCHEMA_VERSION | typeof WALKTHROUGH_TIMELINE_SCHEMA_VERSION,
): asserts value is WalkthroughParty {
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
  const maximumStartingSkills = schemaVersion === LEGACY_WALKTHROUGH_TIMELINE_SCHEMA_VERSION ? 3 : partySize - 1;
  if (value.startingSkillStudentUids.length > maximumStartingSkills) {
    throw new InvalidWalkthroughTimelineDocumentError(
      `${path}.startingSkillStudentUids는 ${maximumStartingSkills}개를 넘을 수 없어요.`,
    );
  }
  if (new Set(value.startingSkillStudentUids).size !== value.startingSkillStudentUids.length) {
    throw new InvalidWalkthroughTimelineDocumentError(`${path}.startingSkillStudentUids에 중복된 학생이 있어요.`);
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
  if (
    value.schemaVersion !== LEGACY_WALKTHROUGH_TIMELINE_SCHEMA_VERSION &&
    value.schemaVersion !== WALKTHROUGH_TIMELINE_SCHEMA_VERSION
  ) {
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
    assertParty(party, `parties[${index}]`, partySize, value.schemaVersion as 1 | 2);
  });

  if (value.schemaVersion === LEGACY_WALKTHROUGH_TIMELINE_SCHEMA_VERSION) {
    const parties = (value.parties as WalkthroughParty[]).map((party) => {
      const slotByStudentUid = new Map(
        party.units.flatMap((unit) => (unit.studentUid ? [[unit.studentUid, unit.slot] as const] : [])),
      );
      return {
        ...party,
        startingSkillStudentUids: [...party.startingSkillStudentUids].sort(
          (left, right) =>
            (slotByStudentUid.get(left) ?? Number.MAX_SAFE_INTEGER) -
            (slotByStudentUid.get(right) ?? Number.MAX_SAFE_INTEGER),
        ),
      };
    });
    return { ...value, schemaVersion: WALKTHROUGH_TIMELINE_SCHEMA_VERSION, parties } as WalkthroughTimelineDocument;
  }

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

// Strikers fill the front slots: four of a six-student party and six of a ten-student party.
export function walkthroughStrikerSlotCount(partySize: WalkthroughTimelineDocument["partySize"]): number {
  return partySize === 10 ? 6 : 4;
}

export function isWalkthroughStrikerSlot(slot: number, partySize: WalkthroughTimelineDocument["partySize"]): boolean {
  return slot < walkthroughStrikerSlotCount(partySize);
}

// A party can start with at most one student fewer than it has.
export function walkthroughStartingSkillLimit(partySize: WalkthroughTimelineDocument["partySize"]): number {
  return partySize - 1;
}

export type WalkthroughSaveProblem =
  | { field: "title" }
  | { field: "boss" }
  | { field: "parties" }
  | { field: "party"; partyIndex: number; reason: "empty" | "no_striker" | "no_tier" }
  | { field: "step"; partyIndex: number; stepIndex: number; reason: "no_action" | "empty_text" };

// What keeps a guide from being saved: a title, a boss, and at least one party, where every party has a striker. The
// growth values, the starting skill order, and the timeline are optional, but a timeline step needs at least one skill,
// and a skill without a student needs its text.
export function walkthroughSaveProblems(input: {
  title: string;
  document: Pick<WalkthroughTimelineDocument, "partySize" | "context" | "parties">;
}): WalkthroughSaveProblem[] {
  const problems: WalkthroughSaveProblem[] = [];
  if (!input.title.trim()) problems.push({ field: "title" });
  if (!input.document.context.bossUid.trim()) problems.push({ field: "boss" });
  if (input.document.parties.length === 0) problems.push({ field: "parties" });
  input.document.parties.forEach((party, partyIndex) => {
    const filled = party.units.filter((unit) => unit.studentUid);
    if (filled.length === 0) {
      problems.push({ field: "party", partyIndex, reason: "empty" });
    } else if (!filled.some((unit) => isWalkthroughStrikerSlot(unit.slot, input.document.partySize))) {
      problems.push({ field: "party", partyIndex, reason: "no_striker" });
    }
    // 성급 is the one growth value a guide requires.
    if (filled.some((unit) => unit.snapshot?.tier === undefined)) {
      problems.push({ field: "party", partyIndex, reason: "no_tier" });
    }
    party.steps.forEach((step, stepIndex) => {
      if (step.kind !== "actions") return;
      if (step.actions.length === 0) {
        problems.push({ field: "step", partyIndex, stepIndex, reason: "no_action" });
      } else if (step.actions.some((action) => !action.studentUid && !action.text?.trim())) {
        problems.push({ field: "step", partyIndex, stepIndex, reason: "empty_text" });
      }
    });
  });
  return problems;
}

export function walkthroughSaveProblemMessage(problem: WalkthroughSaveProblem): string {
  switch (problem.field) {
    case "title":
      return "제목을 입력해 주세요.";
    case "boss":
      return "보스를 선택해 주세요.";
    case "parties":
      return "파티를 추가해 주세요.";
    case "party":
      if (problem.reason === "empty") return `파티 ${problem.partyIndex + 1}에 학생을 편성해 주세요.`;
      if (problem.reason === "no_striker")
        return `파티 ${problem.partyIndex + 1}에 스트라이커를 1명 이상 편성해 주세요.`;
      return `파티 ${problem.partyIndex + 1} 학생의 성급을 모두 입력해 주세요.`;
    case "step":
      return problem.reason === "no_action"
        ? `파티 ${problem.partyIndex + 1} 타임라인 ${problem.stepIndex + 1}단계에 스킬을 추가해 주세요.`
        : `파티 ${problem.partyIndex + 1} 타임라인 ${problem.stepIndex + 1}단계의 빈 내용을 채우거나 지워 주세요.`;
  }
}

// Adds a student to the end of the starting skill order, or takes them out of it. The order is full at the limit.
export function toggleStartingSkillStudentUid(order: readonly string[], studentUid: string, limit: number): string[] {
  if (order.includes(studentUid)) return order.filter((uid) => uid !== studentUid);
  if (order.length >= limit) return [...order];
  return [...order, studentUid];
}

// Moves a party between the six-student and ten-student layouts when the boss changes. Strikers keep their slots;
// specials move with the striker count, and students that no longer fit are dropped along with their starting skill.
export function resizeWalkthroughParty(
  party: WalkthroughParty,
  currentSize: WalkthroughTimelineDocument["partySize"],
  size: WalkthroughTimelineDocument["partySize"],
): WalkthroughParty {
  if (currentSize === size) return party;
  const remappedUnits = party.units.flatMap((unit) => {
    if (size === 10) {
      return [{ ...unit, slot: unit.slot < 4 ? unit.slot : unit.slot + 2 }];
    }
    if (unit.slot < 4) return [unit];
    if (unit.slot >= 6 && unit.slot < 8) return [{ ...unit, slot: unit.slot - 2 }];
    return [];
  });
  const selectedStudentUids = new Set(remappedUnits.flatMap((unit) => unit.studentUid ?? []));
  return {
    ...party,
    units: remappedUnits,
    startingSkillStudentUids: party.startingSkillStudentUids
      .filter((uid) => selectedStudentUids.has(uid))
      .slice(0, walkthroughStartingSkillLimit(size)),
  };
}
