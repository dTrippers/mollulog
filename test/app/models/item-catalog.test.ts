import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { GROWTH_RESOURCE_KIND_LABELS, GROWTH_RESOURCE_KIND_ORDER } from "../../../app/domain/growth-resource";
import { ResourceTypeEnum } from "../../../app/graphql/graphql";
import { runQuery } from "../../../app/lib/baql";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

import {
  getGrowthPlannerCatalogResourceKindOrder,
  getGrowthPlannerCatalogResources,
  getItemCatalogResourceDescriptionMap,
  type ItemCatalogResource,
} from "../../../app/models/item-catalog";

const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;

afterEach(() => {
  jest.clearAllMocks();
});

describe("item-catalog", () => {
  it("loads and normalizes descriptions for the requested resource UIDs", async () => {
    mockedRunQuery.mockResolvedValue({
      data: {
        items: [
          { uid: "9998", description: "첫 번째 줄\n두 번째 줄" },
          { uid: "empty", description: null },
        ],
        equipments: [{ uid: "101001", description: "  장비   설명  " }],
      },
      error: undefined,
      extensions: undefined,
      operation: {} as never,
      stale: false,
      hasNext: false,
    });

    await expect(getItemCatalogResourceDescriptionMap(["9998", "101001"])).resolves.toEqual({
      "9998": "첫 번째 줄 두 번째 줄",
      "101001": "장비 설명",
    });
    expect(mockedRunQuery).toHaveBeenCalledWith(expect.any(Object), { uids: ["9998", "101001"] });
  });

  it("does not query the catalog when no resource UID is requested", async () => {
    await expect(getItemCatalogResourceDescriptionMap([])).resolves.toEqual({});
    expect(mockedRunQuery).not.toHaveBeenCalled();
  });

  it("keeps item and equipment descriptions distinct when their source UIDs collide", async () => {
    mockedRunQuery.mockResolvedValue({
      data: {
        items: [{ uid: "23", description: "엘리그마 설명" }],
        equipments: [{ uid: "23", description: "티타늄 해머 설명" }],
      },
      error: undefined,
      extensions: undefined,
      operation: {} as never,
      stale: false,
      hasNext: false,
    });

    await expect(getItemCatalogResourceDescriptionMap(["23", "equipment:23"])).resolves.toEqual({
      "23": "엘리그마 설명",
      "equipment:23": "티타늄 해머 설명",
    });
    expect(mockedRunQuery).toHaveBeenCalledWith(expect.any(Object), { uids: ["23"] });
  });

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

  it("includes ability release WB items in the growth planner catalog", () => {
    const wbItem: ItemCatalogResource = {
      uid: "2000",
      name: "교양 WB",
      rarity: 1,
      type: ResourceTypeEnum.Item,
      category: "material",
      subCategory: null,
    };

    expect(getGrowthPlannerCatalogResourceKindOrder(wbItem)).toBe(GROWTH_RESOURCE_KIND_ORDER.ability);
    expect(GROWTH_RESOURCE_KIND_LABELS[GROWTH_RESOURCE_KIND_ORDER.ability]).toBe("교양 WB");
    expect(getGrowthPlannerCatalogResources([wbItem])).toEqual([wbItem]);
  });

  it("classifies equipment growth materials separately and excludes regular equipment", () => {
    const equipmentResources: ItemCatalogResource[] = [
      {
        uid: "1",
        name: "하급 강화석",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "exp",
        subCategory: null,
      },
      {
        uid: "10",
        name: "녹슨 스프링",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "weapon_exp_growth_a",
        subCategory: null,
      },
      {
        uid: "20",
        name: "녹슨 해머",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "weapon_exp_growth_b",
        subCategory: null,
      },
      {
        uid: "30",
        name: "녹슨 총열",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "weapon_exp_growth_c",
        subCategory: null,
      },
      {
        uid: "40",
        name: "녹슨 공이",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "weapon_exp_growth_z",
        subCategory: null,
      },
      {
        uid: "2000",
        name: "스포츠용 장갑",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "gloves",
        subCategory: null,
      },
      {
        uid: "3000",
        name: "핑크 스니커즈",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "shoes",
        subCategory: null,
      },
      {
        uid: "4000",
        name: "방수 스포츠백",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "bag",
        subCategory: null,
      },
    ];

    expect(equipmentResources.map(getGrowthPlannerCatalogResourceKindOrder)).toEqual([
      GROWTH_RESOURCE_KIND_ORDER.equipmentExp,
      GROWTH_RESOURCE_KIND_ORDER.uniqueWeaponGrowth,
      GROWTH_RESOURCE_KIND_ORDER.uniqueWeaponGrowth,
      GROWTH_RESOURCE_KIND_ORDER.uniqueWeaponGrowth,
      GROWTH_RESOURCE_KIND_ORDER.uniqueWeaponGrowth,
      null,
      null,
      null,
    ]);
    expect(getGrowthPlannerCatalogResources(equipmentResources).map((resource) => resource.uid)).toEqual([
      "1",
      "10",
      "20",
      "30",
      "40",
    ]);
  });

  it("includes direct equipment blueprints but excludes universal blueprints", () => {
    const blueprints: ItemCatalogResource[] = [
      {
        uid: "101001",
        name: "니트 털모자 설계도면",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "hat",
        subCategory: null,
      },
      {
        uid: "501000",
        name: "모자 만능 설계도",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "hat",
        subCategory: null,
      },
    ];

    expect(blueprints.map(getGrowthPlannerCatalogResourceKindOrder)).toEqual([
      GROWTH_RESOURCE_KIND_ORDER.equipment,
      null,
    ]);
    expect(getGrowthPlannerCatalogResources(blueprints).map((resource) => resource.uid)).toEqual(["101001"]);
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
