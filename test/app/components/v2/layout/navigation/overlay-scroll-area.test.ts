import { describe, expect, it } from "@jest/globals";
import { getOverlayScrollbarMetrics } from "~/components/v2/layout/navigation/OverlayScrollArea";

describe("overlay scrollbar geometry", () => {
  it("does not return a thumb when the content fits", () => {
    expect(
      getOverlayScrollbarMetrics({
        clientHeight: 400,
        scrollHeight: 400,
        scrollTop: 0,
        trackHeight: 384,
      }),
    ).toBeNull();
  });

  it("sizes the thumb proportionally and follows the scroll position", () => {
    expect(
      getOverlayScrollbarMetrics({
        clientHeight: 250,
        scrollHeight: 500,
        scrollTop: 125,
        trackHeight: 180,
      }),
    ).toEqual({ trackHeight: 180, thumbHeight: 90, thumbTop: 45 });
  });

  it("enforces a minimum thumb size and clamps the scroll position", () => {
    expect(
      getOverlayScrollbarMetrics({
        clientHeight: 100,
        scrollHeight: 1_000,
        scrollTop: 1_200,
        trackHeight: 80,
      }),
    ).toEqual({ trackHeight: 80, thumbHeight: 24, thumbTop: 56 });
  });
});
