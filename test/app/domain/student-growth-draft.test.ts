import { describe, expect, it } from "@jest/globals";
import type { StudentCalculatorState } from "~/domain/student-calculator";
import {
  createStudentGrowthDraftStorageKey,
  parseStudentGrowthDraft,
  serializeStudentGrowthDraft,
} from "~/domain/student-growth-draft";

const state: StudentCalculatorState = {
  level: 90,
  tier: 8,
  bond: 50,
  skillEx: 5,
  skillNormal: 10,
  skillEnhanced: 10,
  skillSub: 10,
  equip1: 10,
  equip2: 9,
  equip3: 8,
  equipSpecial: 2,
  weaponLevel: 50,
  abilityHp: 25,
  abilityAtk: 20,
  abilityHeal: 15,
};

describe("student growth draft", () => {
  it("separates browser storage by user and primary student", () => {
    expect(createStudentGrowthDraftStorageKey(12, "10098")).toBe("mollulog:student-growth-draft:v1:12:10098");
  });

  it("round-trips a valid calculator state", () => {
    expect(parseStudentGrowthDraft(serializeStudentGrowthDraft(state))).toEqual(state);
  });

  it("rejects malformed, outdated, or out-of-range drafts", () => {
    expect(parseStudentGrowthDraft("not-json")).toBeNull();
    expect(parseStudentGrowthDraft(JSON.stringify({ version: 2, state }))).toBeNull();
    expect(parseStudentGrowthDraft(JSON.stringify({ version: 1, state: { ...state, skillEx: 6 } }))).toBeNull();
    expect(parseStudentGrowthDraft(JSON.stringify({ version: 1, state: { ...state, level: "90" } }))).toBeNull();
  });
});
