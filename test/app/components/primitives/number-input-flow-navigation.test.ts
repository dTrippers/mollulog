import { describe, expect, it } from "@jest/globals";
import {
  findNumberInputFlowNavigationTargetIndex,
  type NumberInputFlowNavigationRect,
} from "../../../../app/components/primitives/useNumberInputFlowNavigation";

function rect(left: number, top: number, width = 40, height = 20): NumberInputFlowNavigationRect {
  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
  };
}

describe("findNumberInputFlowNavigationTargetIndex", () => {
  it("moves left and right within the same visual row", () => {
    const rects = [rect(0, 0), rect(50, 0), rect(100, 0), rect(0, 40)];

    expect(findNumberInputFlowNavigationTargetIndex(rects, 1, "left")).toBe(0);
    expect(findNumberInputFlowNavigationTargetIndex(rects, 1, "right")).toBe(2);
  });

  it("stops horizontal navigation at visual row edges", () => {
    const rects = [rect(0, 0), rect(50, 0), rect(100, 0), rect(0, 40)];

    expect(findNumberInputFlowNavigationTargetIndex(rects, 0, "left")).toBeNull();
    expect(findNumberInputFlowNavigationTargetIndex(rects, 2, "right")).toBeNull();
  });

  it("moves down to the closest x position when wrapped rows have different cell counts", () => {
    const rects = [rect(0, 0), rect(60, 0), rect(120, 0), rect(20, 40), rect(100, 40)];

    expect(findNumberInputFlowNavigationTargetIndex(rects, 2, "down")).toBe(4);
    expect(findNumberInputFlowNavigationTargetIndex(rects, 1, "down")).toBe(3);
  });

  it("selects the nearest visual row before choosing the nearest x position", () => {
    const rects = [rect(0, 0), rect(60, 0), rect(0, 50), rect(60, 50), rect(120, 170), rect(180, 170)];

    expect(findNumberInputFlowNavigationTargetIndex(rects, 1, "down")).toBe(3);
    expect(findNumberInputFlowNavigationTargetIndex(rects, 3, "down")).toBe(4);
  });

  it("stops vertical navigation at the first and last visual rows", () => {
    const rects = [rect(0, 0), rect(50, 0), rect(0, 40), rect(50, 40)];

    expect(findNumberInputFlowNavigationTargetIndex(rects, 0, "up")).toBeNull();
    expect(findNumberInputFlowNavigationTargetIndex(rects, 3, "down")).toBeNull();
  });

  it("treats vertically overlapping cells as the same visual row", () => {
    const rects = [rect(0, 0, 40, 24), rect(50, 3, 40, 18), rect(0, 44, 40, 20)];

    expect(findNumberInputFlowNavigationTargetIndex(rects, 0, "right")).toBe(1);
    expect(findNumberInputFlowNavigationTargetIndex(rects, 1, "down")).toBe(2);
  });
});
