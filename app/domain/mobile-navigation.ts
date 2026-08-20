export const MOBILE_NAVIGATION_IDS = [
  "feed",
  "students",
  "events",
  "raids",
  "main-story",
  "pyroxene-planner",
  "student-growth-planner",
  "resource-planner",
  "event-shop-calculator",
  "relationship-calculator",
  "strategy-timeline",
  "raid-score-calculator",
] as const;

export type MobileNavigationId = (typeof MOBILE_NAVIGATION_IDS)[number];
export type MobileNavigationPair = [MobileNavigationId, MobileNavigationId];

export const DEFAULT_MOBILE_NAVIGATION_IDS: MobileNavigationPair = ["feed", "students"];

const mobileNavigationIdSet = new Set<string>(MOBILE_NAVIGATION_IDS);

export function isMobileNavigationId(value: unknown): value is MobileNavigationId {
  return typeof value === "string" && mobileNavigationIdSet.has(value);
}

export function normalizeMobileNavigationIds(value: unknown): MobileNavigationPair {
  if (!Array.isArray(value) || value.length !== 2) {
    return [...DEFAULT_MOBILE_NAVIGATION_IDS];
  }

  const [first, second] = value;
  if (!isMobileNavigationId(first) || !isMobileNavigationId(second) || first === second) {
    return [...DEFAULT_MOBILE_NAVIGATION_IDS];
  }

  return [first, second];
}
