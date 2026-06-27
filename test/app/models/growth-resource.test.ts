import { describe, expect, it, jest } from "@jest/globals";
import { runQuery } from "~/lib/baql";
import { ResourceTypeEnum } from "../../../app/graphql/graphql";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

import {
  GROWTH_RESOURCE_KIND_ORDER,
  aggregateGrowthResourceRequirements,
  breakdownCharacterExpToBooks,
  calculateAbilityReleaseRequirements,
  calculateCharacterExpDifference,
  calculateCumulativeTierEleph,
  calculateEquipmentResourceItems,
  calculateEquipmentTierCoverage,
  calculateGearResourceItems,
  calculateLevelRequiredExp,
  calculateLevelResourceItems,
  calculateTierResourceItems,
  getEquipmentBlueprintChoiceBoxTier,
  getEquipmentBlueprintChoiceBoxUid,
  getEquipmentResourceTierLabel,
  getEquipmentTierLabel,
  getSkillMaterialChoiceBoxKindOrder,
  getSkillMaterialChoiceBoxRarity,
  getSkillMaterialResourceChoiceBoxUid,
  getStudentGrowthResourceRequirements,
  normalizeStudentGrowthInputForCalculation,
  sortGrowthResourceItems,
} from "../../../app/models/growth-resource";

const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;

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

  it("calculates level requirements as character exp", () => {
    expect(calculateLevelRequiredExp({ level: 1, targetLevel: 3 })).toBe(35);
    expect(calculateLevelRequiredExp({ level: 30, targetLevel: 30 })).toBe(0);
  });

  it("stores student level requirements as character exp instead of report counts", async () => {
    const requirements = await getStudentGrowthResourceRequirements(
      {} as Env,
      [
        {
          uid: "10000",
          initialTier: 3,
          tier: 3,
          level: 1,
          skillEx: null,
          skillNormal: null,
          skillEnhanced: null,
          skillSub: null,
          equip1: null,
          equip2: null,
          equip3: null,
          equipSpecial: null,
          targetLevel: 3,
          targetSkillEx: null,
          targetSkillNormal: null,
          targetSkillEnhanced: null,
          targetSkillSub: null,
          targetEquip1: null,
          targetEquip2: null,
          targetEquip3: null,
          targetEquipSpecial: null,
          targetTier: null,
        },
      ],
      { "10000": { equipments: [] } } as never,
      new Map(),
    );

    expect(requirements["10000"]).toMatchObject({
      characterExp: 35,
      items: [],
      skillUnavailable: false,
    });
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

  it("maps equipment blueprint choice boxes by tier", () => {
    expect(getEquipmentBlueprintChoiceBoxUid(2)).toBe("150028");
    expect(getEquipmentBlueprintChoiceBoxUid(10)).toBe("150048");
    expect(getEquipmentBlueprintChoiceBoxUid(1)).toBeNull();
    expect(getEquipmentBlueprintChoiceBoxTier("150028")).toBe(2);
    expect(getEquipmentBlueprintChoiceBoxTier("150048")).toBe(10);
    expect(getEquipmentBlueprintChoiceBoxTier("999999")).toBeNull();
  });

  it("maps the first BD and tech note choice box UID set by rarity", () => {
    expect(getSkillMaterialChoiceBoxKindOrder("150000")).toBe(GROWTH_RESOURCE_KIND_ORDER.techNote);
    expect(getSkillMaterialChoiceBoxKindOrder("150003")).toBe(GROWTH_RESOURCE_KIND_ORDER.techNote);
    expect(getSkillMaterialChoiceBoxRarity("150000")).toBe(1);
    expect(getSkillMaterialChoiceBoxRarity("150003")).toBe(4);
    expect(getSkillMaterialChoiceBoxKindOrder("150004")).toBe(GROWTH_RESOURCE_KIND_ORDER.bd);
    expect(getSkillMaterialChoiceBoxKindOrder("150007")).toBe(GROWTH_RESOURCE_KIND_ORDER.bd);
    expect(getSkillMaterialChoiceBoxRarity("150004")).toBe(1);
    expect(getSkillMaterialChoiceBoxRarity("150007")).toBe(4);
    expect(getSkillMaterialChoiceBoxKindOrder("150012")).toBeNull();
    expect(getSkillMaterialChoiceBoxKindOrder("150020")).toBeNull();
  });

  it("maps BD and tech note resources to matching same-rarity choice boxes", () => {
    expect(getSkillMaterialResourceChoiceBoxUid({ uid: "3030", rarity: 1, subCategory: "cd_item" })).toBe("150004");
    expect(getSkillMaterialResourceChoiceBoxUid({ uid: "3033", rarity: 4, subCategory: "cd_item" })).toBe("150007");
    expect(getSkillMaterialResourceChoiceBoxUid({ uid: "4030", rarity: 1, subCategory: "book_item" })).toBe("150000");
    expect(getSkillMaterialResourceChoiceBoxUid({ uid: "4033", rarity: 4, subCategory: "book_item" })).toBe("150003");
    expect(getSkillMaterialResourceChoiceBoxUid({ uid: "150000", rarity: 1 })).toBeNull();
    expect(getSkillMaterialResourceChoiceBoxUid({ uid: "9998", rarity: 4 })).toBeNull();
    expect(getSkillMaterialResourceChoiceBoxUid({ uid: "9999", rarity: 4, subCategory: "book_item" })).toBeNull();
  });

  it("uses Secret Tech Sheet for non-EX skill level 10 requirements", async () => {
    mockedRunQuery
      .mockResolvedValueOnce({
        data: { students: [{ uid: "10000", __typename: "Student" }] },
        error: undefined,
      } as Awaited<ReturnType<typeof runQuery>>)
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              uid: "9999",
              name: "Secret Tech Sheet",
              rarity: 4,
              type: ResourceTypeEnum.Item,
              category: "material",
              subCategory: null,
            },
          ],
        },
        error: undefined,
      } as Awaited<ReturnType<typeof runQuery>>);

    const requirements = await getStudentGrowthResourceRequirements(
      {} as Env,
      [
        {
          uid: "10000",
          initialTier: 3,
          tier: null,
          level: null,
          skillEx: null,
          skillNormal: 9,
          skillEnhanced: null,
          skillSub: null,
          equip1: null,
          equip2: null,
          equip3: null,
          equipSpecial: null,
          targetLevel: null,
          targetSkillEx: null,
          targetSkillNormal: 10,
          targetSkillEnhanced: null,
          targetSkillSub: null,
          targetEquip1: null,
          targetEquip2: null,
          targetEquip3: null,
          targetEquipSpecial: null,
          targetTier: null,
        },
      ],
      { "10000": { equipments: [] } } as never,
      new Map(),
    );

    expect(requirements["10000"].items.map((item) => [item.uid, item.amount])).toEqual([["9999", 1]]);
  });

  it("calculates ability release artifacts and WB items from 0 to 25", () => {
    const requirements = calculateAbilityReleaseRequirements(
      {
        abilityHp: 0,
        targetAbilityHp: 25,
        abilityAtk: null,
        targetAbilityAtk: null,
        abilityHeal: null,
        targetAbilityHeal: null,
      },
      {
        uid: "10000",
        normal2: [
          {
            amount: 1,
            item: {
              uid: "150",
              rarity: 1,
              category: "material",
              subCategory: "artifact",
            },
          },
        ],
        normal5: [
          {
            amount: 1,
            item: {
              uid: "151",
              rarity: 2,
              category: "material",
              subCategory: "artifact",
            },
          },
        ],
      },
    );

    expect(requirements).toEqual({
      unavailable: false,
      credit: 0,
      items: [
        {
          uid: "150",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 225,
          category: "material",
          subCategory: "artifact",
          source: "ability",
        },
        {
          uid: "2000",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 70,
          source: "ability",
        },
        {
          uid: "151",
          type: ResourceTypeEnum.Item,
          rarity: 2,
          amount: 70,
          category: "material",
          subCategory: "artifact",
          source: "ability",
        },
      ],
    });
  });

  it("calculates ability release requirements for partial ranges and each WB type", () => {
    const requirements = calculateAbilityReleaseRequirements(
      {
        abilityHp: 10,
        targetAbilityHp: 12,
        abilityAtk: 20,
        targetAbilityAtk: 21,
        abilityHeal: 24,
        targetAbilityHeal: 25,
      },
      {
        uid: "10000",
        normal2: [
          {
            amount: 1,
            item: {
              uid: "150",
              rarity: 1,
              category: "material",
              subCategory: "artifact",
            },
          },
        ],
        normal5: [
          {
            amount: 1,
            item: {
              uid: "151",
              rarity: 2,
              category: "material",
              subCategory: "artifact",
            },
          },
        ],
      },
    );

    expect(requirements.credit).toBe(0);
    expect(requirements.items.map((item) => [item.uid, item.amount])).toEqual([
      ["150", 40],
      ["2000", 4],
      ["151", 16],
      ["2001", 4],
      ["2002", 4],
    ]);
  });

  it("marks ability release artifacts unavailable when one rarity maps to multiple item uids", () => {
    const requirements = calculateAbilityReleaseRequirements(
      {
        abilityHp: 0,
        targetAbilityHp: 1,
        abilityAtk: null,
        targetAbilityAtk: null,
        abilityHeal: null,
        targetAbilityHeal: null,
      },
      {
        uid: "10000",
        normal2: [
          {
            amount: 1,
            item: {
              uid: "150",
              rarity: 1,
              category: "material",
              subCategory: "artifact",
            },
          },
        ],
        normal3: [
          {
            amount: 1,
            item: {
              uid: "999",
              rarity: 1,
              category: "material",
              subCategory: "artifact",
            },
          },
        ],
      },
    );

    expect(requirements).toEqual({
      unavailable: true,
      credit: 0,
      items: [
        {
          uid: "2000",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 2,
          source: "ability",
        },
      ],
    });
  });

  it("formats equipment blueprint tier labels for resource cards", () => {
    expect(getEquipmentTierLabel("101007")).toBe("T8");
    expect(getEquipmentTierLabel("108009")).toBe("T10");
    expect(getEquipmentTierLabel("150041")).toBeNull();
    expect(getEquipmentTierLabel("999999")).toBeNull();
    expect(getEquipmentResourceTierLabel("101007")).toBe("T8");
    expect(getEquipmentResourceTierLabel("150041")).toBe("T8");
    expect(getEquipmentResourceTierLabel("999999")).toBeNull();
  });

  it("applies equipment blueprint choice boxes only to same-tier total deficit", () => {
    expect(
      calculateEquipmentTierCoverage(
        [
          {
            uid: "101007",
            type: ResourceTypeEnum.Equipment,
            amount: 50,
            source: "equipment",
          },
          {
            uid: "102007",
            type: ResourceTypeEnum.Equipment,
            amount: 20,
            source: "equipment",
          },
          {
            uid: "101006",
            type: ResourceTypeEnum.Equipment,
            amount: 30,
            source: "equipment",
          },
          {
            uid: "150",
            type: ResourceTypeEnum.Item,
            amount: 100,
            source: "skill",
          },
        ],
        {
          "101007": 30,
          "102007": 5,
          "101006": 0,
          "150041": 10,
          "150033": 999,
        },
      ),
    ).toEqual([
      {
        tier: 7,
        requiredAmount: 30,
        directOwnedAmount: 0,
        directDeficit: 30,
        choiceBoxUid: "150033",
        choiceBoxQuantity: 999,
        finalDeficit: 0,
      },
      {
        tier: 8,
        requiredAmount: 70,
        directOwnedAmount: 35,
        directDeficit: 35,
        choiceBoxUid: "150041",
        choiceBoxQuantity: 10,
        finalDeficit: 25,
      },
    ]);
  });

  it("includes owned equipment blueprint choice boxes even without direct equipment requirements", () => {
    expect(calculateEquipmentTierCoverage([], { "150048": 3 })).toEqual([
      {
        tier: 10,
        requiredAmount: 0,
        directOwnedAmount: 0,
        directDeficit: 0,
        choiceBoxUid: "150048",
        choiceBoxQuantity: 3,
        finalDeficit: 0,
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

  it("sorts resources by growth resource display order before rarity", () => {
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
    ).toEqual(["13", "150", "3030", "4030", "9998", "10000"]);
  });

  it("sorts BD and tech notes by uid ascending like the game inventory", () => {
    expect(
      sortGrowthResourceItems([
        {
          uid: "4033",
          type: ResourceTypeEnum.Item,
          rarity: 4,
          amount: 10,
          source: "skill",
          subCategory: "book_item",
        },
        {
          uid: "3033",
          type: ResourceTypeEnum.Item,
          rarity: 4,
          amount: 10,
          source: "skill",
          subCategory: "cd_item",
        },
        {
          uid: "4030",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 10,
          source: "skill",
          subCategory: "book_item",
        },
        {
          uid: "3030",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 10,
          source: "skill",
          subCategory: "cd_item",
        },
      ]).map((item) => item.uid),
    ).toEqual(["3030", "3033", "4030", "4033"]);
  });

  it("sorts artifacts by uid ascending like the game inventory", () => {
    expect(
      sortGrowthResourceItems([
        {
          uid: "113",
          type: ResourceTypeEnum.Item,
          rarity: 4,
          amount: 10,
          source: "skill",
          subCategory: "artifact",
        },
        {
          uid: "150",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 10,
          source: "skill",
          subCategory: "artifact",
        },
        {
          uid: "112",
          type: ResourceTypeEnum.Item,
          rarity: 3,
          amount: 10,
          source: "skill",
          subCategory: "artifact",
        },
        {
          uid: "110",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 10,
          source: "skill",
          subCategory: "artifact",
        },
        {
          uid: "153",
          type: ResourceTypeEnum.Item,
          rarity: 4,
          amount: 10,
          source: "skill",
          subCategory: "artifact",
        },
        {
          uid: "151",
          type: ResourceTypeEnum.Item,
          rarity: 2,
          amount: 10,
          source: "skill",
          subCategory: "artifact",
        },
      ]).map((item) => item.uid),
    ).toEqual(["110", "112", "113", "150", "151", "153"]);
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
    ).toEqual(["13", "150", "3030", "4030", "9998", "101009"]);
  });

  it("places artifacts before favor items and equipment", () => {
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
    ).toEqual(["150", "5017", "101009"]);
  });

  it("aggregates duplicated resource uids across students and keeps the existing sort order", () => {
    const aggregated = aggregateGrowthResourceRequirements([
      {
        characterExp: 0,
        credit: 0,
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
        characterExp: 12340,
        credit: 5000,
        skillUnavailable: true,
        items: [
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
    expect(aggregated.characterExp).toBe(12340);
    expect(aggregated.credit).toBe(5000);
    expect(aggregated.items.map((item) => [item.uid, item.amount])).toEqual([
      ["150", 80],
      ["10000", 200],
    ]);
  });
});
