import type { StudentCalculatorState } from "./student-calculator";

const STUDENT_GROWTH_DRAFT_VERSION = 1;
const STUDENT_GROWTH_DRAFT_STORAGE_PREFIX = "mollulog:student-growth-draft";
const EQUIPMENT_LEVEL_MAX_LEVEL = 70;

const stateRanges = {
  level: { min: 1, max: 90 },
  tier: { min: 1, max: 9 },
  bond: { min: 1, max: 100 },
  skillEx: { min: 1, max: 5 },
  skillNormal: { min: 1, max: 10 },
  skillEnhanced: { min: 1, max: 10 },
  skillSub: { min: 1, max: 10 },
  equip1: { min: 1, max: 10 },
  equip2: { min: 1, max: 10 },
  equip3: { min: 1, max: 10 },
  equip1Level: { min: 1, max: EQUIPMENT_LEVEL_MAX_LEVEL },
  equip2Level: { min: 1, max: EQUIPMENT_LEVEL_MAX_LEVEL },
  equip3Level: { min: 1, max: EQUIPMENT_LEVEL_MAX_LEVEL },
  equipSpecial: { min: 0, max: 2 },
  weaponLevel: { min: 0, max: 60 },
  abilityHp: { min: 0, max: 25 },
  abilityAtk: { min: 0, max: 25 },
  abilityHeal: { min: 0, max: 25 },
} as const satisfies Record<keyof StudentCalculatorState, { min: number; max: number }>;

type StudentGrowthDraft = {
  version: typeof STUDENT_GROWTH_DRAFT_VERSION;
  state: StudentCalculatorState;
};

export function createStudentGrowthDraftStorageKey(userId: number, studentUid: string) {
  return `${STUDENT_GROWTH_DRAFT_STORAGE_PREFIX}:v${STUDENT_GROWTH_DRAFT_VERSION}:${userId}:${studentUid}`;
}

export function serializeStudentGrowthDraft(state: StudentCalculatorState) {
  return JSON.stringify({ version: STUDENT_GROWTH_DRAFT_VERSION, state } satisfies StudentGrowthDraft);
}

export function parseStudentGrowthDraft(value: string): StudentCalculatorState | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.version !== STUDENT_GROWTH_DRAFT_VERSION || !isRecord(parsed.state)) {
      return null;
    }

    const state = {} as StudentCalculatorState;
    for (const [key, range] of Object.entries(stateRanges) as [
      keyof StudentCalculatorState,
      { min: number; max: number },
    ][]) {
      const fieldValue = parsed.state[key];
      if (fieldValue === undefined && (key === "equip1Level" || key === "equip2Level" || key === "equip3Level")) {
        state[key] = null;
        continue;
      }
      if (fieldValue !== null) {
        if (
          typeof fieldValue !== "number" ||
          !Number.isInteger(fieldValue) ||
          fieldValue < range.min ||
          fieldValue > range.max
        ) {
          return null;
        }
      }
      state[key] = fieldValue;
    }
    return state;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
