import { describe, expect, it } from "@jest/globals";
import {
  addDismissedSiteBannerUid,
  excludeDismissedSiteBanner,
  getSiteBannerPageScreen,
  isSiteBannerActive,
  isSiteBannerPreset,
  isValidSiteBannerLink,
  MAX_DISMISSED_SITE_BANNER_UIDS,
  normalizeDismissedSiteBannerUids,
  type SiteBanner,
  shouldRenderGlobalSiteBanner,
} from "~/domain/site-banner";

function banner(uid: string, startsAt: string, endsAt: string, screens = ["desktop_navigation"]): SiteBanner {
  return {
    uid,
    message: uid,
    colorPreset: "blue",
    link: "/news",
    screens: screens as SiteBanner["screens"],
    startsAt,
    endsAt,
    createdAt: startsAt,
    updatedAt: startsAt,
  };
}

describe("site banner domain", () => {
  it("recognizes the pink preset", () => {
    expect(isSiteBannerPreset("pink")).toBe(true);
  });

  it("uses a half-open active period", () => {
    const item = banner("banner", "2026-08-01T00:00:00.000Z", "2026-08-01T01:00:00.000Z");

    expect(isSiteBannerActive(item, "2026-08-01T00:00:00.000Z")).toBe(true);
    expect(isSiteBannerActive(item, "2026-08-01T00:59:59.999Z")).toBe(true);
    expect(isSiteBannerActive(item, "2026-08-01T01:00:00.000Z")).toBe(false);
  });

  it("recognizes only allowed link forms", () => {
    expect(isValidSiteBannerLink("/")).toBe(true);
    expect(isValidSiteBannerLink("/community?type=guide")).toBe(true);
    expect(isValidSiteBannerLink("https://example.com/news")).toBe(true);
    expect(isValidSiteBannerLink("//example.com")).toBe(false);
    expect(isValidSiteBannerLink("http://example.com")).toBe(false);
    expect(isValidSiteBannerLink("javascript:alert(1)")).toBe(false);
  });

  it("lets a selected page slot replace a matching global slot", () => {
    const pageBanner = banner("banner", "2026-08-01T00:00:00.000Z", "2026-08-01T01:00:00.000Z", [
      "desktop_navigation",
      "futures_top",
    ]);

    expect(getSiteBannerPageScreen("/futures")).toBe("futures_top");
    expect(shouldRenderGlobalSiteBanner(pageBanner, "desktop_navigation", "/futures")).toBe(false);
    expect(shouldRenderGlobalSiteBanner(pageBanner, "desktop_navigation", "/community")).toBe(true);
  });
});

describe("dismissed site banner uids", () => {
  it("drops invalid entries and duplicates", () => {
    expect(normalizeDismissedSiteBannerUids(undefined)).toEqual([]);
    expect(normalizeDismissedSiteBannerUids(["a", "", 1, "a", "b", "x".repeat(65)])).toEqual(["a", "b"]);
  });

  it("appends a new uid and moves a repeated one to the end", () => {
    expect(addDismissedSiteBannerUid(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(addDismissedSiteBannerUid(["a", "b"], "a")).toEqual(["b", "a"]);
    expect(addDismissedSiteBannerUid(["a"], 42)).toEqual(["a"]);
  });

  it("keeps only the most recent dismissals", () => {
    const uids = Array.from({ length: MAX_DISMISSED_SITE_BANNER_UIDS }, (_, index) => `banner-${index}`);
    const next = addDismissedSiteBannerUid(uids, "latest");

    expect(next).toHaveLength(MAX_DISMISSED_SITE_BANNER_UIDS);
    expect(next[0]).toBe("banner-1");
    expect(next.at(-1)).toBe("latest");
  });
});

describe("excludeDismissedSiteBanner", () => {
  it("drops only a banner whose uid was dismissed", () => {
    const item = { uid: "banner" };

    expect(excludeDismissedSiteBanner(item, ["banner"])).toBeNull();
    expect(excludeDismissedSiteBanner(item, ["other"])).toBe(item);
    expect(excludeDismissedSiteBanner(item, undefined)).toBe(item);
    expect(excludeDismissedSiteBanner(null, ["banner"])).toBeNull();
  });
});
