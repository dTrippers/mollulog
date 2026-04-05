import { describe, expect, it, jest } from "@jest/globals";
import { ResourceTypeEnum } from "../graphql/graphql";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

import {
  aggregateGrowthResourceRequirements,
  breakdownCharacterExpToBooks,
  calculateCharacterExpDifference,
  calculateCumulativeTierEleph,
  calculateEquipmentResourceItems,
  calculateGearResourceItems,
  calculateLevelResourceItems,
  calculateTierResourceItems,
  normalizeStudentGrowthInputForCalculation,
  sortGrowthResourceItems,
} from "./growth-resource";

describe("growth-resource", () => {
  it("calculates exact character exp difference between levels", () => {
    expect(calculateCharacterExpDifference(1, 2)).toBe(10);
    expect(calculateCharacterExpDifference(80, 90)).toBe(635355);
  });

  it("breaks character exp into the smallest report set that still covers the requirement", () => {
    expect(breakdownCharacterExpToBooks(35)).toEqual([
      {
        uid: "10",
        type: ResourceTypeEnum.Item,
        rarity: 1,
        amount: 1,
        source: "level",
      },
    ]);

    expect(breakdownCharacterExpToBooks(12340)).toEqual([
      {
        uid: "13",
        type: ResourceTypeEnum.Item,
        rarity: 4,
        amount: 2,
        source: "level",
      },
    ]);
  });

  it("calculates level resources from current to target level", () => {
    expect(calculateLevelResourceItems({ level: 1, targetLevel: 3 })).toEqual([
      {
        uid: "10",
        type: ResourceTypeEnum.Item,
        rarity: 1,
        amount: 1,
        source: "level",
      },
    ]);
  });

  it("treats missing current level as level 1 when a target level exists", () => {
    const student = normalizeStudentGrowthInputForCalculation({
      uid: "10000",
      initialTier: 3,
      tier: null,
      level: null,
      skillEx: null,
      skillNormal: null,
      skillEnhanced: null,
      skillSub: null,
      equip1: null,
      equip2: null,
      equip3: null,
      equipSpecial: null,
      targetLevel: 2,
      targetSkillEx: null,
      targetSkillNormal: null,
      targetSkillEnhanced: null,
      targetSkillSub: null,
      targetEquip1: null,
      targetEquip2: null,
      targetEquip3: null,
      targetEquipSpecial: null,
      targetTier: null,
    });

    expect(calculateLevelResourceItems(student)).toEqual([
      {
        uid: "10",
        type: ResourceTypeEnum.Item,
        rarity: 1,
        amount: 1,
        source: "level",
      },
    ]);
  });

  it("calculates T10 equipment blueprint requirements from SchaleDB recipe pattern", () => {
    expect(
      calculateEquipmentResourceItems(
        {
          equip1: 9,
          targetEquip1: 10,
          equip2: null,
          targetEquip2: null,
          equip3: null,
          targetEquip3: null,
        },
        ["hat", "hairpin", "watch"],
      ),
    ).toEqual([
      {
        uid: "101009",
        type: ResourceTypeEnum.Equipment,
        rarity: 1,
        amount: 60,
        source: "equipment",
      },
      {
        uid: "101007",
        type: ResourceTypeEnum.Equipment,
        rarity: 1,
        amount: 20,
        source: "equipment",
      },
      {
        uid: "101006",
        type: ResourceTypeEnum.Equipment,
        rarity: 1,
        amount: 10,
        source: "equipment",
      },
    ]);
  });

  it("treats missing current equipment tier as tier 1 when a target tier exists", () => {
    const student = normalizeStudentGrowthInputForCalculation({
      uid: "10000",
      isRecruited: false,
      initialTier: 3,
      tier: null,
      level: null,
      skillEx: null,
      skillNormal: null,
      skillEnhanced: null,
      skillSub: null,
      equip1: null,
      equip2: null,
      equip3: null,
      equipSpecial: null,
      targetLevel: null,
      targetSkillEx: null,
      targetSkillNormal: null,
      targetSkillEnhanced: null,
      targetSkillSub: null,
      targetEquip1: 2,
      targetEquip2: null,
      targetEquip3: null,
      targetEquipSpecial: null,
      targetTier: null,
    });

    expect(
      calculateEquipmentResourceItems(
        {
          equip1: student.equip1,
          targetEquip1: student.targetEquip1,
          equip2: student.equip2,
          targetEquip2: student.targetEquip2,
          equip3: student.equip3,
          targetEquip3: student.targetEquip3,
        },
        ["hat", "hairpin", "watch"],
      ),
    ).toEqual([
      {
        uid: "101001",
        type: ResourceTypeEnum.Equipment,
        rarity: 1,
        amount: 15,
        source: "equipment",
      },
    ]);
  });

  it("ignores stored current growth values for unrecruited students and uses minimum values", () => {
    const student = normalizeStudentGrowthInputForCalculation({
      uid: "10130",
      isRecruited: false,
      initialTier: 3,
      tier: null,
      level: 90,
      skillEx: 5,
      skillNormal: 10,
      skillEnhanced: 10,
      skillSub: 10,
      equip1: 10,
      equip2: 10,
      equip3: 10,
      equipSpecial: null,
      targetLevel: 90,
      targetSkillEx: 5,
      targetSkillNormal: 10,
      targetSkillEnhanced: 10,
      targetSkillSub: 10,
      targetEquip1: 10,
      targetEquip2: 10,
      targetEquip3: 10,
      targetEquipSpecial: null,
      targetTier: 9,
    });

    expect(student.level).toBe(1);
    expect(student.skillEx).toBe(1);
    expect(student.skillNormal).toBe(1);
    expect(student.skillEnhanced).toBe(1);
    expect(student.skillSub).toBe(1);
    expect(student.equip1).toBe(1);
    expect(student.equip2).toBe(1);
    expect(student.equip3).toBe(1);
    expect(calculateLevelResourceItems(student)).not.toEqual([]);
    expect(
      calculateEquipmentResourceItems(
        {
          equip1: student.equip1,
          targetEquip1: student.targetEquip1,
          equip2: student.equip2,
          targetEquip2: student.targetEquip2,
          equip3: student.equip3,
          targetEquip3: student.targetEquip3,
        },
        ["hat", "hairpin", "watch"],
      ),
    ).not.toEqual([]);
  });

  it("calculates eleph requirements for star growth using the student uid item", () => {
    expect(
      calculateTierResourceItems({
        uid: "10000",
        initialTier: 3,
        tier: 3,
        targetTier: 5,
      }),
    ).toEqual([
      {
        uid: "10000",
        type: ResourceTypeEnum.Item,
        rarity: 1,
        amount: 220,
        source: "tier",
      },
    ]);
  });

  it("treats missing current tier as initial tier for unrecruited students", () => {
    expect(
      calculateTierResourceItems({
        uid: "10000",
        initialTier: 3,
        tier: null,
        targetTier: 4,
      }),
    ).toEqual([
      {
        uid: "10000",
        type: ResourceTypeEnum.Item,
        rarity: 1,
        amount: 100,
        source: "tier",
      },
    ]);
  });

  it("does not require eleph for the free 5 to 6 transition", () => {
    expect(calculateCumulativeTierEleph(3, 6) - calculateCumulativeTierEleph(3, 5)).toBe(0);
    expect(
      calculateTierResourceItems({
        uid: "10000",
        initialTier: 3,
        tier: 5,
        targetTier: 6,
      }),
    ).toEqual([]);
  });

  it("uses 200 eleph for the 8 to 9 tier transition", () => {
    expect(calculateCumulativeTierEleph(5, 9) - calculateCumulativeTierEleph(5, 8)).toBe(200);
    expect(
      calculateTierResourceItems({
        uid: "10000",
        initialTier: 3,
        tier: 8,
        targetTier: 9,
      }),
    ).toEqual([
      {
        uid: "10000",
        type: ResourceTypeEnum.Item,
        rarity: 1,
        amount: 200,
        source: "tier",
      },
    ]);
  });

  it("calculates gear growth items from current to target gear tier", () => {
    expect(
      calculateGearResourceItems(
        {
          equipSpecial: 1,
          targetEquipSpecial: 2,
        },
        {
          name: "아루의 엄청 귀중한 지갑",
          growthItems: [
            {
              gearTier: 2,
              amount: 4,
              item: {
                uid: "5017",
                name: "매장금의 지도",
                rarity: 3,
                type: ResourceTypeEnum.Item,
                category: "favor",
                subCategory: null,
              },
            },
            {
              gearTier: 2,
              amount: 80,
              item: {
                uid: "150",
                name: "로혼치 사본 페이지",
                rarity: 1,
                type: ResourceTypeEnum.Item,
                category: "material",
                subCategory: "artifact",
              },
            },
          ],
        },
      ),
    ).toEqual([
      {
        uid: "5017",
        type: ResourceTypeEnum.Item,
        rarity: 3,
        amount: 4,
        name: "매장금의 지도",
        category: "favor",
        subCategory: null,
        source: "gear",
      },
      {
        uid: "150",
        type: ResourceTypeEnum.Item,
        rarity: 1,
        amount: 80,
        name: "로혼치 사본 페이지",
        category: "material",
        subCategory: "artifact",
        source: "gear",
      },
    ]);
  });

  it("sorts resources by kind order before rarity", () => {
    expect(
      sortGrowthResourceItems([
        {
          uid: "10000",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 100,
          source: "tier",
        },
        {
          uid: "150",
          type: ResourceTypeEnum.Item,
          rarity: 2,
          amount: 10,
          source: "skill",
          subCategory: "artifact",
        },
        {
          uid: "4030",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 12,
          source: "skill",
          subCategory: "book_item",
        },
        {
          uid: "3030",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 12,
          source: "skill",
          subCategory: "cd_item",
        },
        {
          uid: "13",
          type: ResourceTypeEnum.Item,
          rarity: 4,
          amount: 2,
          source: "level",
          category: "character_exp_growth",
        },
        {
          uid: "9998",
          type: ResourceTypeEnum.Item,
          rarity: 4,
          amount: 1,
          source: "skill",
        },
      ]).map((item) => item.uid),
    ).toEqual(["10000", "13", "3030", "4030", "9998", "150"]);
  });

  it("keeps the intended kind order even when BAQL category metadata is missing", () => {
    expect(
      sortGrowthResourceItems([
        {
          uid: "101009",
          type: ResourceTypeEnum.Equipment,
          rarity: 1,
          amount: 60,
          source: "equipment",
        },
        {
          uid: "150",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 10,
          source: "skill",
        },
        {
          uid: "9998",
          type: ResourceTypeEnum.Item,
          rarity: 4,
          amount: 1,
          source: "skill",
        },
        {
          uid: "4030",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 12,
          source: "skill",
        },
        {
          uid: "3030",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 12,
          source: "skill",
        },
        {
          uid: "13",
          type: ResourceTypeEnum.Item,
          rarity: 4,
          amount: 2,
          source: "level",
        },
      ]).map((item) => item.uid),
    ).toEqual(["13", "3030", "4030", "9998", "150", "101009"]);
  });

  it("places favor items before artifacts and equipment", () => {
    expect(
      sortGrowthResourceItems([
        {
          uid: "101009",
          type: ResourceTypeEnum.Equipment,
          rarity: 1,
          amount: 60,
          source: "equipment",
        },
        {
          uid: "150",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 10,
          source: "gear",
          category: "material",
          subCategory: "artifact",
        },
        {
          uid: "5017",
          type: ResourceTypeEnum.Item,
          rarity: 3,
          amount: 4,
          source: "gear",
          category: "favor",
          subCategory: null,
        },
      ]).map((item) => item.uid),
    ).toEqual(["5017", "150", "101009"]);
  });

  it("aggregates duplicated resource uids across students and keeps the existing sort order", () => {
    const aggregated = aggregateGrowthResourceRequirements([
      {
        skillUnavailable: false,
        items: [
          {
            uid: "150",
            type: ResourceTypeEnum.Item,
            rarity: 1,
            amount: 80,
            source: "gear",
            category: "material",
            subCategory: "artifact",
          },
          {
            uid: "10000",
            type: ResourceTypeEnum.Item,
            rarity: 1,
            amount: 120,
            source: "tier",
          },
        ],
      },
      {
        skillUnavailable: true,
        items: [
          {
            uid: "13",
            type: ResourceTypeEnum.Item,
            rarity: 4,
            amount: 2,
            source: "level",
            category: "character_exp_growth",
          },
          {
            uid: "10000",
            type: ResourceTypeEnum.Item,
            rarity: 1,
            amount: 80,
            source: "tier",
          },
        ],
      },
    ]);

    expect(aggregated.skillUnavailable).toBe(true);
    expect(aggregated.items.map((item) => [item.uid, item.amount])).toEqual([
      ["10000", 200],
      ["13", 2],
      ["150", 80],
    ]);
  });
});
