import { describe, expect, it } from "@jest/globals";
import {
  API_MAX_BOND_EXP,
  ApiInputError,
  type ApiStudentStateValues,
  getApiTierFields,
  getInternalTier,
  isApiStudentStateNoop,
  mergeAndValidateApiStudentState,
  parseApiStudentStatePatch,
  parseApiStudentStateRegistration,
  toApiStudentState,
} from "~/domain/mollulog-api";
import { getAccumulatedRelationshipExpForLevel } from "~/domain/relationship-level";

const emptyState: ApiStudentStateValues = {
  tier: null,
  level: null,
  skillEx: null,
  skillNormal: null,
  skillEnhanced: null,
  skillSub: null,
  equip1: null,
  equip2: null,
  equip3: null,
  equip1Level: null,
  equip2Level: null,
  equip3Level: null,
  equipSpecial: null,
  weaponLevel: null,
  abilityHp: null,
  abilityAtk: null,
  abilityHeal: null,
  bond: null,
  bondExp: null,
};

describe("mollulog-api domain", () => {
  it("requires both public tier fields on registration and maps them to canonical combined tier", () => {
    const parsed = parseApiStudentStateRegistration({ studentUid: " 20048 ", tier: 5, weaponTier: 3 });

    expect(parsed).toEqual({ studentUid: "20048", state: { tier: 5, weaponTier: 3 } });
    expect(getInternalTier(parsed.state.tier ?? 0, parsed.state.weaponTier ?? -1)).toBe(8);
    expect(getApiTierFields(8)).toEqual({ tier: 5, weaponTier: 3 });
    expect(() => parseApiStudentStateRegistration({ studentUid: "20048", tier: 4 })).toThrow(ApiInputError);
  });

  it("rejects weapon tiers unless the public student tier is five", () => {
    expect(() => getInternalTier(4, 1)).toThrow(ApiInputError);
  });

  it("supports omitted fields and explicit nulls while rejecting bad field values", () => {
    expect(parseApiStudentStatePatch({ level: null, skillEx: 5 })).toEqual({ level: null, skillEx: 5 });
    expect(() => parseApiStudentStatePatch({ level: 91 })).toThrow(ApiInputError);
    expect(() => parseApiStudentStatePatch({ internalId: 1 })).toThrow(ApiInputError);
  });

  it("merges partial tier updates against the canonical stored combined tier", () => {
    expect(toApiStudentState(mergeAndValidateApiStudentState({ ...emptyState, tier: 8 }, { weaponTier: 4 }))).toEqual(
      expect.objectContaining({ tier: 5, weaponTier: 4 }),
    );
    expect(toApiStudentState(mergeAndValidateApiStudentState({ ...emptyState, tier: 8 }, { tier: 5 }))).toEqual(
      expect.objectContaining({ tier: 5, weaponTier: 3 }),
    );
  });

  it("clears relationship experience when the final rank no longer matches it", () => {
    const accumulatedAtTwenty = getAccumulatedRelationshipExpForLevel(20);
    const merged = mergeAndValidateApiStudentState(
      { ...emptyState, tier: 5, bond: 20, bondExp: accumulatedAtTwenty },
      { bond: 21 },
    );

    expect(merged.bondExp).toBeNull();
    expect(API_MAX_BOND_EXP).toBeGreaterThan(accumulatedAtTwenty);
  });

  it("clears out-of-range stored relationship experience and rejects invalid new experience", () => {
    const merged = mergeAndValidateApiStudentState(
      { ...emptyState, tier: 5, bond: 100, bondExp: API_MAX_BOND_EXP + 1 },
      { level: 1 },
    );

    expect(merged.bondExp).toBeNull();
    expect(() => parseApiStudentStatePatch({ bondExp: API_MAX_BOND_EXP + 1 })).toThrow(ApiInputError);
  });

  it("maps growth constraints to field-specific client errors", () => {
    expect(() =>
      mergeAndValidateApiStudentState({ ...emptyState, tier: 5, weaponLevel: 20 }, { weaponTier: 0 }),
    ).toThrow(ApiInputError);
    try {
      mergeAndValidateApiStudentState({ ...emptyState, tier: 5, weaponLevel: 20 }, { weaponTier: 0 });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiInputError);
      expect((error as ApiInputError).fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "weaponLevel" })]),
      );
    }
  });

  it("treats equal API representations as no-op even though storage combines the tiers", () => {
    const before = { ...emptyState, tier: 8 };
    const after = { ...emptyState, tier: 8 };

    expect(isApiStudentStateNoop(before, after)).toBe(true);
    expect(isApiStudentStateNoop(before, { ...after, level: 1 })).toBe(false);
  });
});
