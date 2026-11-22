/** @jest-environment jsdom */

import { afterEach, describe, expect, it } from "@jest/globals";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useGrowthViewSettings } from "~/routes/utils.growth._components/growth-view-settings";

const KEY = "mollulog::growth::view-settings";

function stored() {
  return JSON.parse(localStorage.getItem(KEY) ?? "null");
}

describe("useGrowthViewSettings storage", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("keeps the device's sort choice until the account has taken it over", () => {
    localStorage.setItem(KEY, JSON.stringify({ showNumberInputShortcuts: true, sortOrder: "name" }));
    const { result } = renderHook(() => useGrowthViewSettings());

    expect(result.current[2]).toBe("name");
    expect(stored()).toEqual({ showNumberInputShortcuts: true, sortOrder: "name" });

    act(() => result.current[3]());
    expect(stored()).toEqual({ showNumberInputShortcuts: true });
  });
});
