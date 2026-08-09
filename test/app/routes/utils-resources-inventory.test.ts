import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { GROWTH_RESOURCE_KIND_ORDER } from "~/domain/growth-resource";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { getItemCatalogResources } from "~/models/item-catalog";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getUserResourceInventoryMap, upsertUserResourceInventories } from "~/models/user-resource-inventory";
import {
  buildInventoryResources,
  buildResourceGroups,
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
});
