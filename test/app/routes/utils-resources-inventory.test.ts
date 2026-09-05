import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getActiveSensei } from "~/auth/authenticator.server";
import { GROWTH_RESOURCE_KIND_ORDER } from "~/domain/growth-resource";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { getItemCatalogResources } from "~/models/item-catalog";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getUserResourceInventoryMap, upsertUserResourceInventories } from "~/models/user-resource-inventory";
import {
  buildInventoryResources,
  buildResourceGroups,
  CHARACTER_EXP_PER_STUDENT,
  CharacterExpSummary,
  calculateOwnedCharacterExp,
  formatCharacterExpEquivalent,
  getResourceInventoryEmptyText,
} from "~/routes/utils.resources._components/ResourceInventoryEditor";
import {
  filterResourceInventoryResources,
  RESOURCE_INVENTORY_RARITY_OPTIONS,
  type ResourceInventoryFilterState,
} from "~/routes/utils.resources._components/ResourceInventoryFilterPanel";
import { action, loader } from "~/routes/utils.resources.inventory";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/models/item-catalog", () => {
  const actual = jest.requireActual<typeof import("~/models/item-catalog")>("~/models/item-catalog");
  return { ...actual, getItemCatalogResources: jest.fn() };
});
jest.mock("~/models/relationship-level", () => ({ getRelationshipLevels: jest.fn() }));
jest.mock("~/models/user-resource-inventory", () => ({
  getUserResourceInventoryMap: jest.fn(),
  upsertUserResourceInventories: jest.fn(),
  parseUserResourceInventoryQuantity: (value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error("invalid quantity");
    }
    return value;
  },
}));

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetCatalogResources = getItemCatalogResources as jest.MockedFunction<typeof getItemCatalogResources>;
const mockedGetRelationshipLevels = getRelationshipLevels as jest.MockedFunction<typeof getRelationshipLevels>;
const mockedGetInventory = getUserResourceInventoryMap as jest.MockedFunction<typeof getUserResourceInventoryMap>;
const mockedUpsertInventory = upsertUserResourceInventories as jest.MockedFunction<
  typeof upsertUserResourceInventories
>;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock("~/lib/observability.server", () => ({
  getLogger: () => logger,
}));

const env = { KV_CACHE: { get: jest.fn(async () => null) } } as unknown as Env;
const catalogResources = [
  {
    uid: "23",
    name: "엘리그마",
    rarity: 1,
    type: ResourceTypeEnum.Item,
    category: "favor",
    subCategory: null,
  },
  {
    uid: "23",
    name: "티타늄 해머",
    rarity: 4,
    type: ResourceTypeEnum.Equipment,
    category: "weapon_exp_growth_b",
    subCategory: null,
  },
] as const;

function routeArgs(request: Request) {
  return {
    request,
    context: { cloudflare: { env } },
  } as never;
}

describe("resource inventory canonical identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetCatalogResources.mockResolvedValue(catalogResources as never);
    mockedGetRelationshipLevels.mockResolvedValue([]);
    mockedGetInventory.mockResolvedValue({ "23": 4, "equipment:23": 8 });
    mockedUpsertInventory.mockResolvedValue(undefined);
  });

  it("keeps colliding catalog resources distinct in editor-facing data", () => {
    const resources = buildInventoryResources(
      catalogResources.map((resource) => ({
        ...resource,
        inventoryUid: resource.type === ResourceTypeEnum.Item ? "23" : "equipment:23",
      })),
      [
        {
          uid: "23",
          name: "엘리그마",
          rarity: 1,
          type: ResourceTypeEnum.Item,
          category: "favor",
          subCategory: null,
          source: "relationship",
          amount: 5,
        },
        {
          uid: "23",
          name: "티타늄 해머",
          rarity: 4,
          type: ResourceTypeEnum.Equipment,
          category: "weapon_exp_growth_b",
          subCategory: null,
          source: "equipment",
          amount: 6,
        },
      ],
    );

    expect(
      resources.map(({ uid, inventoryUid, requiredAmount, type }) => ({ uid, inventoryUid, requiredAmount, type })),
    ).toEqual([
      { uid: "23", inventoryUid: "23", requiredAmount: 5, type: ResourceTypeEnum.Item },
      { uid: "23", inventoryUid: "equipment:23", requiredAmount: 6, type: ResourceTypeEnum.Equipment },
    ]);
  });

  it("assigns a canonical key to a missing required resource that collides with the catalog", () => {
    const resources = buildInventoryResources(
      [catalogResources[0]],
      [
        {
          uid: "23",
          name: "티타늄 해머",
          rarity: 4,
          type: ResourceTypeEnum.Equipment,
          category: "weapon_exp_growth_b",
          subCategory: null,
          source: "equipment",
          amount: 6,
        },
      ],
    );

    expect(resources.map(({ inventoryUid, type }) => ({ inventoryUid, type }))).toEqual([
      { inventoryUid: "23", type: ResourceTypeEnum.Item },
      { inventoryUid: "equipment:23", type: ResourceTypeEnum.Equipment },
    ]);
  });

  it("loads both canonical inventory keys with their stored quantities", async () => {
    const result = await loader(routeArgs(new Request("https://mollulog.net/utils/resources/inventory")));
    const payload = result as Extract<Awaited<ReturnType<typeof loader>>, { resources: unknown }>;

    expect(payload.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uid: "23", inventoryUid: "23", name: "엘리그마" }),
        expect.objectContaining({ uid: "23", inventoryUid: "equipment:23", name: "티타늄 해머" }),
      ]),
    );
    expect(payload.ownedQuantities).toEqual({ "23": 4, "equipment:23": 8 });
  });

  it("accepts and persists a canonical equipment key separately from the colliding item", async () => {
    const result = await action(
      routeArgs(
        new Request("https://mollulog.net/utils/resources/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ itemUid: "equipment:23", quantity: 10 }] }),
        }),
      ),
    );

    expect(result).toMatchObject({ type: "DataWithResponseInit" });
    expect((result as { data: unknown }).data).toEqual({ saved: true, savedAt: expect.any(Number) });
    expect(mockedUpsertInventory).toHaveBeenCalledWith(env, 7, [{ itemUid: "equipment:23", quantity: 10 }]);
  });

  it("persists a known equipment blueprint even when the equipment catalog is incomplete", async () => {
    mockedGetCatalogResources.mockResolvedValue([catalogResources[0]] as never);

    const result = await action(
      routeArgs(
        new Request("https://mollulog.net/utils/resources/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ itemUid: "101001", quantity: 3 }] }),
        }),
      ),
    );

    expect((result as { data: unknown }).data).toEqual({ saved: true, savedAt: expect.any(Number) });
    expect(mockedUpsertInventory).toHaveBeenCalledWith(env, 7, [{ itemUid: "101001", quantity: 3 }]);
  });

  it("keeps malformed payloads actionable without logging a server failure", async () => {
    const result = await action(
      routeArgs(
        new Request("https://mollulog.net/utils/resources/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: "not-an-array" }),
        }),
      ),
    );

    expect(result).toMatchObject({ data: { error: "저장할 재화가 필요해요" }, init: { status: 400 } });
    expect(mockedUpsertInventory).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("returns a safe retryable 500 and logs unexpected inventory write failures", async () => {
    const internalError = new Error("SQL timeout; password=secret");
    mockedUpsertInventory.mockRejectedValueOnce(internalError);

    const result = await action(
      routeArgs(
        new Request("https://mollulog.net/utils/resources/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ itemUid: "equipment:23", quantity: 10 }] }),
        }),
      ),
    );

    expect(result).toMatchObject({
      data: { error: "보유 재화를 저장하지 못했어요. 잠시 후 다시 시도해주세요" },
      init: { status: 500 },
    });
    expect(JSON.stringify(result)).not.toContain("password=secret");
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to save resource inventory",
      internalError,
      expect.objectContaining({ userId: 7, itemCount: 1 }),
    );
  });
});

describe("resource inventory filter", () => {
  const resources = [
    { uid: "1", name: "Basic Hammer", rarity: 1 },
    { uid: "2", name: "Titanium Hammer", rarity: 4 },
    { uid: "3", name: "Mystic Lens", rarity: 2 },
  ];

  it("uses the canonical item rarity labels", () => {
    expect(RESOURCE_INVENTORY_RARITY_OPTIONS.map(({ value, label, color }) => [value, label, color])).toEqual([
      [1, "N", "grey"],
      [2, "R", "blue"],
      [3, "SR", "orange"],
      [4, "SSR", "purple"],
    ]);
  });

  it("matches case-insensitive name substrings", () => {
    expect(filterResourceInventoryResources(resources, { search: "HAMMER", rarities: [] })).toEqual([
      resources[0],
      resources[1],
    ]);
  });

  it("uses OR semantics for multiple selected rarities", () => {
    expect(filterResourceInventoryResources(resources, { search: "", rarities: [1, 4] })).toEqual([
      resources[0],
      resources[1],
    ]);
  });

  it("combines name and rarity filters with AND semantics", () => {
    expect(filterResourceInventoryResources(resources, { search: "hammer", rarities: [4] })).toEqual([resources[1]]);
  });

  it("combines shortage, name, and rarity filters with AND semantics", () => {
    const resourcesWithShortage = resources.map((resource) => ({
      ...resource,
      shortage: resource.uid === "2",
    }));

    expect(
      filterResourceInventoryResources(resourcesWithShortage, {
        search: "hammer",
        rarities: [4],
        shortageOnly: true,
      }),
    ).toEqual([resourcesWithShortage[1]]);
    expect(
      filterResourceInventoryResources(resourcesWithShortage, {
        search: "hammer",
        rarities: [],
        shortageOnly: true,
      }),
    ).toEqual([resourcesWithShortage[1]]);
  });

  it("uses shortage-aware empty copy without hiding active name or rarity filters", () => {
    expect(getResourceInventoryEmptyText({ search: "", rarities: [], shortageOnly: true })).toBe(
      "부족한 재화가 없어요",
    );
    expect(getResourceInventoryEmptyText({ search: "보고서", rarities: [], shortageOnly: true })).toBe(
      "조건에 맞는 부족 재화가 없어요",
    );
    expect(getResourceInventoryEmptyText({ search: "", rarities: [4], shortageOnly: true })).toBe(
      "조건에 맞는 부족 재화가 없어요",
    );
  });

  it("treats an empty rarity selection as all rarities", () => {
    const filter: ResourceInventoryFilterState = { search: "", rarities: [] };
    expect(filterResourceInventoryResources(resources, filter)).toEqual(resources);
  });

  it("applies the resource filter after category mode filtering", () => {
    const inventoryResources = resources.map((resource) => ({
      ...resource,
      type: ResourceTypeEnum.Item,
      category: "favor",
      subCategory: null,
      requiredAmount: resource.uid === "1" ? 3 : 0,
      kindOrder: GROWTH_RESOURCE_KIND_ORDER.favor,
    }));
    const groups = buildResourceGroups(
      inventoryResources,
      { [GROWTH_RESOURCE_KIND_ORDER.favor]: "needed" },
      { search: "", rarities: [] },
      0,
      {},
    );

    expect(groups[0]?.resources.map((resource) => resource.uid)).toEqual(["1"]);

    const filteredGroups = buildResourceGroups(
      inventoryResources,
      { [GROWTH_RESOURCE_KIND_ORDER.favor]: "needed" },
      { search: "zzz", rarities: [] },
      0,
      {},
    );

    expect(filteredGroups).toEqual([]);
  });

  it("does not classify a resource as short when its choice boxes cover the final deficit", () => {
    const inventoryResources = [
      {
        uid: "101001",
        name: "모자 설계도 2티어",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "hat",
        subCategory: null,
        requiredAmount: 5,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
      {
        uid: "150028",
        name: "2티어 장비 설계도 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: null,
        subCategory: null,
        requiredAmount: 5,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
    ];

    const groups = buildResourceGroups(
      inventoryResources,
      { [GROWTH_RESOURCE_KIND_ORDER.equipment]: "needed" },
      { search: "", rarities: [], shortageOnly: true },
      0,
      { "101001": 0, "150028": 5 },
    );

    expect(groups).toEqual([]);
  });

  it("keeps shared equipment choice-box allocation stable when shortage filtering narrows tiles", () => {
    const inventoryResources = [
      {
        uid: "101001",
        name: "A 설계도",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "hat",
        subCategory: null,
        requiredAmount: 4,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
      {
        uid: "102001",
        name: "B 설계도",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "gloves",
        subCategory: null,
        requiredAmount: 4,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
      {
        uid: "150028",
        name: "2티어 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: null,
        subCategory: null,
        requiredAmount: 8,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
    ];

    const groups = buildResourceGroups(
      inventoryResources,
      { [GROWTH_RESOURCE_KIND_ORDER.equipment]: "needed" },
      { search: "", rarities: [], shortageOnly: true },
      0,
      { "101001": 0, "102001": 0, "150028": 6 },
    );

    expect(groups[0]?.resources.map((resource) => resource.uid)).toEqual(["102001", "150028"]);
    expect(groups[0]?.allocationResources.map((resource) => resource.uid)).toEqual(["101001", "102001", "150028"]);
  });

  it("keeps shared skill-material choice-box allocation stable when shortage filtering narrows tiles", () => {
    const inventoryResources = [
      {
        uid: "3001",
        name: "A BD",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: null,
        subCategory: "cd_item",
        requiredAmount: 4,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.bd,
      },
      {
        uid: "3002",
        name: "B BD",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: null,
        subCategory: "cd_item",
        requiredAmount: 4,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.bd,
      },
      {
        uid: "150004",
        name: "1등급 BD 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: null,
        subCategory: null,
        requiredAmount: 8,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.bd,
      },
    ];

    const groups = buildResourceGroups(
      inventoryResources,
      { [GROWTH_RESOURCE_KIND_ORDER.bd]: "needed" },
      { search: "", rarities: [], shortageOnly: true },
      0,
      { "3001": 0, "3002": 0, "150004": 6 },
    );

    expect(groups[0]?.resources.map((resource) => resource.uid)).toEqual(["3002", "150004"]);
    expect(groups[0]?.allocationResources.map((resource) => resource.uid)).toEqual(["3001", "3002", "150004"]);
  });

  it("uses combined activity-report EXP for shortage filtering", () => {
    const reports = ["13", "12", "11", "10"].map((uid) => ({
      uid,
      name: `보고서 ${uid}`,
      rarity: Number(uid) - 9,
      type: ResourceTypeEnum.Item,
      category: "character_exp_growth",
      subCategory: null,
      requiredAmount: 0,
      kindOrder: GROWTH_RESOURCE_KIND_ORDER.characterExp,
    }));

    const shortageGroups = buildResourceGroups(
      reports,
      { [GROWTH_RESOURCE_KIND_ORDER.characterExp]: "all" },
      { search: "", rarities: [], shortageOnly: true },
      10_001,
      { "13": 1 },
    );
    expect(shortageGroups[0]?.resources.map((resource) => resource.uid)).toEqual(reports.map(({ uid }) => uid));

    const coveredGroups = buildResourceGroups(
      reports,
      { [GROWTH_RESOURCE_KIND_ORDER.characterExp]: "all" },
      { search: "", rarities: [], shortageOnly: true },
      10_000,
      { "13": 1 },
    );
    expect(coveredGroups).toEqual([]);
  });

  it("formats activity-report equivalents as floored natural-number counts", () => {
    expect(calculateOwnedCharacterExp({ "13": 1 })).toBe(10_000);
    expect(formatCharacterExpEquivalent(0)).toBe("1명분 미만");
    expect(formatCharacterExpEquivalent(CHARACTER_EXP_PER_STUDENT - 1)).toBe("1명분 미만");
    expect(formatCharacterExpEquivalent(CHARACTER_EXP_PER_STUDENT)).toBe("1명분");
    expect(formatCharacterExpEquivalent(CHARACTER_EXP_PER_STUDENT * 2.9)).toBe("2명분");
  });

  it("shows owned activity-report EXP even when no growth target is set", () => {
    const markup = renderToStaticMarkup(
      createElement(CharacterExpSummary, {
        requiredCharacterExp: 0,
        draftQuantities: { "13": 1 },
      }),
    );

    expect(markup).toContain("보유 경험치");
    expect(markup).toContain("10,000");
    expect(markup).toContain("레벨 1 → 90 기준 1명분 미만");
    expect(markup).not.toContain("필요 경험치");
    expect(markup).not.toContain("여유 경험치");
  });
});
