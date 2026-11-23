import { describe, expect, it } from "@jest/globals";
import { mergeGrowthStudentUpdate } from "~/routes/utils.growth._components/growth-student-update";
import type { GrowthStudent } from "~/routes/utils.growth._components/types";

const base = {
  uid: "student-1",
  plannerPosition: 2,
  tier: 3,
  resourceRequirements: { items: [], characterExp: 10, credit: 20 },
} as unknown as GrowthStudent;

describe("growth student update", () => {
  it("keeps the position the screen holds when a response read before a move arrives", () => {
    const moved = { ...base, plannerPosition: 0 };
    const response = { ...base, tier: 4, plannerPosition: 2, resourceRequirements: null };

    const merged = mergeGrowthStudentUpdate(moved, response);

    expect(merged.plannerPosition).toBe(0);
    expect(merged.tier).toBe(4);
    expect(merged.resourceRequirements).toEqual(base.resourceRequirements);
  });
});
