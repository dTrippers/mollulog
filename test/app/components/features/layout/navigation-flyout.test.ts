import { describe, expect, it } from "@jest/globals";
import { getInitialNavigationFlyoutPosition } from "~/components/features/layout/NavigationFlyout";

describe("rail flyout initial position", () => {
  it("places the first rendered position next to the anchor without a top-of-window fallback", () => {
    const position = getInitialNavigationFlyoutPosition({ top: 240, right: 76 } as DOMRect, "menu", {
      width: 1100,
      height: 800,
    });

    expect(position).toEqual({ top: 240, left: 84 });
  });

  it("clamps the first position to the viewport when the anchor is near an edge", () => {
    const position = getInitialNavigationFlyoutPosition({ top: 780, right: 1090 } as DOMRect, "search", {
      width: 1100,
      height: 800,
    });

    expect(position).toEqual({ top: 468, left: 704 });
  });
});
