export const MENU_BADGE_MAX_LABEL_LENGTH = 12;

// Keep these stable IDs aligned with the menu catalog. Admin mirrors both the
// IDs and Korean display names from app/components/features/layout/navigation-menu.ts.
export const NAVIGATION_MENU_IDS = [
  "home",
  "futures",
  "events",
  "raids",
  "students",
  "main-story",
  "furniture-catalog",
  "coupons",
  "pyroxene-planner",
  "student-growth-planner",
  "resource-planner",
  "farming-calculator",
  "event-shop-calculator",
  "relationship-calculator",
  "raid-score-calculator",
  "community-feed",
  "community-timelines",
  "profile",
  "my-students",
  "pickup-history",
  "favorite-students",
  "my-walkthroughs",
  "screen-scanner",
  "external-data",
  "news",
  "contact",
] as const;

export type NavigationMenuId = (typeof NAVIGATION_MENU_IDS)[number];
export type MenuBadgeLabelMode = "auto" | "custom" | "hidden";
export type MenuBadgeRedDotMode = "auto" | "show" | "hidden";

export type StoredMenuBadge = {
  menuId: string;
  labelMode: MenuBadgeLabelMode;
  label: string | null;
  redDotMode: MenuBadgeRedDotMode;
  startsAt: string | null;
  endsAt: string | null;
};

export type ResolvedMenuBadgeOverride = {
  menuId: NavigationMenuId;
  labelMode: MenuBadgeLabelMode;
  label: string | null;
  redDotMode: MenuBadgeRedDotMode;
};

export type MenuBadgeWarning = {
  menuId: string;
  reason: "unknown-menu" | "invalid-period" | "invalid-label" | "invalid-mode";
};

const navigationMenuIdSet = new Set<string>(NAVIGATION_MENU_IDS);

export function isNavigationMenuId(value: unknown): value is NavigationMenuId {
  return typeof value === "string" && navigationMenuIdSet.has(value);
}

export function isValidMenuBadgeLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && [...value].length <= MENU_BADGE_MAX_LABEL_LENGTH;
}

export function isValidMenuBadgeDateRange(startsAt: string | null, endsAt: string | null): boolean {
  const start = startsAt ? Date.parse(startsAt) : null;
  const end = endsAt ? Date.parse(endsAt) : null;
  if (start !== null && !Number.isFinite(start)) return false;
  if (end !== null && !Number.isFinite(end)) return false;
  return start === null || end === null || end > start;
}

export function isMenuBadgeActive(
  badge: Pick<StoredMenuBadge, "startsAt" | "endsAt">,
  now: string | Date,
): boolean {
  const instant = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(instant)) return false;
  const startsAt = badge.startsAt ? Date.parse(badge.startsAt) : Number.NEGATIVE_INFINITY;
  const endsAt = badge.endsAt ? Date.parse(badge.endsAt) : Number.POSITIVE_INFINITY;
  if (!(Number.isFinite(startsAt) || startsAt === Number.NEGATIVE_INFINITY)) return false;
  if (!(Number.isFinite(endsAt) || endsAt === Number.POSITIVE_INFINITY)) return false;
  return startsAt <= instant && instant < endsAt;
}

/**
 * Resolve schedule eligibility and guard persisted data before any user-facing
 * label is rendered. Label and red-dot settings remain independent.
 */
export function resolveMenuBadgeOverrides(
  badges: readonly StoredMenuBadge[],
  now: string | Date = new Date(),
): { overrides: Partial<Record<NavigationMenuId, ResolvedMenuBadgeOverride>>; warnings: MenuBadgeWarning[] } {
  const overrides: Partial<Record<NavigationMenuId, ResolvedMenuBadgeOverride>> = {};
  const warnings: MenuBadgeWarning[] = [];

  for (const badge of badges) {
    if (!isNavigationMenuId(badge.menuId)) {
      warnings.push({ menuId: badge.menuId, reason: "unknown-menu" });
      continue;
    }

    if (!isValidMenuBadgeDateRange(badge.startsAt, badge.endsAt)) {
      warnings.push({ menuId: badge.menuId, reason: "invalid-period" });
      continue;
    }

    let labelMode = badge.labelMode;
    let label = badge.label;
    if (!(["auto", "custom", "hidden"] as const).includes(labelMode)) {
      warnings.push({ menuId: badge.menuId, reason: "invalid-mode" });
      labelMode = "auto";
      label = null;
    } else if (labelMode === "custom" && !isValidMenuBadgeLabel(label)) {
      warnings.push({ menuId: badge.menuId, reason: "invalid-label" });
      labelMode = "auto";
      label = null;
    } else if (labelMode !== "custom" && label !== null) {
      warnings.push({ menuId: badge.menuId, reason: "invalid-label" });
      labelMode = "auto";
      label = null;
    }

    let redDotMode = badge.redDotMode;
    if (!(["auto", "show", "hidden"] as const).includes(redDotMode)) {
      warnings.push({ menuId: badge.menuId, reason: "invalid-mode" });
      redDotMode = "auto";
    }

    if (!isMenuBadgeActive(badge, now)) continue;

    overrides[badge.menuId] = {
      menuId: badge.menuId,
      labelMode,
      label,
      redDotMode,
    };
  }

  return { overrides, warnings };
}

export function applyMenuBadgeOverride(
  menuId: NavigationMenuId,
  automatic: { label?: string; showRedDot?: boolean },
  override?: ResolvedMenuBadgeOverride,
): { label?: string; showRedDot: boolean } {
  const matchingOverride = override?.menuId === menuId ? override : undefined;
  return {
    label:
      matchingOverride?.labelMode === "hidden"
        ? undefined
        : matchingOverride?.labelMode === "custom"
          ? matchingOverride.label ?? undefined
          : automatic.label,
    showRedDot:
      matchingOverride?.redDotMode === "show"
        ? true
        : matchingOverride?.redDotMode === "hidden"
          ? false
          : automatic.showRedDot ?? false,
  };
}
