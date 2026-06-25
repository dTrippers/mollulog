import { graphql } from "~/graphql";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, fetchSourceCached } from "~/models/base";
import {
  GROWTH_RESOURCE_KIND_ORDER,
  classifyGrowthResourceKind,
  compareGrowthResourceKindOrder,
  getEquipmentBlueprintChoiceBoxTier,
  getEquipmentTier,
  getEquipmentTypeOrder,
  getSkillMaterialChoiceBoxRarity,
  shouldSortGrowthResourceKindByUid,
} from "~/models/growth-resource";

const ITEM_CATALOG_RESOURCES_CACHE_KEY = cacheKey("source", "item-catalog", 1, "user-resource-inventory");

const itemCatalogQuery = graphql(`
  query UserResourceInventoryCatalog {
    items {
      uid name rarity type
      ... on Item { category subCategory }
    }
    equipments {
      uid name rarity type category
    }
  }
`);

export type ItemCatalogResource = {
  uid: string;
  name: string;
  rarity: number;
  type: ResourceTypeEnum;
  category: string | null;
  subCategory: string | null;
};

export async function getItemCatalogResources(env: Env, forceRefresh = false): Promise<ItemCatalogResource[]> {
  return fetchSourceCached(
    env,
    ITEM_CATALOG_RESOURCES_CACHE_KEY,
    async () => {
      const { data, error } = await runQuery(itemCatalogQuery, {});
      if (error) {
        throw error;
      }

      const items = data?.items ?? [];
      const equipments = data?.equipments ?? [];
      return [
        ...items.map((item) => ({
          uid: item.uid,
          name: item.name.replaceAll("\n", " ").trim(),
          rarity: item.rarity,
          type: item.type,
          category: item.category,
          subCategory: item.subCategory,
        })),
        ...equipments.map((equipment) => ({
          uid: equipment.uid,
          name: equipment.name.replaceAll("\n", " ").trim(),
          rarity: equipment.rarity,
          type: equipment.type,
          category: equipment.category,
          subCategory: null,
        })),
      ].sort((a, b) => Number(a.uid) - Number(b.uid));
    },
    forceRefresh,
  );
}

export async function getItemCatalogResourceMap(env: Env): Promise<Record<string, ItemCatalogResource>> {
  const resources = await getItemCatalogResources(env);
  return Object.fromEntries(resources.map((resource) => [resource.uid, resource]));
}

export function getGrowthPlannerCatalogResources(resources: ItemCatalogResource[]): ItemCatalogResource[] {
  return resources
    .filter((resource) => getGrowthPlannerCatalogResourceKindOrder(resource) !== null)
    .sort(compareGrowthPlannerCatalogResources);
}

export function getGrowthPlannerCatalogResourceKindOrder(resource: ItemCatalogResource): number | null {
  return classifyGrowthResourceKind(resource);
}

function compareGrowthPlannerCatalogResources(a: ItemCatalogResource, b: ItemCatalogResource): number {
  const kindOrderA = getGrowthPlannerCatalogResourceKindOrder(a) ?? GROWTH_RESOURCE_KIND_ORDER.other;
  const kindOrderB = getGrowthPlannerCatalogResourceKindOrder(b) ?? GROWTH_RESOURCE_KIND_ORDER.other;
  const kindDelta = compareGrowthResourceKindOrder(kindOrderA, kindOrderB);
  if (kindDelta !== 0) {
    return kindDelta;
  }

  if (kindOrderA === GROWTH_RESOURCE_KIND_ORDER.bd || kindOrderA === GROWTH_RESOURCE_KIND_ORDER.techNote) {
    const choiceBoxRarityA = getSkillMaterialChoiceBoxRarity(a.uid);
    const choiceBoxRarityB = getSkillMaterialChoiceBoxRarity(b.uid);

    if (choiceBoxRarityA !== null && choiceBoxRarityB === null) {
      return -1;
    }

    if (choiceBoxRarityA === null && choiceBoxRarityB !== null) {
      return 1;
    }

    if (choiceBoxRarityA !== null && choiceBoxRarityB !== null) {
      return choiceBoxRarityA - choiceBoxRarityB;
    }
  }

  if (shouldSortGrowthResourceKindByUid(kindOrderA) && shouldSortGrowthResourceKindByUid(kindOrderB)) {
    return compareUidAscending(a.uid, b.uid);
  }

  if (kindOrderA === GROWTH_RESOURCE_KIND_ORDER.equipment && kindOrderB === GROWTH_RESOURCE_KIND_ORDER.equipment) {
    const choiceBoxTierA = getEquipmentBlueprintChoiceBoxTier(a.uid);
    const choiceBoxTierB = getEquipmentBlueprintChoiceBoxTier(b.uid);

    if (a.type === "equipment" && b.type === "equipment") {
      const equipmentTypeOrderA = getEquipmentTypeOrder(a.uid);
      const equipmentTypeOrderB = getEquipmentTypeOrder(b.uid);
      const equipmentTypeDelta = equipmentTypeOrderA - equipmentTypeOrderB;
      if (equipmentTypeDelta !== 0) {
        return equipmentTypeDelta;
      }

      return getEquipmentTier(a.uid) - getEquipmentTier(b.uid);
    }

    if (a.type === "equipment" && choiceBoxTierB !== null) {
      return 1;
    }

    if (choiceBoxTierA !== null && b.type === "equipment") {
      return -1;
    }

    if (choiceBoxTierA !== null && choiceBoxTierB !== null) {
      return choiceBoxTierA - choiceBoxTierB;
    }
  }

  if (a.type === "equipment" && b.type === "equipment") {
    const equipmentTypeOrderA = getEquipmentTypeOrder(a.uid);
    const equipmentTypeOrderB = getEquipmentTypeOrder(b.uid);
    const equipmentTypeDelta = equipmentTypeOrderA - equipmentTypeOrderB;
    if (equipmentTypeDelta !== 0) {
      return equipmentTypeDelta;
    }

    return getEquipmentTier(a.uid) - getEquipmentTier(b.uid);
  }

  if (a.rarity !== b.rarity) {
    return a.rarity - b.rarity;
  }

  return Number(a.uid) - Number(b.uid);
}

function compareUidAscending(a: string, b: string): number {
  return Number(a) - Number(b);
}
