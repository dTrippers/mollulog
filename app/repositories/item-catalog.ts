import { graphql } from "~/graphql";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "~/models/base";
import { getEquipmentTier, getEquipmentTypeKey } from "~/models/growth-resource";

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
  return fetchCached(
    env,
    "user-resource-inventory-catalog::v1",
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
      ]
        .sort((a, b) => Number(a.uid) - Number(b.uid));
    },
    60 * 60 * 24,
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
  const itemUid = Number(resource.uid);

  if (resource.category === "secret_stone") {
    return 0;
  }

  if (resource.category === "character_exp_growth" || isUidInRange(itemUid, 10, 13)) {
    return 1;
  }

  if (resource.subCategory === "cd_item" || isUidInRange(itemUid, 3000, 3999)) {
    return 2;
  }

  if (
    resource.subCategory === "book_item" ||
    resource.uid === "9998" ||
    resource.uid === "9999" ||
    isUidInRange(itemUid, 4000, 4999)
  ) {
    return 3;
  }

  if (resource.category === "favor") {
    return 4;
  }

  if (resource.subCategory === "artifact") {
    return 5;
  }

  if (resource.type === "equipment") {
    return 6;
  }

  return null;
}

function compareGrowthPlannerCatalogResources(a: ItemCatalogResource, b: ItemCatalogResource): number {
  const kindOrderA = getGrowthPlannerCatalogResourceKindOrder(a) ?? 7;
  const kindOrderB = getGrowthPlannerCatalogResourceKindOrder(b) ?? 7;
  const kindDelta = kindOrderA - kindOrderB;
  if (kindDelta !== 0) {
    return kindDelta;
  }

  if (a.type === "equipment" && b.type === "equipment") {
    const equipmentTypeOrderA = getEquipmentTypeOrder(a.uid);
    const equipmentTypeOrderB = getEquipmentTypeOrder(b.uid);
    const equipmentTypeDelta = equipmentTypeOrderA - equipmentTypeOrderB;
    if (equipmentTypeDelta !== 0) {
      return equipmentTypeDelta;
    }

    return getEquipmentTier(b.uid) - getEquipmentTier(a.uid);
  }

  if (a.rarity !== b.rarity) {
    return a.rarity - b.rarity;
  }

  return Number(a.uid) - Number(b.uid);
}

const EQUIPMENT_TYPE_ORDER = ["hat", "gloves", "shoes", "bag", "badge", "hairpin", "charm", "watch", "necklace"];

function getEquipmentTypeOrder(uid: string): number {
  const typeKey = getEquipmentTypeKey(uid);
  const index = typeKey ? EQUIPMENT_TYPE_ORDER.indexOf(typeKey) : -1;
  return index === -1 ? EQUIPMENT_TYPE_ORDER.length : index;
}

function isUidInRange(uid: number, start: number, end: number): boolean {
  return Number.isFinite(uid) && uid >= start && uid <= end;
}
