import { describe, expect, it } from "@jest/globals";
import { findNumberInputGridVerticalTarget } from "../../../../app/components/primitives/useNumberInputGridNavigation";

const inputs = [
  { id: "first-current-relationship", rowIndex: 0, columnIndex: 0 },
  { id: "first-current-skill", rowIndex: 0, columnIndex: 4 },
  { id: "first-target-relationship", rowIndex: 1, columnIndex: 0 },
  { id: "first-target-skill", rowIndex: 1, columnIndex: 4 },
  { id: "second-current-relationship", rowIndex: 2, columnIndex: 0 },
  { id: "second-target-relationship", rowIndex: 3, columnIndex: 0 },
  { id: "second-target-skill", rowIndex: 3, columnIndex: 4 },
];

describe("findNumberInputGridVerticalTarget", () => {
  it("skips a row without the current column", () => {
    expect(findNumberInputGridVerticalTarget(inputs, 1, 4, "down")?.id).toBe("second-target-skill");
  });

  it("keeps vertical movement in the current column", () => {
    expect(findNumberInputGridVerticalTarget(inputs, 1, 0, "down")?.id).toBe("second-current-relationship");
  });
});
