export const SITE_BANNER_PRESETS = ["red", "green", "blue", "pink", "black"] as const;
export type SiteBannerPreset = (typeof SITE_BANNER_PRESETS)[number];

export const SITE_BANNER_SCREENS = ["desktop_navigation", "mobile_header", "futures_top", "community_top"] as const;
export type SiteBannerScreen = (typeof SITE_BANNER_SCREENS)[number];

export type SiteBanner = {
  uid: string;
  message: string;
  colorPreset: SiteBannerPreset;
  link: string;
  screens: SiteBannerScreen[];
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
};

export function isSiteBannerPreset(value: string): value is SiteBannerPreset {
  return SITE_BANNER_PRESETS.includes(value as SiteBannerPreset);
}

export function isSiteBannerScreen(value: string): value is SiteBannerScreen {
  return SITE_BANNER_SCREENS.includes(value as SiteBannerScreen);
}

export function isValidSiteBannerLink(value: string): boolean {
  const link = value.trim();
  if (link === "/" || (link.startsWith("/") && !link.startsWith("//"))) {
    return true;
  }

  if (!link.startsWith("https://")) {
    return false;
  }

  try {
    const url = new URL(link);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function getSiteBannerPageScreen(
  pathname: string,
): Extract<SiteBannerScreen, "futures_top" | "community_top"> | null {
  if (pathname === "/futures") {
    return "futures_top";
  }

  if (pathname === "/community") {
    return "community_top";
  }

  return null;
}

export function shouldRenderGlobalSiteBanner(
  banner: Pick<SiteBanner, "screens"> | null | undefined,
  screen: Extract<SiteBannerScreen, "desktop_navigation" | "mobile_header">,
  pathname: string,
): boolean {
  if (!banner?.screens.includes(screen)) {
    return false;
  }

  const pageScreen = getSiteBannerPageScreen(pathname);
  return pageScreen === null || !banner.screens.includes(pageScreen);
}

export function isSiteBannerActive(banner: Pick<SiteBanner, "startsAt" | "endsAt">, now: string | Date): boolean {
  const nowMs = toTimestamp(now);
  return toTimestamp(banner.startsAt) <= nowMs && nowMs < toTimestamp(banner.endsAt);
}

function toTimestamp(value: string | Date): number {
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

// Only one banner runs at a time and dismissed banners expire on their own, so a short history is enough to keep
// the preference cookie small.
export const MAX_DISMISSED_SITE_BANNER_UIDS = 20;
const MAX_SITE_BANNER_UID_LENGTH = 64;

function isSiteBannerUid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_SITE_BANNER_UID_LENGTH;
}

export function normalizeDismissedSiteBannerUids(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uids = [...new Set(value.filter(isSiteBannerUid))];
  return uids.slice(-MAX_DISMISSED_SITE_BANNER_UIDS);
}

export function addDismissedSiteBannerUid(current: readonly string[], uid: unknown): string[] {
  if (!isSiteBannerUid(uid)) {
    return normalizeDismissedSiteBannerUids(current);
  }

  return normalizeDismissedSiteBannerUids([...current.filter((existing) => existing !== uid), uid]);
}
