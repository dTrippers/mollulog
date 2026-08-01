import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_GROWTH_VIEW_SETTINGS,
  normalizeGrowthViewSettings,
} from "~/routes/utils.growth._components/growth-view-settings";

describe("growth planner view settings", () => {
  it("keeps valid stored settings", () => {
    expect(
      normalizeGrowthViewSettings({
        sortOrder: "name",
        showNumberInputShortcuts: false,
      }),
    ).toEqual({
      sortOrder: "name",
      showNumberInputShortcuts: false,
    });
  });

  it("falls back per invalid setting", () => {
    expect(
      normalizeGrowthViewSettings({
        sortOrder: "unknown",
        showNumberInputShortcuts: "false",
      }),
    ).toEqual(DEFAULT_GROWTH_VIEW_SETTINGS);
  });
});
