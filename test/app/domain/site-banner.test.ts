import { describe, expect, it } from "@jest/globals";
import {
  getSiteBannerPageScreen,
  isValidSiteBannerLink,
  type SiteBanner,
  selectActiveSiteBanner,
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
  it("uses a half-open active period", () => {
    const item = banner("banner", "2026-08-01T00:00:00.000Z", "2026-08-01T01:00:00.000Z");

    expect(selectActiveSiteBanner([item], "2026-08-01T00:00:00.000Z")?.uid).toBe("banner");
    expect(selectActiveSiteBanner([item], "2026-08-01T00:59:59.999Z")?.uid).toBe("banner");
    expect(selectActiveSiteBanner([item], "2026-08-01T01:00:00.000Z")).toBeNull();
  });

  it("orders accidental overlaps by earliest end and then UID", () => {
    const sameEndA = banner("a", "2026-08-01T00:00:00.000Z", "2026-08-01T02:00:00.000Z");
    const sameEndB = banner("b", "2026-08-01T00:00:00.000Z", "2026-08-01T02:00:00.000Z");
    const earlierEnd = banner("z", "2026-08-01T00:00:00.000Z", "2026-08-01T01:00:00.000Z");

    expect(selectActiveSiteBanner([sameEndB, earlierEnd, sameEndA], "2026-08-01T00:30:00.000Z")?.uid).toBe("z");
    expect(selectActiveSiteBanner([sameEndB, sameEndA], "2026-08-01T00:30:00.000Z")?.uid).toBe("a");
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
