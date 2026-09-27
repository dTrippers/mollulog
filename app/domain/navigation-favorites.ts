export const MAX_NAVIGATION_FAVORITE_IDS = 32;
const MAX_NAVIGATION_FAVORITE_ID_LENGTH = 64;

export type NavigationFavoriteItem = {
  favoriteId?: string;
  legacyFavoriteIds?: readonly string[];
  menuId?: string;
  disabled?: boolean;
};

const favoriteAliases: Record<string, readonly string[]> = {
  "scanner-resource": ["connect-import"],
  "connect-import": ["scanner-resource"],
};

export function normalizeNavigationFavoriteIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    if (typeof candidate !== "string") {
      continue;
    }

    const id = candidate.trim();
    if (!id || id.length > MAX_NAVIGATION_FAVORITE_ID_LENGTH || seen.has(id)) {
      continue;
    }

    normalized.push(id);
    seen.add(id);

    if (normalized.length >= MAX_NAVIGATION_FAVORITE_IDS) {
      break;
    }
  }

  return normalized;
}

export function toggleNavigationFavoriteId(value: unknown, favoriteId: string): string[] {
  const normalized = normalizeNavigationFavoriteIds(value);
  const aliases = new Set([favoriteId, ...(favoriteAliases[favoriteId] ?? [])]);
  const index = normalized.findIndex((id) => aliases.has(id));

  if (index >= 0) {
    return normalized.filter((id) => !aliases.has(id));
  }

  if (normalized.length >= MAX_NAVIGATION_FAVORITE_IDS) {
    return normalized;
  }

  return [...normalized, favoriteId];
}

export function getAvailableNavigationFavorites<T extends NavigationFavoriteItem>(
  favoriteIds: unknown,
  items: readonly T[],
): T[] {
  const availableItems = new Map<string, T & { favoriteId: string }>();
  for (const item of items) {
    if (!item.favoriteId || item.disabled === true) continue;
    for (const id of [item.favoriteId, ...(item.legacyFavoriteIds ?? [])]) {
      availableItems.set(id, item as T & { favoriteId: string });
    }
  }

  const result: (T & { favoriteId: string })[] = [];
  const seenItems = new Set<string>();
  for (const id of normalizeNavigationFavoriteIds(favoriteIds)) {
    const item = availableItems.get(id);
    if (!item) continue;
    const itemKey = item.menuId ?? item.favoriteId;
    if (seenItems.has(itemKey)) continue;
    seenItems.add(itemKey);
    result.push({ ...item, favoriteId: id });
  }
  return result;
}
