import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getActiveSensei } from "~/auth/authenticator.server";
import { ResourceInventoryTile } from "~/components/features/growth";
import { useNumberInputFlowNavigation } from "~/components/primitives";
import { clampNumberInputValue } from "~/components/primitives/NumberInput";
import { GROWTH_RESOURCE_KIND_ORDER } from "~/domain/growth-resource";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { getLogger } from "~/lib/observability.server";
import { getItemCatalogResources } from "~/models/item-catalog";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getUserResourceInventoryMap, upsertUserResourceInventories } from "~/models/user-resource-inventory";
import {
  buildInventoryResources,
  buildResourceGroups,
  CHARACTER_EXP_PER_STUDENT,
  CharacterExpSummary,
  calculateOwnedCharacterExp,
  EquipmentSubGroups,
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
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedGetRelationshipLevels = getRelationshipLevels as jest.MockedFunction<typeof getRelationshipLevels>;
const mockedGetInventory = getUserResourceInventoryMap as jest.MockedFunction<typeof getUserResourceInventoryMap>;
const mockedUpsertInventory = upsertUserResourceInventories as jest.MockedFunction<
  typeof upsertUserResourceInventories
>;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => logger),
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

const giftBoxCatalogResources = [
  {
    uid: "100000",
    name: "선물 상자",
    rarity: 3,
    type: ResourceTypeEnum.Item,
    category: "consumable",
    subCategory: null,
  },
  {
    uid: "100008",
    name: "선물 선택 상자",
    rarity: 3,
    type: ResourceTypeEnum.Item,
    category: "consumable",
    subCategory: null,
  },
  {
    uid: "100009",
    name: "고급 선물 상자",
    rarity: 4,
    type: ResourceTypeEnum.Item,
    category: "consumable",
    subCategory: null,
  },
] as const;

const universalBlueprintCatalogResources = [
  ["501000", "모자 만능 설계도", "hat"],
  ["502000", "장갑 만능 설계도", "gloves"],
  ["503000", "신발 만능 설계도", "shoes"],
  ["504000", "가방 만능 설계도", "bag"],
  ["505000", "배지 만능 설계도", "badge"],
  ["506000", "헤어핀 만능 설계도", "hairpin"],
  ["507000", "부적 만능 설계도", "charm"],
  ["508000", "손목시계 만능 설계도", "watch"],
  ["509000", "목걸이 만능 설계도", "necklace"],
].map(([uid, name, category]) => ({
  uid,
  name,
  rarity: 1,
  type: ResourceTypeEnum.Equipment,
  category,
  subCategory: null,
}));

function routeArgs(request: Request) {
  return {
    request,
    context: { cloudflare: { env } },
  } as never;
}

function assertResponse(value: unknown): asserts value is Response {
  if (!(value instanceof Response)) {
    throw new Error("expected the loader to return a Response error");
  }
}

describe("resource inventory canonical identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetCatalogResources.mockResolvedValue([...catalogResources, ...universalBlueprintCatalogResources] as never);
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

  it("fails explicitly instead of rendering a required resource without catalog metadata", () => {
    expect(() =>
      buildInventoryResources(
        [...catalogResources],
        [
          {
            uid: "101001",
            name: "",
            rarity: 1,
            type: ResourceTypeEnum.Equipment,
            category: "hat",
            subCategory: null,
            source: "equipment",
            amount: 1,
          },
        ],
      ),
    ).toThrow("필요한 재화 카탈로그 정보를 확인하지 못했어요");
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

  it("loads gift boxes into the editor catalog with their stored quantities", async () => {
    const ownedQuantities = { "100000": 2, "100008": 5, "100009": 1 };
    mockedGetCatalogResources.mockResolvedValue([
      ...giftBoxCatalogResources,
      ...universalBlueprintCatalogResources,
    ] as never);
    mockedGetInventory.mockResolvedValue(ownedQuantities);

    const result = await loader(routeArgs(new Request("https://mollulog.net/utils/resources/inventory")));
    const payload = result as Extract<Awaited<ReturnType<typeof loader>>, { resources: unknown }>;

    expect(
      payload.resources
        .filter(({ uid }) => giftBoxCatalogResources.some((resource) => resource.uid === uid))
        .map(({ uid, inventoryUid }) => [uid, inventoryUid]),
    ).toEqual([
      ["100000", "100000"],
      ["100008", "100008"],
      ["100009", "100009"],
    ]);
    expect(payload.ownedQuantities).toEqual(ownedQuantities);
  });

  it("loads all canonical universal equipment blueprints with their stored quantities", async () => {
    const ownedQuantities = Object.fromEntries(universalBlueprintCatalogResources.map(({ uid }) => [uid, 2]));
    mockedGetCatalogResources.mockResolvedValue(universalBlueprintCatalogResources as never);
    mockedGetInventory.mockResolvedValue(ownedQuantities);

    const result = await loader(routeArgs(new Request("https://mollulog.net/utils/resources/inventory")));
    const payload = result as Extract<Awaited<ReturnType<typeof loader>>, { resources: unknown }>;

    expect(payload.resources.map(({ uid, name, inventoryUid }) => [uid, name, inventoryUid])).toEqual(
      universalBlueprintCatalogResources.map(({ uid, name }) => [uid, name, uid]),
    );
    expect(payload.ownedQuantities).toEqual(ownedQuantities);
  });

  it("refreshes a stale incomplete catalog once before loading the planner", async () => {
    const staleCatalogResources = universalBlueprintCatalogResources.slice(0, -1);
    mockedGetCatalogResources
      .mockResolvedValueOnce(staleCatalogResources as never)
      .mockResolvedValueOnce(universalBlueprintCatalogResources as never);
    const ownedQuantities = Object.fromEntries(universalBlueprintCatalogResources.map(({ uid }) => [uid, 2]));
    mockedGetInventory.mockResolvedValue(ownedQuantities);

    const result = await loader(routeArgs(new Request("https://mollulog.net/utils/resources/inventory")));
    const payload = result as Extract<Awaited<ReturnType<typeof loader>>, { resources: unknown }>;

    expect(payload.resources.map(({ uid }) => uid)).toEqual(universalBlueprintCatalogResources.map(({ uid }) => uid));
    expect(mockedGetCatalogResources).toHaveBeenNthCalledWith(1, env);
    expect(mockedGetCatalogResources).toHaveBeenNthCalledWith(2, env, true);
  });

  it("logs a forced refresh failure before returning the safe catalog error", async () => {
    const incompleteCatalogResources = universalBlueprintCatalogResources.slice(0, -1);
    const refreshError = new Error("catalog refresh failed; password=secret");
    mockedGetCatalogResources
      .mockResolvedValueOnce(incompleteCatalogResources as never)
      .mockRejectedValueOnce(refreshError);

    const error = await loader(routeArgs(new Request("https://mollulog.net/utils/resources/inventory"))).catch(
      (value) => value,
    );

    assertResponse(error);
    expect(error.status).toBe(503);
    await expect(error.text()).resolves.toBe("만능 설계도 정보를 불러오지 못했어요.");
    expect(mockedGetCatalogResources).toHaveBeenNthCalledWith(1, env);
    expect(mockedGetCatalogResources).toHaveBeenNthCalledWith(2, env, true);
    expect(mockedGetLogger).toHaveBeenCalledWith(env, undefined, {
      route: "utils.resources.inventory.loader",
    });
    expect(logger.error).toHaveBeenCalledWith("Failed to refresh resource inventory catalog", undefined, {
      forceRefresh: true,
      errorCategory: "Error",
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("password=secret");
  });

  it("returns an explicit 503 when a canonical universal equipment blueprint is missing", async () => {
    const incompleteCatalogResources = universalBlueprintCatalogResources.slice(0, -1);
    mockedGetCatalogResources
      .mockResolvedValueOnce(incompleteCatalogResources as never)
      .mockResolvedValueOnce(incompleteCatalogResources as never);

    const error = await loader(routeArgs(new Request("https://mollulog.net/utils/resources/inventory"))).catch(
      (value) => value,
    );

    assertResponse(error);
    expect(error.status).toBe(503);
    await expect(error.text()).resolves.toBe("만능 설계도 정보를 불러오지 못했어요.");
    expect(mockedGetCatalogResources).toHaveBeenNthCalledWith(1, env);
    expect(mockedGetCatalogResources).toHaveBeenNthCalledWith(2, env, true);
  });

  it("returns the same explicit 503 when canonical universal metadata mismatches", async () => {
    const mismatchedCatalogResources = universalBlueprintCatalogResources.map((resource, index) =>
      index === 0 ? { ...resource, category: "gloves" } : resource,
    );
    mockedGetCatalogResources
      .mockResolvedValueOnce(mismatchedCatalogResources as never)
      .mockResolvedValueOnce(mismatchedCatalogResources as never);

    const error = await loader(routeArgs(new Request("https://mollulog.net/utils/resources/inventory"))).catch(
      (value) => value,
    );

    assertResponse(error);
    expect(error.status).toBe(503);
    await expect(error.text()).resolves.toBe("만능 설계도 정보를 불러오지 못했어요.");
    expect(mockedGetCatalogResources).toHaveBeenNthCalledWith(1, env);
    expect(mockedGetCatalogResources).toHaveBeenNthCalledWith(2, env, true);
  });

  it("accepts and persists a canonical universal equipment blueprint key", async () => {
    mockedGetCatalogResources.mockResolvedValue([...catalogResources, ...universalBlueprintCatalogResources] as never);
    mockedGetInventory.mockResolvedValue({ "501000": 1 });

    const result = await action(
      routeArgs(
        new Request("https://mollulog.net/utils/resources/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ itemUid: "501000", quantity: 3 }] }),
        }),
      ),
    );

    expect((result as { data: unknown }).data).toEqual({ saved: true, savedAt: expect.any(Number) });
    expect(mockedUpsertInventory).toHaveBeenCalledWith(env, 7, [{ itemUid: "501000", quantity: 3 }]);
  });

  it("accepts a gift-box quantity in the inventory save action", async () => {
    mockedGetCatalogResources.mockResolvedValue([
      ...giftBoxCatalogResources,
      ...universalBlueprintCatalogResources,
    ] as never);
    mockedGetInventory.mockResolvedValue({ "100000": 1 });

    const result = await action(
      routeArgs(
        new Request("https://mollulog.net/utils/resources/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ itemUid: "100000", quantity: 3 }] }),
        }),
      ),
    );

    expect((result as { data: unknown }).data).toEqual({ saved: true, savedAt: expect.any(Number) });
    expect(mockedUpsertInventory).toHaveBeenCalledWith(env, 7, [{ itemUid: "100000", quantity: 3 }]);
  });

  it("does not allocate gift-box quantities against individual gift requirements", () => {
    const individualGift = {
      uid: "5017",
      name: "일반 선물",
      rarity: 3,
      type: ResourceTypeEnum.Item,
      category: "favor",
      subCategory: null,
      source: "relationship" as const,
      amount: 3,
    };
    const resources = buildInventoryResources([...giftBoxCatalogResources, { ...individualGift }], [individualGift]);

    const shortageGroups = buildResourceGroups(
      resources,
      { [GROWTH_RESOURCE_KIND_ORDER.favor]: "all" },
      { search: "", rarities: [], shortageOnly: true },
      0,
      { "100000": 100, "100008": 100, "100009": 100, "5017": 0 },
    );

    expect(shortageGroups[0]?.resources.map(({ uid, requiredAmount }) => [uid, requiredAmount])).toEqual([["5017", 3]]);
  });

  it("applies name and rarity filters to gift boxes", () => {
    const resources = [...giftBoxCatalogResources];

    expect(
      filterResourceInventoryResources(resources, { search: "선물 선택", rarities: [3] }).map(({ uid }) => uid),
    ).toEqual(["100008"]);
    expect(
      filterResourceInventoryResources(resources, { search: "선물", rarities: [4] }).map(({ uid }) => uid),
    ).toEqual(["100009"]);
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

  it("rejects a mixed save before upserting when the universal catalog is incomplete", async () => {
    const incompleteCatalogResources = [...catalogResources, ...universalBlueprintCatalogResources.slice(0, -1)];
    mockedGetCatalogResources
      .mockResolvedValueOnce(incompleteCatalogResources as never)
      .mockResolvedValueOnce(incompleteCatalogResources as never);

    const result = await action(
      routeArgs(
        new Request("https://mollulog.net/utils/resources/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [
              { itemUid: "23", quantity: 5 },
              { itemUid: "509000", quantity: 3 },
            ],
          }),
        }),
      ),
    );

    expect(result).toMatchObject({
      type: "DataWithResponseInit",
      data: { error: "만능 설계도 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요" },
      init: { status: 503 },
    });
    expect(mockedUpsertInventory).not.toHaveBeenCalled();
    expect(mockedGetCatalogResources).toHaveBeenNthCalledWith(1, env);
    expect(mockedGetCatalogResources).toHaveBeenNthCalledWith(2, env, true);
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

  it("uses one full equipment allocation for direct, choice-box, and universal shortage filtering", () => {
    const inventoryResources = [
      {
        uid: "101004",
        name: "T5 모자 설계도",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "hat",
        subCategory: null,
        requiredAmount: 1,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
      {
        uid: "102004",
        name: "T5 장갑 설계도",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "gloves",
        subCategory: null,
        requiredAmount: 2,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
      {
        uid: "150031",
        name: "T5 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: null,
        subCategory: null,
        requiredAmount: 3,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
      {
        uid: "501000",
        name: "모자 만능 설계도",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "hat",
        subCategory: null,
        requiredAmount: 0,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
      {
        uid: "502000",
        name: "장갑 만능 설계도",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "gloves",
        subCategory: null,
        requiredAmount: 0,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
    ];

    const groups = buildResourceGroups(
      inventoryResources,
      { [GROWTH_RESOURCE_KIND_ORDER.equipment]: "needed" },
      { search: "", rarities: [], shortageOnly: true },
      0,
      { "101004": 0, "102004": 0, "150031": 1, "501000": 7, "502000": 0 },
    );

    expect(groups[0]?.resources.map((resource) => resource.uid)).toEqual(["102004", "150031", "502000"]);
    expect(groups[0]?.allocationResources.map((resource) => resource.uid)).toEqual([
      "101004",
      "102004",
      "150031",
      "501000",
      "502000",
    ]);
  });

  it("does not mark a direct blueprint or optional choice box short when universal stock covers it", () => {
    const inventoryResources = [
      {
        uid: "101004",
        name: "T5 모자 설계도",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "hat",
        subCategory: null,
        requiredAmount: 1,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
      {
        uid: "150031",
        name: "T5 선택 상자",
        rarity: 1,
        type: ResourceTypeEnum.Item,
        category: null,
        subCategory: null,
        requiredAmount: 1,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
      {
        uid: "501000",
        name: "모자 만능 설계도",
        rarity: 1,
        type: ResourceTypeEnum.Equipment,
        category: "hat",
        subCategory: null,
        requiredAmount: 0,
        kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
      },
    ];

    const groups = buildResourceGroups(
      inventoryResources,
      { [GROWTH_RESOURCE_KIND_ORDER.equipment]: "needed" },
      { search: "", rarities: [], shortageOnly: true },
      0,
      { "101004": 0, "150031": 0, "501000": 7 },
    );

    expect(groups).toEqual([]);
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

  it("gives universal blueprint quantity inputs a resource-specific accessible name and label", () => {
    const markup = renderToStaticMarkup(
      createElement(ResourceInventoryTile, {
        resource: {
          itemUid: "501000",
          resourceType: ResourceTypeEnum.Equipment,
          rarity: 1,
          name: "모자 만능 설계도",
          label: "만능",
        },
        currentQuantity: 0,
        draftQuantity: 0,
        onQuantityChange: jest.fn(),
      }),
    );

    expect(markup).toContain('aria-label="모자 만능 설계도 보유 수량"');
    expect(markup).toContain(">만능</div>");
  });

  it("clamps overlarge inventory quantities to the database integer bound", () => {
    const maxQuantity = 2_147_483_647;
    const pastedQuantity = maxQuantity + 1;
    const clampedQuantity = clampNumberInputValue(pastedQuantity, 0, maxQuantity);

    expect(clampedQuantity).toBe(maxQuantity);

    const markup = renderToStaticMarkup(
      createElement(ResourceInventoryTile, {
        resource: {
          itemUid: "501000",
          resourceType: ResourceTypeEnum.Equipment,
          rarity: 1,
          name: "모자 만능 설계도",
          label: "만능",
        },
        currentQuantity: 0,
        draftQuantity: clampedQuantity,
        onQuantityChange: jest.fn(),
      }),
    );

    expect(markup).toContain(`value="${maxQuantity}"`);
  });
});

type EquipmentSubGroupsProps = ComponentProps<typeof EquipmentSubGroups>;

function EquipmentSubGroupsWithInputNavigation(props: Omit<EquipmentSubGroupsProps, "numberInputFlowNavigation">) {
  const numberInputFlowNavigation = useNumberInputFlowNavigation();
  return createElement(EquipmentSubGroups, { ...props, numberInputFlowNavigation });
}

function renderEquipmentSubGroups(props: Omit<EquipmentSubGroupsProps, "numberInputFlowNavigation">) {
  return renderToStaticMarkup(createElement(EquipmentSubGroupsWithInputNavigation, props));
}

function extractTileMarkup(markup: string, tileName: string): string {
  const start = markup.indexOf(`<div title="${tileName}"`);
  if (start === -1) {
    throw new Error(`tile markup not found: ${tileName}`);
  }
  const nextTileStart = markup.indexOf('<div title="', start + 1);
  return markup.slice(start, nextTileStart === -1 ? undefined : nextTileStart);
}

describe("resource inventory editor universal blueprint tile", () => {
  const equipmentResources = [
    {
      uid: "101004",
      name: "T5 모자 설계도",
      rarity: 1,
      type: ResourceTypeEnum.Equipment,
      category: "hat",
      subCategory: null,
      requiredAmount: 200,
      kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
    },
    {
      uid: "501000",
      name: "모자 만능 설계도",
      rarity: 1,
      type: ResourceTypeEnum.Equipment,
      category: "hat",
      subCategory: null,
      requiredAmount: 0,
      kindOrder: GROWTH_RESOURCE_KIND_ORDER.equipment,
    },
  ] as const;
  function renderHatGroupEditor(universalOwnedAmount = 3) {
    const draftQuantities = { "101004": 0, "501000": universalOwnedAmount };
    return renderEquipmentSubGroups({
      resources: [...equipmentResources],
      allocationResources: [...equipmentResources],
      ownedQuantities: draftQuantities,
      draftQuantities,
      onQuantityChange: jest.fn(),
    });
  }

  it("renders the universal blueprint tile after direct blueprint tiles in its equipment type group", () => {
    const markup = renderHatGroupEditor();

    const directTileIndex = markup.indexOf('<div title="T5 모자 설계도"');
    const universalTileIndex = markup.indexOf('<div title="모자 만능 설계도"');
    expect(directTileIndex).toBeGreaterThan(-1);
    expect(universalTileIndex).toBeGreaterThan(directTileIndex);
  });

  it("shows a single required metric with the ownership-independent universal amount", () => {
    const markup = renderHatGroupEditor();
    const universalTileMarkup = extractTileMarkup(markup, "모자 만능 설계도");

    // T5 부족분 200 × 만능 설계도 코스트 7 = 1400 (보유량 3과 무관)
    expect(universalTileMarkup).toContain(">필요</span>");
    expect(universalTileMarkup).toContain(">1,400</span>");
  });

  it("keeps the required amount independent of universal blueprint ownership", () => {
    const markup = renderHatGroupEditor(7);
    const universalTileMarkup = extractTileMarkup(markup, "모자 만능 설계도");

    // 보유 7개로 T5 설계도 1개(코스트 7)를 대체해도 필요량은 1400으로 유지된다.
    // 보유량 의존 값(requiredAmount - usedAmount = 1400 - 7)이라면 1,393이 렌더된다.
    expect(universalTileMarkup).toContain(">필요</span>");
    expect(universalTileMarkup).toContain(">1,400</span>");
  });

  it("no longer shows substitute-required or balance metrics on the universal blueprint tile", () => {
    const markup = renderHatGroupEditor();
    const universalTileMarkup = extractTileMarkup(markup, "모자 만능 설계도");
    const directTileMarkup = extractTileMarkup(markup, "T5 모자 설계도");

    expect(markup).not.toContain("대체 필요");
    expect(universalTileMarkup).not.toContain("여유");
    expect(universalTileMarkup).not.toContain("부족");
    expect(directTileMarkup).toContain("부족");
  });
});
