import { describe, expect, it } from "@jest/globals";
import {
  defaultContentFilterState,
  normalizeContentFilterState,
} from "../../../../../app/components/features/futures/content-filter-state";

describe("content-filter-state", () => {
  it("returns the default filter for malformed saved values", () => {
    expect(normalizeContentFilterState(null)).toEqual(defaultContentFilterState);
    expect(normalizeContentFilterState("pickup")).toEqual(defaultContentFilterState);
    expect(normalizeContentFilterState({})).toEqual(defaultContentFilterState);
  });

  it("migrates the legacy exercise type to joint firing drill", () => {
    expect(
      normalizeContentFilterState({
        types: ["exercise"],
        onlyPickups: true,
      }),
    ).toEqual({
      types: ["joint_firing_drill"],
      onlyPickups: true,
    });
  });

  it("drops unsupported types and deduplicates the remaining values", () => {
    expect(
      normalizeContentFilterState({
        types: ["live", "event", "event", "raid", "unknown", "allied", "mini_story"],
        onlyPickups: "true",
      }),
    ).toEqual({
      types: ["live", "event", "allied", "mini_story"],
      onlyPickups: false,
    });
  });
});
