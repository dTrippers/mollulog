import { describe, expect, it } from "@jest/globals";
import {
  changedRaidFormFields,
  emptyRaidFormParty,
  fillRaidFormUnit,
  raidFormPartiesFromRecord,
  raidFormPartiesToSubmit,
  raidFormPartyStudentCount,
  refillRaidFormParty,
  setRaidFormUnitValue,
} from "~/components/v2/features/raid-records/raid-record-form-state";

const recruited = {
  aris: { tier: 9, level: 90, weaponLevel: 60 },
  hina: { tier: 7, level: 85 },
};

describe("raid record form parties", () => {
  it("round-trips a saved formation and leaves out empty parties", () => {
    const parties = raidFormPartiesFromRecord([
      {
        defenseType: "heavy",
        units: [
          { slot: 4, studentUid: "special", assist: false, snapshot: { tier: 3 } },
          { slot: 0, studentUid: "aris", assist: true, snapshot: {} },
        ],
      },
    ]);
    expect(parties[0].slots.map((unit) => unit?.studentUid ?? null)).toEqual([
      "aris",
      null,
      null,
      null,
      "special",
      null,
    ]);
    expect(parties[0].slots[0]?.baseline).toBeNull();

    expect(raidFormPartiesToSubmit([...parties, emptyRaidFormParty("elastic")])).toEqual([
      {
        defenseType: "heavy",
        units: [
          { slot: 0, studentUid: "aris", assist: true, snapshot: {} },
          { slot: 4, studentUid: "special", assist: false, snapshot: { tier: 3 } },
        ],
      },
    ]);
  });

  it("gives every party its own id", () => {
    expect(emptyRaidFormParty("heavy").id).not.toBe(emptyRaidFormParty("heavy").id);
  });

  it("counts the students of a party", () => {
    const party = emptyRaidFormParty("heavy");
    party.slots[1] = fillRaidFormUnit("aris", false, recruited);
    expect(raidFormPartyStudentCount(party)).toBe(1);
  });
});

describe("raid record form units", () => {
  it("fills a student from 모집한 학생 and leaves a 조력자 empty", () => {
    expect(fillRaidFormUnit("aris", false, recruited)).toEqual({
      studentUid: "aris",
      assist: false,
      snapshot: { tier: 9, level: 90, weaponLevel: 60 },
      baseline: { tier: 9, level: 90, weaponLevel: 60 },
    });
    expect(fillRaidFormUnit("aris", true, recruited)).toEqual({
      studentUid: "aris",
      assist: true,
      snapshot: {},
      baseline: null,
    });
    expect(fillRaidFormUnit("unknown", false, recruited)).toEqual({
      studentUid: "unknown",
      assist: false,
      snapshot: {},
      baseline: null,
    });
  });

  it("marks the values the Sensei corrected after filling", () => {
    const filled = fillRaidFormUnit("aris", false, recruited);
    const edited = setRaidFormUnitValue(setRaidFormUnitValue(filled, "level", 80), "weaponLevel", null);

    expect(edited.snapshot).toEqual({ tier: 9, level: 80 });
    expect([...changedRaidFormFields(edited)].sort()).toEqual(["level", "weaponLevel"]);
    // Editing does not change the values the slot was filled with.
    expect(filled.snapshot).toEqual({ tier: 9, level: 90, weaponLevel: 60 });
    // A slot that was not filled from 모집한 학생 in this visit marks nothing.
    expect(changedRaidFormFields({ ...edited, baseline: null }).size).toBe(0);
  });

  it("refills every non-조력자 slot with the current values", () => {
    const party = emptyRaidFormParty("heavy");
    party.slots[0] = setRaidFormUnitValue(fillRaidFormUnit("aris", false, recruited), "level", 1);
    party.slots[1] = { studentUid: "hina", assist: true, snapshot: { tier: 5 }, baseline: null };

    const refilled = refillRaidFormParty(party, recruited);
    expect(refilled.id).toBe(party.id);
    expect(refilled.slots[0]?.snapshot).toEqual({ tier: 9, level: 90, weaponLevel: 60 });
    expect(refilled.slots[1]).toEqual({ studentUid: "hina", assist: true, snapshot: { tier: 5 }, baseline: null });
  });
});
