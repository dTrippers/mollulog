export const DESKTOP_NAVIGATION_PREFERENCE_GROUP_IDS = [
  "game",
  "planner",
  "community",
  "personal",
  "news",
] as const;

export type DesktopNavigationPreferenceGroupId = (typeof DESKTOP_NAVIGATION_PREFERENCE_GROUP_IDS)[number];
export type DesktopNavigationExpandedGroups = Partial<Record<DesktopNavigationPreferenceGroupId, boolean>>;

const groupIdSet = new Set<string>(DESKTOP_NAVIGATION_PREFERENCE_GROUP_IDS);

export function normalizeDesktopNavigationExpandedGroups(value: unknown): DesktopNavigationExpandedGroups | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const parsed = value as Record<string, unknown>;
  const normalized: DesktopNavigationExpandedGroups = {};
  for (const [id, expanded] of Object.entries(parsed)) {
    if (groupIdSet.has(id) && typeof expanded === "boolean") {
      normalized[id as DesktopNavigationPreferenceGroupId] = expanded;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
