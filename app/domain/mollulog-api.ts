import { getAccumulatedRelationshipExpForLevel } from "~/domain/relationship-level";
import {
  ABILITY_RELEASE_MAX_LEVEL,
  assertAbilityReleaseAvailable,
  assertWeaponLevelRange,
  WEAPON_LEVEL_MAX_LEVEL,
} from "~/domain/student-growth-state";

export const API_STUDENT_PAGE_SIZE = 50;
export const API_STUDENT_PAGE_SIZE_MAX = 100;
export const API_MAX_REQUEST_BYTES = 1024 * 1024;
export const API_MAX_BOND_EXP = getAccumulatedRelationshipExpForLevel(100);

export const apiStudentStateFields = [
  "tier",
  "weaponTier",
  "level",
  "skillEx",
  "skillNormal",
  "skillEnhanced",
  "skillSub",
  "equip1",
  "equip2",
  "equip3",
  "equip1Level",
  "equip2Level",
  "equip3Level",
  "equipSpecial",
  "weaponLevel",
  "abilityHp",
  "abilityAtk",
  "abilityHeal",
  "bond",
  "bondExp",
] as const;

export type ApiStudentStateField = (typeof apiStudentStateFields)[number];
export type ApiNullableStudentStateField = Exclude<ApiStudentStateField, "tier" | "weaponTier">;

export type ApiStudentState = {
  tier: number;
  weaponTier: number;
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equip1Level: number | null;
  equip2Level: number | null;
  equip3Level: number | null;
  equipSpecial: number | null;
  weaponLevel: number | null;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
  bond: number | null;
  bondExp: number | null;
};

export type ApiStudentStatePatch = Partial<ApiStudentState>;

export type ApiStudentStateValues = Omit<ApiStudentState, "tier" | "weaponTier"> & {
  tier: number | null;
};

export type ApiFieldError = { field: string; message: string };

export class ApiInputError extends Error {
  readonly code = "invalid_input";
  readonly fields: ApiFieldError[];

  constructor(message: string, fields: ApiFieldError[] = []) {
    super(message);
    this.name = "ApiInputError";
    this.fields = fields;
  }
}

const nullableFieldRanges: Partial<Record<ApiNullableStudentStateField, { min: number; max: number }>> = {
  level: { min: 1, max: 90 },
  skillEx: { min: 1, max: 5 },
  skillNormal: { min: 1, max: 10 },
  skillEnhanced: { min: 1, max: 10 },
  skillSub: { min: 1, max: 10 },
  equip1: { min: 1, max: 10 },
  equip2: { min: 1, max: 10 },
  equip3: { min: 1, max: 10 },
  equip1Level: { min: 1, max: 70 },
  equip2Level: { min: 1, max: 70 },
  equip3Level: { min: 1, max: 70 },
  equipSpecial: { min: 1, max: 2 },
  weaponLevel: { min: 0, max: WEAPON_LEVEL_MAX_LEVEL },
  abilityHp: { min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  abilityAtk: { min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  abilityHeal: { min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  bond: { min: 1, max: 100 },
  bondExp: { min: 0, max: API_MAX_BOND_EXP },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInteger(value: unknown, field: string, nullable: boolean): number | null {
  if (value === null && nullable) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new ApiInputError("요청 필드의 형식이 올바르지 않아요", [
      { field, message: nullable ? "정수 또는 null을 보내주세요" : "정수를 보내주세요" },
    ]);
  }
  return value;
}

function parseTierFields(
  input: Record<string, unknown>,
  required: boolean,
): Pick<ApiStudentStatePatch, "tier" | "weaponTier"> {
  const hasTier = Object.hasOwn(input, "tier");
  const hasWeaponTier = Object.hasOwn(input, "weaponTier");
  if (required && (!hasTier || !hasWeaponTier)) {
    const missing = [!hasTier ? "tier" : null, !hasWeaponTier ? "weaponTier" : null].filter(
      (field): field is string => field != null,
    );
    throw new ApiInputError(
      "학생 성급과 고유무기 성급을 보내주세요",
      missing.map((field) => ({
        field,
        message: "등록할 때 필요해요",
      })),
    );
  }

  const parsed: Pick<ApiStudentStatePatch, "tier" | "weaponTier"> = {};
  if (hasTier) {
    const tier = parseInteger(input.tier, "tier", false) as number;
    if (tier < 1 || tier > 5) {
      throw new ApiInputError("학생 성급은 1부터 5 사이여야 해요", [
        { field: "tier", message: "1부터 5 사이의 정수를 보내주세요" },
      ]);
    }
    parsed.tier = tier;
  }
  if (hasWeaponTier) {
    const weaponTier = parseInteger(input.weaponTier, "weaponTier", false) as number;
    if (weaponTier < 0 || weaponTier > 4) {
      throw new ApiInputError("고유무기 성급은 0부터 4 사이여야 해요", [
        { field: "weaponTier", message: "0부터 4 사이의 정수를 보내주세요" },
      ]);
    }
    parsed.weaponTier = weaponTier;
  }
  return parsed;
}

function assertKnownFields(input: Record<string, unknown>, accepted: readonly string[]) {
  const acceptedSet = new Set(accepted);
  const unknown = Object.keys(input).filter((field) => !acceptedSet.has(field));
  if (unknown.length > 0) {
    throw new ApiInputError(
      "요청에 알 수 없는 필드가 있어요",
      unknown.map((field) => ({
        field,
        message: "지원하지 않는 필드예요",
      })),
    );
  }
}

function parseNullableFields(input: Record<string, unknown>): Partial<ApiStudentStatePatch> {
  const result: Partial<ApiStudentStatePatch> = {};
  for (const field of apiStudentStateFields) {
    if (field === "tier" || field === "weaponTier" || !Object.hasOwn(input, field)) continue;
    const parsed = parseInteger(input[field], field, true);
    const range = nullableFieldRanges[field];
    if (parsed !== null && range && (parsed < range.min || parsed > range.max)) {
      throw new ApiInputError(`${field} 값이 허용 범위를 벗어났어요`, [
        { field, message: `${range.min}부터 ${range.max} 사이의 정수를 보내주세요` },
      ]);
    }
    result[field] = parsed;
  }
  return result;
}

export function parseApiStudentStateRegistration(input: unknown): {
  studentUid: string;
  state: ApiStudentStatePatch;
} {
  if (!isRecord(input)) throw new ApiInputError("요청 본문은 객체여야 해요");
  assertKnownFields(input, ["studentUid", ...apiStudentStateFields]);
  if (typeof input.studentUid !== "string" || input.studentUid.trim().length === 0) {
    throw new ApiInputError("학생 UID를 보내주세요", [{ field: "studentUid", message: "문자열이 필요해요" }]);
  }
  return {
    studentUid: input.studentUid.trim(),
    state: { ...parseTierFields(input, true), ...parseNullableFields(input) },
  };
}

export function parseApiStudentStatePatch(input: unknown): ApiStudentStatePatch {
  if (!isRecord(input)) throw new ApiInputError("요청 본문은 객체여야 해요");
  assertKnownFields(input, apiStudentStateFields);
  if (Object.keys(input).length === 0) throw new ApiInputError("수정할 필드를 하나 이상 보내주세요");
  return { ...parseTierFields(input, false), ...parseNullableFields(input) };
}

export function getInternalTier(tier: number, weaponTier: number): number {
  if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
    throw new ApiInputError("학생 성급은 1부터 5 사이여야 해요", [
      { field: "tier", message: "1부터 5 사이의 정수를 보내주세요" },
    ]);
  }
  if (!Number.isInteger(weaponTier) || weaponTier < 0 || weaponTier > 4) {
    throw new ApiInputError("고유무기 성급은 0부터 4 사이여야 해요", [
      { field: "weaponTier", message: "0부터 4 사이의 정수를 보내주세요" },
    ]);
  }
  if (weaponTier > 0 && tier !== 5) {
    throw new ApiInputError("고유무기는 학생 성급 5에서 사용할 수 있어요", [
      { field: "weaponTier", message: "고유무기 성급이 0보다 크면 학생 성급은 5여야 해요" },
    ]);
  }
  return tier + weaponTier;
}

export function getApiTierFields(internalTier: number | null): Pick<ApiStudentState, "tier" | "weaponTier"> {
  if (internalTier == null || !Number.isInteger(internalTier) || internalTier < 1 || internalTier > 9) {
    throw new Error("Canonical student state has an invalid tier.");
  }
  return internalTier <= 5 ? { tier: internalTier, weaponTier: 0 } : { tier: 5, weaponTier: internalTier - 5 };
}

function bondExperienceMatchesLevel(bond: number | null, bondExp: number | null): boolean {
  if (bondExp === null) return true;
  if (bondExp < 0 || bondExp > API_MAX_BOND_EXP) return false;
  if (bond === null) return false;
  const floor = getAccumulatedRelationshipExpForLevel(bond);
  const ceiling = bond === 100 ? null : getAccumulatedRelationshipExpForLevel(bond + 1);
  return bondExp >= floor && (ceiling === null || bondExp < ceiling);
}

export function mergeAndValidateApiStudentState(
  existing: ApiStudentStateValues,
  patch: ApiStudentStatePatch,
  requireTier = false,
): ApiStudentStateValues {
  const hasTier = Object.hasOwn(patch, "tier");
  const hasWeaponTier = Object.hasOwn(patch, "weaponTier");
  let tier: number | null = existing.tier;

  if (hasTier || hasWeaponTier) {
    if ((hasTier && patch.tier == null) || (hasWeaponTier && patch.weaponTier == null)) {
      const fields = [
        ...(hasTier && patch.tier == null ? ["tier"] : []),
        ...(hasWeaponTier && patch.weaponTier == null ? ["weaponTier"] : []),
      ];
      throw new ApiInputError(
        "성급 필드는 null로 비울 수 없어요",
        fields.map((field) => ({
          field,
          message: "null 대신 성급 값을 보내주세요",
        })),
      );
    }
    const [nextTier, nextWeaponTier] = hasTier
      ? [patch.tier as number, (patch.weaponTier as number | undefined) ?? getApiTierFields(existing.tier).weaponTier]
      : [getApiTierFields(existing.tier).tier, patch.weaponTier as number];
    tier = getInternalTier(nextTier, nextWeaponTier);
  } else if (requireTier && tier == null) {
    throw new ApiInputError("학생 성급과 고유무기 성급을 보내주세요", [
      { field: "tier", message: "등록할 때 필요해요" },
      { field: "weaponTier", message: "등록할 때 필요해요" },
    ]);
  }

  const result: ApiStudentStateValues = {
    tier,
    level: patch.level === undefined ? existing.level : patch.level,
    skillEx: patch.skillEx === undefined ? existing.skillEx : patch.skillEx,
    skillNormal: patch.skillNormal === undefined ? existing.skillNormal : patch.skillNormal,
    skillEnhanced: patch.skillEnhanced === undefined ? existing.skillEnhanced : patch.skillEnhanced,
    skillSub: patch.skillSub === undefined ? existing.skillSub : patch.skillSub,
    equip1: patch.equip1 === undefined ? existing.equip1 : patch.equip1,
    equip2: patch.equip2 === undefined ? existing.equip2 : patch.equip2,
    equip3: patch.equip3 === undefined ? existing.equip3 : patch.equip3,
    equip1Level: patch.equip1Level === undefined ? existing.equip1Level : patch.equip1Level,
    equip2Level: patch.equip2Level === undefined ? existing.equip2Level : patch.equip2Level,
    equip3Level: patch.equip3Level === undefined ? existing.equip3Level : patch.equip3Level,
    equipSpecial: patch.equipSpecial === undefined ? existing.equipSpecial : patch.equipSpecial,
    weaponLevel: patch.weaponLevel === undefined ? existing.weaponLevel : patch.weaponLevel,
    abilityHp: patch.abilityHp === undefined ? existing.abilityHp : patch.abilityHp,
    abilityAtk: patch.abilityAtk === undefined ? existing.abilityAtk : patch.abilityAtk,
    abilityHeal: patch.abilityHeal === undefined ? existing.abilityHeal : patch.abilityHeal,
    bond: patch.bond === undefined ? existing.bond : patch.bond,
    bondExp: patch.bondExp === undefined ? existing.bondExp : patch.bondExp,
  };

  if (result.tier != null) {
    try {
      assertWeaponLevelRange(result.weaponLevel, result.tier, "고유무기 레벨");
    } catch (error) {
      throw new ApiInputError(error instanceof Error ? error.message : "고유무기 레벨이 현재 성급과 맞지 않아요", [
        { field: "weaponLevel", message: "현재 고유무기 성급에서 사용할 수 없는 레벨이에요" },
      ]);
    }
    try {
      assertAbilityReleaseAvailable(
        [result.abilityHp, result.abilityAtk, result.abilityHeal],
        result.tier,
        "능력 해방",
      );
    } catch (error) {
      throw new ApiInputError(error instanceof Error ? error.message : "능력 해방은 고유무기가 필요해요", [
        ...(["abilityHp", "abilityAtk", "abilityHeal"] as const)
          .filter((field) => (result[field] ?? 0) > 0)
          .map((field) => ({ field, message: "고유무기 장착 후 입력할 수 있어요" })),
      ]);
    }
  }

  if (!bondExperienceMatchesLevel(result.bond, result.bondExp)) {
    result.bondExp = null;
  }

  return result;
}

export function isApiStudentStateNoop(before: ApiStudentStateValues, after: ApiStudentStateValues): boolean {
  return apiStudentStateFields.every((field) => field === "weaponTier" || before[field] === after[field]);
}

export function toApiStudentState(value: ApiStudentStateValues): ApiStudentState {
  const tiers = getApiTierFields(value.tier);
  return { ...value, ...tiers };
}
