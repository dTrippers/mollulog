import { describe, expect, it } from "@jest/globals";
import { normalizeDesktopNavigationExpandedGroups } from "~/domain/desktop-navigation-preference";

describe("desktop navigation preference normalization", () => {
  it("supports cookies without the new group field", () => {
    expect(normalizeDesktopNavigationExpandedGroups(undefined)).toBeUndefined();
    expect(normalizeDesktopNavigationExpandedGroups(null)).toBeUndefined();
  });

  it("retains explicit states for collapsible groups and drops favorites, unknown, or non-boolean values", () => {
    expect(
      normalizeDesktopNavigationExpandedGroups({
        favorites: false,
        game: true,
        planner: "open",
        oldSection: true,
      }),
    ).toEqual({ game: true });
  });

  it("returns no preference when the object contains no valid group state", () => {
    expect(normalizeDesktopNavigationExpandedGroups({ service: true, planner: null })).toBeUndefined();
  });
});
