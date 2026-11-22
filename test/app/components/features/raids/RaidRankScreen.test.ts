import { describe, expect, it } from "@jest/globals";
import type { RaidRankFilterState } from "~/components/features/raids/RaidRankFilter";
import { buildRaidRankApiFilter } from "~/components/features/raids/RaidRankScreen";
import type { RaidPartyStudentMap } from "~/components/features/raids/toRaidPartyRow";
import {
  buildRaidPartyStudentMap,
  isRepresentativeStudent,
  toRaidPartyRow,
} from "~/components/features/raids/toRaidPartyRow";
import { Attack, Defense } from "~/graphql/graphql";

const allStudents: RaidPartyStudentMap = {
  owned: { name: "보유 학생", attackType: Attack.Explosive, defenseType: Defense.Light, role: "striker" },
  unowned: { name: "미보유 학생", attackType: Attack.Explosive, defenseType: Defense.Light, role: "striker" },
};

const baseState: RaidRankFilterState = {
  filterNotOwned: false,
  allowBorrowedStudent: false,
  exactParties: [],
  includeStudents: [],
  excludeStudents: [],
  difficulty: null,
};

describe("rank API filter conversion", () => {
  it("marks only automatic unowned exclusions borrowable in assist mode", () => {
    const apiFilter = buildRaidRankApiFilter({
      filterState: {
        ...baseState,
        filterNotOwned: true,
        allowBorrowedStudent: true,
        excludeStudents: [{ uid: "unowned", tiers: [] }],
      },
      allStudents,
      recruitedStudentTiers: { owned: 5 },
      signedIn: true,
    });

    expect(apiFilter.excludeStudents).toEqual([{ uid: "unowned", tiers: [] }]);
    expect(apiFilter.maxBorrowedSlots).toBe(1);
    expect(apiFilter.showUnrecruitedStudents).toBe(true);
  });

  it("adds borrowable coverage for unowned students with tier-specific manual exclusions", () => {
    const apiFilter = buildRaidRankApiFilter({
      filterState: {
        ...baseState,
        filterNotOwned: true,
        allowBorrowedStudent: true,
        excludeStudents: [{ uid: "manual", tiers: [9] }],
      },
      allStudents: { ...allStudents, manual: allStudents.unowned },
      recruitedStudentTiers: { owned: 5 },
      signedIn: true,
    });

    expect(apiFilter.excludeStudents).toEqual([
      { uid: "manual", tiers: [[5, 4]] },
      { uid: "unowned", tiers: [], borrowable: true },
      { uid: "manual", tiers: [], borrowable: true },
    ]);
    expect(apiFilter.maxBorrowedSlots).toBe(1);
  });

  it("does not add borrowable coverage for an all-tier manual exclusion", () => {
    const apiFilter = buildRaidRankApiFilter({
      filterState: {
        ...baseState,
        filterNotOwned: true,
        allowBorrowedStudent: true,
        excludeStudents: [{ uid: "manual", tiers: [] }],
      },
      allStudents: { owned: allStudents.owned, manual: allStudents.unowned },
      recruitedStudentTiers: { owned: 5 },
      signedIn: true,
    });

    expect(apiFilter.excludeStudents).toEqual([{ uid: "manual", tiers: [] }]);
    expect(apiFilter.maxBorrowedSlots).toBe(1);
  });

  it("keeps the request shape unchanged when assist mode is off", () => {
    const apiFilter = buildRaidRankApiFilter({
      filterState: {
        ...baseState,
        filterNotOwned: true,
        excludeStudents: [{ uid: "manual", tiers: [9] }],
      },
      allStudents: { ...allStudents, manual: allStudents.unowned },
      recruitedStudentTiers: { owned: 5 },
      signedIn: true,
    });

    expect(apiFilter.excludeStudents).toEqual([
      { uid: "manual", tiers: [[5, 4]] },
      { uid: "unowned", tiers: [] },
    ]);
    expect(apiFilter).not.toHaveProperty("maxBorrowedSlots");
    expect(apiFilter.showUnrecruitedStudents).toBe(false);
  });

  it("does not apply saved ownership options for guests", () => {
    const apiFilter = buildRaidRankApiFilter({
      filterState: { ...baseState, filterNotOwned: true, allowBorrowedStudent: true },
      allStudents,
      recruitedStudentTiers: {},
      signedIn: false,
    });

    expect(apiFilter.excludeStudents).toEqual([]);
    expect(apiFilter).not.toHaveProperty("maxBorrowedSlots");
    expect(apiFilter.showUnrecruitedStudents).toBe(false);
  });

  it("marks an unowned rank slot only when borrow mode enables unrecruited display", () => {
    const party = {
      partyIndex: 0,
      slots: [
        {
          slotIndex: 0,
          tier: 5,
          level: 85,
          isAssist: false,
          startingSkillOrder: 2,
          studentUid: "unowned",
        },
      ],
    };

    const borrowedRow = toRaidPartyRow({
      party,
      allStudents,
      maxLevel: 90,
      recruitedStudentTiers: { owned: 5 },
      showUnrecruitedStudents: true,
    });
    const regularRow = toRaidPartyRow({ party, allStudents, maxLevel: 90 });

    expect(borrowedRow.slots[0]).toMatchObject({ grayscale: true, unrecruited: true, startingSkillOrder: 2 });
    expect(regularRow.slots[0]).toMatchObject({ grayscale: false, unrecruited: false, startingSkillOrder: 2 });
  });
});

describe("multi-form students in rank parties", () => {
  const swimsuitShun = {
    name: "슌(수영복)",
    attackType: Attack.Sonic,
    defenseType: Defense.Light,
    role: "striker" as const,
  };
  const formStudents = buildRaidPartyStudentMap(
    { "10143": swimsuitShun, owned: allStudents.owned },
    {
      "10143": { ...swimsuitShun, primaryUid: "10143", formIndex: 1 },
      "10144": { ...swimsuitShun, name: "슈에링(수영복)", primaryUid: "10143", formIndex: 2 },
    },
  );
  const party = (studentUid: string) => ({
    partyIndex: 0,
    slots: [{ slotIndex: 0, tier: 8, level: 90, isAssist: false, startingSkillOrder: null, studentUid }],
  });

  it("shows the deployed form's name and form number", () => {
    const row = toRaidPartyRow({ party: party("10144"), allStudents: formStudents, maxLevel: 90 });

    expect(row.slots[0]).toMatchObject({ uid: "10144", name: "슈에링(수영복)", formIndex: 2 });
    expect(toRaidPartyRow({ party: party("10143"), allStudents: formStudents, maxLevel: 90 }).slots[0]).toMatchObject({
      name: "슌(수영복)",
      formIndex: 1,
    });
    expect(toRaidPartyRow({ party: party("owned"), allStudents: formStudents, maxLevel: 90 }).slots[0]).toMatchObject({
      formIndex: undefined,
    });
  });

  it("judges ownership of every form by the representative student", () => {
    const owned = toRaidPartyRow({
      party: party("10144"),
      allStudents: formStudents,
      maxLevel: 90,
      recruitedStudentTiers: { "10143": 5 },
      showUnrecruitedStudents: true,
    });
    const unowned = toRaidPartyRow({
      party: party("10144"),
      allStudents: formStudents,
      maxLevel: 90,
      recruitedStudentTiers: { owned: 5 },
      showUnrecruitedStudents: true,
    });

    expect(owned.slots[0]).toMatchObject({ unrecruited: false });
    expect(unowned.slots[0]).toMatchObject({ unrecruited: true });
  });

  it("excludes other forms only when the representative student is not owned", () => {
    const filterFor = (recruitedStudentTiers: Record<string, number>) =>
      buildRaidRankApiFilter({
        filterState: { ...baseState, filterNotOwned: true },
        allStudents: formStudents,
        recruitedStudentTiers,
        signedIn: true,
      }).excludeStudents.map(({ uid }) => uid);

    expect(filterFor({ owned: 5, "10143": 5 })).toEqual([]);
    expect(filterFor({ owned: 5 })).toEqual(["10143", "10144"]);
  });

  it("keeps statistics on the representative student only", () => {
    expect(isRepresentativeStudent("10143", formStudents["10143"])).toBe(true);
    expect(isRepresentativeStudent("10144", formStudents["10144"])).toBe(false);
    expect(isRepresentativeStudent("owned", formStudents.owned)).toBe(true);
    expect(isRepresentativeStudent("missing", formStudents.missing)).toBe(false);
  });
});
