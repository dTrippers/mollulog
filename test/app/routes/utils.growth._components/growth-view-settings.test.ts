import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_GROWTH_VIEW_SETTINGS,
  normalizeGrowthViewSettings,
  readLegacyGrowthSortOrder,
} from "~/routes/utils.growth._components/growth-view-settings";

describe("growth planner view settings", () => {
  it("keeps a valid stored setting", () => {
    expect(normalizeGrowthViewSettings({ sortOrder: "name", showNumberInputShortcuts: false })).toEqual({
      showNumberInputShortcuts: false,
    });
  });

  it("falls back for an invalid setting", () => {
    expect(normalizeGrowthViewSettings({ showNumberInputShortcuts: "false" })).toEqual(DEFAULT_GROWTH_VIEW_SETTINGS);
  });

  it("reads the sort choice stored on the device before it moved to the account", () => {
    expect(readLegacyGrowthSortOrder({ sortOrder: "name", showNumberInputShortcuts: true })).toBe("name");
    expect(readLegacyGrowthSortOrder({ sortOrder: "unknown" })).toBeNull();
    // The 1.x default was written on every visit, so it is not a choice.
    expect(readLegacyGrowthSortOrder({ sortOrder: "planner-newest", showNumberInputShortcuts: true })).toBeNull();
    expect(readLegacyGrowthSortOrder({ showNumberInputShortcuts: true })).toBeNull();
    expect(readLegacyGrowthSortOrder(null)).toBeNull();
  });
});
