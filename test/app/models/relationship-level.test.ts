import { describe, expect, it } from "@jest/globals";
import { resolveRelationshipLevelInput } from "../../../app/models/relationship-level";

describe("relationship-level", () => {
  it("returns null when both current and target levels are empty", () => {
    expect(resolveRelationshipLevelInput(null, { currentLevel: null, targetLevel: null })).toBeNull();
  });

  it("defaults the target level to the current level", () => {
    expect(resolveRelationshipLevelInput(null, { currentLevel: 20, targetLevel: null })).toEqual({
      currentLevel: 20,
      currentExp: null,
      targetLevel: 20,
    });
  });

  it("defaults the current level to 1 when only the target level is provided", () => {
    expect(resolveRelationshipLevelInput(null, { currentLevel: null, targetLevel: 50 })).toEqual({
      currentLevel: 1,
      currentExp: null,
      targetLevel: 50,
    });
  });

  it("keeps current exp when the current level stays the same", () => {
    expect(
      resolveRelationshipLevelInput({ currentLevel: 15, currentExp: 1234 }, { currentLevel: 15, targetLevel: 30 }),
    ).toEqual({
      currentLevel: 15,
      currentExp: 1234,
      targetLevel: 30,
    });
  });

  it("clears current exp when the current level changes", () => {
    expect(
      resolveRelationshipLevelInput({ currentLevel: 15, currentExp: 1234 }, { currentLevel: 16, targetLevel: 30 }),
    ).toEqual({
      currentLevel: 16,
      currentExp: null,
      targetLevel: 30,
    });
  });

  it("rejects target levels below current levels", () => {
    expect(() => resolveRelationshipLevelInput(null, { currentLevel: 40, targetLevel: 39 })).toThrow(
      "목표 인연 랭크는 현재 인연 랭크보다 낮을 수 없어요",
    );
  });
});
