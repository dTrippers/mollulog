export function bossImageUrl(boss: string): string {
  return `https://assets.mollulog.net/assets/images/boss/${boss}`;
}

export function bossBannerUrl(boss: string): string {
  return `https://assets.mollulog.net/assets/images/boss-banner/${boss}`;
}

export function studentImageUrl(uid: string): string {
  if (uid === "unlisted") {
    return "https://assets.mollulog.net/assets/images/students/-1";
  }
  return `https://assets.baql.net/images/students/collection/${uid}.webp`;
}

export function studentStandingImageUrl(uid: string): string {
  return `https://assets.baql.net/images/students/standing/${uid}.webp`;
}

const RESOURCE_IMAGE_DIRECTORIES = {
  item: "items",
  currency: "currencies",
  equipment: "equipments",
  furniture: "furnitures",
} as const;

export type ResourceImageType = keyof typeof RESOURCE_IMAGE_DIRECTORIES;

export function resourceImageUrl(resourceType: ResourceImageType, uid: string): string {
  return `https://assets.baql.net/images/resources/${RESOURCE_IMAGE_DIRECTORIES[resourceType]}/${uid}.webp`;
}

export function itemImageUrl(item: string): string {
  return resourceImageUrl("item", item);
}

export function equipmentImageUrl(equipment: string): string {
  return resourceImageUrl("equipment", equipment);
}

export function terrainAdaptationIconUrl(rank: "D" | "C" | "B" | "A" | "S" | "SS"): string {
  return `https://assets.mollulog.net/assets/images/ui/terrain-${rank}.png`;
}
