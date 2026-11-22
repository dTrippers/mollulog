/** @jest-environment jsdom */
import { describe, expect, it } from "@jest/globals";
import { renderHook } from "@testing-library/react";
import { useTreasureHuntStats } from "~/lib/event-shop/hooks/useTreasureHuntStats";

describe("useTreasureHuntStats", () => {
  // The shop plan derives the treasure estimate, then the minigame costs, then the shop calculation inputs from this
  // value. A new object on every render restarted the debounced shop calculation forever, so the result stayed on
  // "계산 중" after the worker had finished.
  it("returns the same value across renders when nothing changed", () => {
    const items: Parameters<typeof useTreasureHuntStats>[0] = [];
    const { result, rerender } = renderHook(() => useTreasureHuntStats(items, false));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
