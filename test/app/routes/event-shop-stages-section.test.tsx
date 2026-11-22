/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { ShopStagesSection } from "~/routes/events.$uid._components/shop/ShopStagesSection";
import { createEventShopPlan } from "./event-shop-fixtures";

let mockStacked = false;

jest.mock("react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
}));
jest.mock("~/components/v2/layout", () => ({
  useV2Page: () => ({ stacked: mockStacked }),
}));

function planWith(overrides: Partial<EventShopPlanContext> = {}) {
  const empty = createEventShopPlan();
  return createEventShopPlan({
    stages: [{ uid: "stage-1", index: "1", difficulty: 1, entryAp: 20, rewards: [] }] as EventShopPlanContext["stages"],
    state: { ...empty.state, enabledStages: { "stage-1": true } },
    ...overrides,
  });
}

describe("shop v2 stage sweeps", () => {
  for (const stacked of [false, true]) {
    const layout = stacked ? "mobile" : "desktop";

    it(`waits for the first calculation instead of showing zero runs (${layout})`, () => {
      mockStacked = stacked;
      render(createElement(ShopStagesSection, { plan: planWith({ isCalculating: true, hasCalculationResult: false }) }));

      // Required runs and AP for the stage and for the total. The extra runs stay as typed.
      // The mobile total reads "합계 —" in one span.
      expect(screen.getAllByText("—")).toHaveLength(stacked ? 2 : 4);
      expect(screen.queryByText(/필요 소탕 0회/)).toBeNull();
      expect(screen.queryByText(/합계 0회/)).toBeNull();
      expect(screen.queryByText(/0 AP/)).toBeNull();
    });

    it(`shows the calculated runs once the first calculation lands (${layout})`, () => {
      mockStacked = stacked;
      const base = planWith();
      render(
        createElement(ShopStagesSection, {
          plan: {
            ...base,
            stageCalculations: { ...base.stageCalculations, stageRuns: { "stage-1": 3 }, questSweepAp: 60 },
          },
        }),
      );

      expect(screen.getAllByText(/3회/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/60/).length).toBeGreaterThan(0);
    });
  }
});
