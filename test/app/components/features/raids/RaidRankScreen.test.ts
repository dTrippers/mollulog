import { describe, expect, it } from "@jest/globals";
import type { RaidRankFilterState } from "~/components/features/raids/RaidRankFilter";
import { buildRaidRankApiFilter } from "~/components/features/raids/RaidRankScreen";
import type { RaidPartyStudentMap } from "~/components/features/raids/toRaidPartyRow";
import { toRaidPartyRow } from "~/components/features/raids/toRaidPartyRow";
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

  it("adds other unowned students as borrowable while preserving manual excludes", () => {
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
    ]);
    expect(apiFilter.maxBorrowedSlots).toBe(1);
  });

  it("keeps the request shape unchanged when assist mode is off", () => {
    const apiFilter = buildRaidRankApiFilter({
      filterState: { ...baseState, filterNotOwned: true },
      allStudents,
      recruitedStudentTiers: { owned: 5 },
      signedIn: true,
    });

    expect(apiFilter.excludeStudents).toEqual([{ uid: "unowned", tiers: [] }]);
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
