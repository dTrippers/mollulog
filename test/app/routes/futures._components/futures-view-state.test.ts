/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";
import { useFuturesViewState } from "~/routes/futures._components/futures-view-state";

// The view follows the layout V2Page measures, the same signal that shows and hides the table tab. The window width is
// not read, so the table tab and the table view can never disagree.
describe("useFuturesViewState view decision", () => {
  it("starts stacked, and a table request falls back to a stacked view until V2Page reports a side-by-side layout", () => {
    const { result } = renderHook(() => useFuturesViewState("entry-stacked"));

    expect(result.current.isMobile).toBe(true);
    act(() => result.current.setView("table"));

    expect(result.current.view).not.toBe("table");
    expect(result.current.desktopView).toBe("timeline");
  });

  it("shows the table view once V2Page reports side-by-side, and drops it again when stacked", () => {
    const { result } = renderHook(() => useFuturesViewState("entry-side-by-side"));

    act(() => result.current.onStackedChange(false));
    act(() => result.current.setView("table"));
    expect(result.current.view).toBe("table");

    act(() => result.current.onStackedChange(true));
    expect(result.current.view).not.toBe("table");
  });
});
