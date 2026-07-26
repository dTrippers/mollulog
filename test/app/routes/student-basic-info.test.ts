import { describe, expect, it } from "@jest/globals";
import { StudentSkillSelectionCondition } from "~/graphql/graphql";
import {
  getAbilityReleaseDisabledReason,
  getSkillSelectionConditionLabel,
} from "~/routes/students.$id._components/StudentBasicInfo";

describe("student basic info ability release", () => {
  it("prioritizes the weapon tier requirement", () => {
    expect(getAbilityReleaseDisabledReason(5)).toBe("고유무기 1성부터 능력 개방을 설정할 수 있어요");
  });

  it("enables every ability release stat after equipping the unique weapon", () => {
    expect(getAbilityReleaseDisabledReason(6)).toBeNull();
  });
});

describe("student skill selection condition", () => {
  it.each([
    [StudentSkillSelectionCondition.Enemy, "적에게 사용 시"],
    [StudentSkillSelectionCondition.Self, "자신에게 사용 시"],
  ])("translates %s into an in-game style label", (condition, expected) => {
    expect(getSkillSelectionConditionLabel(condition)).toBe(expected);
  });
});
