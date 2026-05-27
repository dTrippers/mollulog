import { describe, expect, it, jest } from "@jest/globals";
import { ResourceTypeEnum } from "../../../app/graphql/graphql";
import { GROWTH_RESOURCE_KIND_ORDER } from "../../../app/models/growth-resource";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

import {
  type ItemCatalogResource,
  getGrowthPlannerCatalogResourceKindOrder,
  getGrowthPlannerCatalogResources,
} from "../../../app/repositories/item-catalog";

describe("item-catalog", () => {
  it("includes equipment blueprint choice boxes in the growth planner catalog", () => {
    const choiceBox: ItemCatalogResource = {
      uid: "150041",
      name: "T8 장비 설계도 선택 상자",
      rarity: 1,
      type: ResourceTypeEnum.Item,
      category: "consumable",
      subCategory: null,
    };

    expect(getGrowthPlannerCatalogResourceKindOrder(choiceBox)).toBe(GROWTH_RESOURCE_KIND_ORDER.equipment);
    expect(getGrowthPlannerCatalogResources([choiceBox])).toEqual([choiceBox]);
  });

  it("includes only the first BD and tech note choice box UID set in the growth planner catalog", () => {
    const resources: ItemCatalogResource[] = [
      {
        uid: "150000",
        name: "초급 기술 노트 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "consumable",
        subCategory: null,
      },
      {
        uid: "150004",
        name: "초급 BD 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "consumable",
        subCategory: null,
      },
      {
        uid: "150012",
        name: "초급 기술 노트 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "consumable",
        subCategory: null,
      },
      {
        uid: "150020",
        name: "초급 BD 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "consumable",
        subCategory: null,
      },
    ];

    expect(getGrowthPlannerCatalogResourceKindOrder(resources[0])).toBe(GROWTH_RESOURCE_KIND_ORDER.techNote);
    expect(getGrowthPlannerCatalogResourceKindOrder(resources[1])).toBe(GROWTH_RESOURCE_KIND_ORDER.bd);
    expect(getGrowthPlannerCatalogResourceKindOrder(resources[2])).toBeNull();
    expect(getGrowthPlannerCatalogResourceKindOrder(resources[3])).toBeNull();
    expect(getGrowthPlannerCatalogResources(resources).map((resource) => resource.uid)).toEqual(["150004", "150000"]);
  });

  it("sorts equipment blueprint choice boxes before direct equipment blueprints by tier ascending", () => {
    const resources: ItemCatalogResource[] = [
      {
        uid: "150028",
        name: "T2 장비 설계도 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "consumable",
        subCategory: null,
      },
      {
        uid: "101007",
        name: "T8 모자 설계도",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "hat",
        subCategory: null,
      },
      {
        uid: "150048",
        name: "T10 장비 설계도 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "consumable",
        subCategory: null,
      },
    ];

    expect(getGrowthPlannerCatalogResources(resources).map((resource) => resource.uid)).toEqual([
      "150028",
      "150048",
      "101007",
    ]);
  });

  it("sorts artifacts by uid ascending in the growth planner catalog", () => {
    const resources: ItemCatalogResource[] = [
      {
        uid: "153",
        name: "완전한 로혼치 사본",
        rarity: 4,
        type: ResourceTypeEnum.Item,
        category: "material",
        subCategory: "artifact",
      },
      {
        uid: "110",
        name: "파에스토스 원반 조각",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "material",
        subCategory: "artifact",
      },
      {
        uid: "113",
        name: "온전한 파에스토스 원반",
        rarity: 4,
        type: ResourceTypeEnum.Item,
        category: "material",
        subCategory: "artifact",
      },
      {
        uid: "150",
        name: "로혼치 사본 페이지",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "material",
        subCategory: "artifact",
      },
    ];

    expect(getGrowthPlannerCatalogResources(resources).map((resource) => resource.uid)).toEqual([
      "110",
      "113",
      "150",
      "153",
    ]);
  });

  it("sorts BD and tech notes by uid ascending in the growth planner catalog", () => {
    const resources: ItemCatalogResource[] = [
      {
        uid: "150000",
        name: "초급 기술 노트 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "consumable",
        subCategory: null,
      },
      {
        uid: "150004",
        name: "초급 BD 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "consumable",
        subCategory: null,
      },
      {
        uid: "4033",
        name: "최상급 기술 노트",
        rarity: 4,
        type: ResourceTypeEnum.Item,
        category: "material",
        subCategory: "book_item",
      },
      {
        uid: "3033",
        name: "최상급 BD",
        rarity: 4,
        type: ResourceTypeEnum.Item,
        category: "material",
        subCategory: "cd_item",
      },
      {
        uid: "4030",
        name: "초급 기술 노트",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "material",
        subCategory: "book_item",
      },
      {
        uid: "3030",
        name: "초급 BD",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "material",
        subCategory: "cd_item",
      },
    ];

    expect(getGrowthPlannerCatalogResources(resources).map((resource) => resource.uid)).toEqual([
      "150004",
      "3030",
      "3033",
      "150000",
      "4030",
      "4033",
    ]);
  });

  it("sorts growth planner catalog sections in the requested order", () => {
    const resources: ItemCatalogResource[] = [
      {
        uid: "101001",
        name: "T2 모자 설계도",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "hat",
        subCategory: null,
      },
      {
        uid: "10000",
        name: "학생 엘레프",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "secret_stone",
        subCategory: null,
      },
      {
        uid: "5017",
        name: "선물",
        rarity: 3,
        type: ResourceTypeEnum.Item,
        category: "favor",
        subCategory: null,
      },
      {
        uid: "4030",
        name: "기술 노트",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "material",
        subCategory: "book_item",
      },
      {
        uid: "3030",
        name: "BD",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "material",
        subCategory: "cd_item",
      },
      {
        uid: "150",
        name: "오파츠",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "material",
        subCategory: "artifact",
      },
      {
        uid: "10",
        name: "활동 보고서",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: "character_exp_growth",
        subCategory: null,
      },
    ];

    expect(getGrowthPlannerCatalogResources(resources).map((resource) => resource.uid)).toEqual([
      "10",
      "150",
      "3030",
      "4030",
      "5017",
      "10000",
      "101001",
    ]);
  });
});
