import { describe, expect, it } from "@jest/globals";
import {
  API_MAX_BOND_EXP,
  ApiInputError,
  type ApiStudentStateValues,
  apiStudentStateFields,
  getApiTierFields,
  getInternalTier,
  isApiStudentStateNoop,
  mergeAndValidateApiStudentState,
  parseApiStudentStatePatch,
  parseApiStudentStateRegistration,
  toApiStudentState,
} from "~/domain/mollulog-api";
import {
  API_PUBLIC_ERRORS,
  API_ROUTES,
  API_SCOPES,
  API_STUDENT_STATE_FIELD_SPECS,
  apiScopesInclude,
  normalizeApiScopes,
} from "~/domain/mollulog-api-spec";
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
  it("normalizes declared scopes and makes student write include student read", () => {
    expect(normalizeApiScopes(["students:write"])).toEqual(["students:read", "students:write"]);
    expect(apiScopesInclude(["students:write"], ["students:read"])).toBe(true);
    expect(apiScopesInclude(["students:read"], ["students:write"])).toBe(false);
  });

  it("checks every route against every registered scope", () => {
    const expectedScopeByRoute: Record<
      (typeof API_ROUTES)[number]["id"],
      "profile" | "students:read" | "students:write"
    > = {
      getMe: "profile",
      findStudents: "students:read",
      listRecruitedStudents: "students:read",
      getRecruitedStudent: "students:read",
      registerRecruitedStudent: "students:write",
      patchRecruitedStudent: "students:write",
      deleteRecruitedStudent: "students:write",
    };

    for (const route of API_ROUTES) {
      for (const scope of API_SCOPES) {
        const required = expectedScopeByRoute[route.id];
        const allowed = scope === required || (required === "students:read" && scope === "students:write");
        expect(apiScopesInclude([scope], route.requiredScopes)).toBe(allowed);
      }
    }
  });

  it("keeps its public field keys in sync with the single field spec", () => {
    expect(apiStudentStateFields).toEqual(Object.keys(API_STUDENT_STATE_FIELD_SPECS));
  });

  it.each(apiStudentStateFields)("validates %s at the spec boundaries", (field) => {
    const { min, max } = API_STUDENT_STATE_FIELD_SPECS[field];
    expect(parseApiStudentStatePatch({ [field]: min })).toEqual({ [field]: min });
    expect(parseApiStudentStatePatch({ [field]: max })).toEqual({ [field]: max });

    for (const value of [min - 1, max + 1]) {
      let error: unknown;
      try {
        parseApiStudentStatePatch({ [field]: value });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ApiInputError);
      const code = (error as ApiInputError).code;
      expect(code).toBe("invalid_request");
      expect(API_PUBLIC_ERRORS[code].status).toBe(400);
    }
  });

  it("uses invalid_request as the public validation code", () => {
    try {
      parseApiStudentStatePatch({ level: 91 });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiInputError);
      expect((error as ApiInputError).code).toBe("invalid_request");
    }
  });

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
