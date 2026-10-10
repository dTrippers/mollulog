import { describe, expect, it, jest } from "@jest/globals";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));

import { setStudentStateDraftFieldPresence } from "~/domain/student-state";
import { getStudentStateDraftReviewChanges } from "~/routes/connect.import._components/StudentStateDraftReview";
import { parseStudentStateDraftFormData, parseStudentStateRequestMode } from "~/routes/connect.import.$draftUid";

const existing = {
  current: {
    tier: 3,
    level: 90,
    weaponLevel: 0,
    skillEx: null,
    skillNormal: null,
    skillEnhanced: null,
    skillSub: null,
    equip1: null,
    equip2: null,
    equip3: null,
    equipSpecial: null,
    abilityHp: null,
    abilityAtk: null,
    abilityHeal: null,
    bond: null,
  },
  target: {
    targetLevel: null,
    targetTier: null,
    targetWeaponLevel: null,
    targetSkillEx: null,
    targetSkillNormal: null,
    targetSkillEnhanced: null,
    targetSkillSub: null,
    targetEquip1: null,
    targetEquip2: null,
    targetEquip3: null,
    targetEquipSpecial: null,
    targetAbilityHp: null,
    targetAbilityAtk: null,
    targetAbilityHeal: null,
    targetBond: null,
  },
};

function formWithCurrentSection(hasCurrent: string) {
  const form = new FormData();
  form.set("studentState:entry-a:hasCurrent", hasCurrent);
  form.set("studentState:entry-a:hasTarget", "0");
  form.set("studentState:entry-a:current:tier", "3");
  form.set("studentState:entry-a:current:level", "");
  return form;
}

function draft() {
  return { entries: [{ uid: "entry-a", entryKey: "student-a" }] } as never;
}

describe("student-state draft review modes", () => {
  it("shows and submits an explicit current-field clear in nullable mode", () => {
    const value = setStudentStateDraftFieldPresence(
      { current: { ...existing.current, level: null }, target: null },
      { current: ["tier", "level"], target: [] },
    );
    const changes = getStudentStateDraftReviewChanges(value, existing, { initialTier: 3, hasGear: true }, "nullable");

    expect(changes.currentIsUpdate).toBe(true);
    expect(changes.submittedCurrent?.level).toBeNull();
    expect(changes.submittedCurrent?.providedFields).toEqual(["level"]);
    const form = formWithCurrentSection("1");
    form.set("studentState:entry-a:current:tier", String(changes.submittedCurrent?.tier));
    form.set("studentState:entry-a:current:level", "");
    form.set("studentState:entry-a:current:providedFields", changes.submittedCurrent?.providedFields?.join(",") ?? "");
    const parsed = parseStudentStateDraftFormData(draft(), form);
    expect(parsed.entries[0]?.valueJson).toContain('"level":null');
    expect(parsed.entries[0]?.valueJson).toContain('"providedFields":{"current":["level"]');
  });

  it("keeps old 1-2 section flags and infers provided non-null fields when presence is absent", () => {
    const parsed = parseStudentStateDraftFormData(draft(), formWithCurrentSection("1"));
    const value = JSON.parse(parsed.entries[0]?.valueJson ?? "{}") as {
      providedFields: { current: string[] };
    };

    expect(value.providedFields.current).toEqual(["tier"]);
    expect(formWithCurrentSection("1").get("studentState:entry-a:hasCurrent")).toBe("1");
  });

  it("treats a review form without its rendered mode as a legacy request", () => {
    const nullableForm = formWithCurrentSection("1");
    nullableForm.set("stateFormat", "nullable");

    expect(parseStudentStateRequestMode(nullableForm)).toBe("nullable");
    expect(parseStudentStateRequestMode(formWithCurrentSection("1"))).toBe("legacy");
  });
});
