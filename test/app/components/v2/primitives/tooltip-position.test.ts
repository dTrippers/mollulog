import { describe, expect, it } from "@jest/globals";
import { getTooltipPosition } from "~/components/v2/primitives/tooltip-position";

const viewport = { width: 390 };
const tooltip = { width: 120, height: 24 };

describe("getTooltipPosition", () => {
  it("centers the tooltip 8px above the trigger", () => {
    const position = getTooltipPosition({ anchor: { top: 300, bottom: 340, left: 100, width: 40 }, tooltip, viewport });

    expect(position).toEqual({ top: 268, left: 60, placement: "above", arrowLeft: 60 });
  });

  it("flips below the trigger when it does not fit above", () => {
    const position = getTooltipPosition({ anchor: { top: 20, bottom: 60, left: 100, width: 40 }, tooltip, viewport });

    expect(position.placement).toBe("below");
    expect(position.top).toBe(68);
  });

  it("keeps the tooltip 8px inside the viewport and points the arrow at the trigger", () => {
    const nearLeft = getTooltipPosition({ anchor: { top: 300, bottom: 340, left: 10, width: 40 }, tooltip, viewport });
    expect(nearLeft.left).toBe(8);
    expect(nearLeft.arrowLeft).toBe(22);

    const nearRight = getTooltipPosition({
      anchor: { top: 300, bottom: 340, left: 360, width: 20 },
      tooltip,
      viewport,
    });
    expect(nearRight.left).toBe(262);
    expect(nearRight.arrowLeft).toBe(108);
  });

  it("keeps the arrow off the rounded corners", () => {
    const position = getTooltipPosition({ anchor: { top: 300, bottom: 340, left: 0, width: 4 }, tooltip, viewport });

    expect(position.left).toBe(8);
    expect(position.arrowLeft).toBe(8);
  });
});
