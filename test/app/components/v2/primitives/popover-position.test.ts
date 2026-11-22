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

  it("stays above when requested even if there is room below", () => {
    const position = getPopoverPosition({
      anchor: { top: 300, bottom: 340, left: 300 },
      panel,
      viewport,
      placement: "above",
    });

    expect(position).toEqual({ top: 92, left: 300, placement: "above" });
  });

  it("clamps a requested above placement to the viewport margin", () => {
    const position = getPopoverPosition({
      anchor: { top: 60, bottom: 100, left: 300 },
      panel,
      viewport,
      placement: "above",
    });

    expect(position).toEqual({ top: 8, left: 300, placement: "above" });
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

  it("flips above when the bottom bar leaves no room below", () => {
    const position = getPopoverPosition({
      anchor: { top: 400, bottom: 440, left: 300 },
      panel,
      viewport,
      insets: { top: 0, bottom: 60 },
    });

    // Without the bar, 700 - 8 - 448 = 244 fits the 200px panel below. With it, 184 does not.
    expect(position).toEqual({ top: 192, left: 300, placement: "above" });
  });

  it("keeps a panel above the trigger below the top bar", () => {
    const position = getPopoverPosition({
      anchor: { top: 120, bottom: 160, left: 300 },
      panel,
      viewport,
      insets: { top: 50, bottom: 60 },
      placement: "above",
    });

    expect(position.top).toBe(58);
  });

  it("keeps a panel that fits neither side between the bars", () => {
    const position = getPopoverPosition({
      anchor: { top: 300, bottom: 340, left: 300 },
      panel: { width: 288, height: 500 },
      viewport,
      insets: { top: 50, bottom: 60 },
    });

    expect(position.top).toBeGreaterThanOrEqual(58);
    expect(position.top + 500).toBeLessThanOrEqual(700 - 60 - 8);
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
