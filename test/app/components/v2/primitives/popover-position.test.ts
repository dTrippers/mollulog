import { describe, expect, it } from "@jest/globals";
import { getPopoverPosition } from "~/components/v2/primitives/popover-position";

const viewport = { width: 1024, height: 700 };
const panel = { width: 288, height: 200 };

describe("getPopoverPosition", () => {
  it("opens below the trigger, aligned to its left edge, with the gap", () => {
    const position = getPopoverPosition({
      anchor: { top: 100, bottom: 140, left: 300 },
      panel,
      viewport,
    });

    expect(position).toEqual({ top: 148, left: 300, placement: "below" });
  });

  it("flips above when the panel does not fit below but fits above", () => {
    const position = getPopoverPosition({
      anchor: { top: 600, bottom: 640, left: 300 },
      panel,
      viewport,
    });

    expect(position).toEqual({ top: 392, left: 300, placement: "above" });
  });

  it("stays below when neither side fits, if below has more room", () => {
    const position = getPopoverPosition({
      anchor: { top: 60, bottom: 640, left: 300 },
      panel: { width: 288, height: 900 },
      viewport,
    });

    expect(position.placement).toBe("below");
    expect(position.top).toBe(8);
  });

  it("clamps the left edge inside the right viewport edge", () => {
    const position = getPopoverPosition({
      anchor: { top: 100, bottom: 140, left: 900 },
      panel,
      viewport,
    });

    expect(position.left).toBe(1024 - 8 - 288);
  });

  it("clamps the left edge inside the left viewport edge", () => {
    const position = getPopoverPosition({
      anchor: { top: 100, bottom: 140, left: -20 },
      panel,
      viewport,
    });

    expect(position.left).toBe(8);
  });
});
