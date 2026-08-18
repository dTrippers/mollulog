import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_MOBILE_NAVIGATION_IDS,
  isMobileNavigationPair,
  normalizeMobileNavigationIds,
} from "~/domain/mobile-navigation";

describe("mobile navigation preference", () => {
  it("uses feed and students as the default ordered pair", () => {
    expect(normalizeMobileNavigationIds(undefined)).toEqual(DEFAULT_MOBILE_NAVIGATION_IDS);
  });

  it("keeps a valid pair in its explicit order", () => {
    expect(normalizeMobileNavigationIds(["events", "raid-score-calculator"])).toEqual([
      "events",
      "raid-score-calculator",
    ]);
  });

  it.each([
    undefined,
    null,
    [],
    ["events"],
    ["events", "events"],
    ["events", "unknown"],
    ["events", "students", "raids"],
  ])("restores the default pair for invalid value %j", (value) => {
    expect(normalizeMobileNavigationIds(value)).toEqual(DEFAULT_MOBILE_NAVIGATION_IDS);
    expect(isMobileNavigationPair(value)).toBe(false);
  });

  it("recognizes only valid, distinct two-item pairs", () => {
    expect(isMobileNavigationPair(["feed", "students"])).toBe(true);
    expect(isMobileNavigationPair(["feed", "feed"])).toBe(false);
    expect(isMobileNavigationPair(["feed", "students", "events"])).toBe(false);
  });
});
