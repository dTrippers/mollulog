export const MAX_NAVIGATION_FAVORITE_IDS = 32;
const MAX_NAVIGATION_FAVORITE_ID_LENGTH = 64;

export type NavigationFavoriteItem = {
  favoriteId?: string;
  disabled?: boolean;
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
  const index = normalized.indexOf(favoriteId);

  if (index >= 0) {
    return normalized.filter((id) => id !== favoriteId);
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
  const availableItems = new Map(
    items
      .filter((item): item is T & { favoriteId: string } => Boolean(item.favoriteId) && item.disabled !== true)
      .map((item) => [item.favoriteId, item]),
  );

  return normalizeNavigationFavoriteIds(favoriteIds).flatMap((id) => {
    const item = availableItems.get(id);
    return item ? [item] : [];
  });
}
