export type OcrCatalogResourceIdentity = {
  uid: string;
  type: string;
};

export type OcrInventoryCatalogResource<T extends OcrCatalogResourceIdentity = OcrCatalogResourceIdentity> = T & {
  inventoryUid: string;
};

/**
 * Mirrors the OCR catalog identity contract: item UIDs stay unchanged and a
 * non-item resource is type-prefixed only when its source UID collides.
 */
export function buildOcrInventoryCatalogResources<T extends OcrCatalogResourceIdentity>(
  resources: T[],
): Array<OcrInventoryCatalogResource<T>> {
  const typesByUid = new Map<string, Set<string>>();
  for (const resource of resources) {
    const types = typesByUid.get(resource.uid) ?? new Set<string>();
    types.add(resource.type);
    typesByUid.set(resource.uid, types);
  }

  return resources.map((resource) => ({
    ...resource,
    inventoryUid:
      resource.type === "item" || (typesByUid.get(resource.uid)?.size ?? 0) <= 1
        ? resource.uid
        : `${resource.type}:${resource.uid}`,
  }));
}

export function parseOcrInventoryResourceUid(inventoryUid: string): {
  inventoryUid: string;
  sourceUid: string;
  resourceType: string | null;
} {
  const separator = inventoryUid.indexOf(":");
  if (separator <= 0 || separator === inventoryUid.length - 1) {
    return { inventoryUid, sourceUid: inventoryUid, resourceType: null };
  }
  return {
    inventoryUid,
    sourceUid: inventoryUid.slice(separator + 1),
    resourceType: inventoryUid.slice(0, separator),
  };
}
