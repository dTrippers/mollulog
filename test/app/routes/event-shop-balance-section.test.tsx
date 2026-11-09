/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { ShopBalanceSection } from "~/routes/events.$uid._components/shop/ShopBalanceSection";
import { createEventShopPlan } from "./event-shop-fixtures";

jest.mock("react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
}));

const currency = { type: ResourceTypeEnum.Currency, uid: "event-currency", name: "이벤트 재화", forPayment: true };

function planWith(overrides: Partial<EventShopPlanContext> = {}) {
  const empty = createEventShopPlan();
  return createEventShopPlan({
    collectableResources: [currency],
    state: { ...empty.state, itemQuantities: { "shop-item": 1 } },
    stageCalculations: {
      ...empty.stageCalculations,
      totalApWithExtras: 100,
      itemBreakdown: { ...empty.stageCalculations.itemBreakdown, toBuyShopItems: { "event-currency": 300 } },
    },
    ...overrides,
  });
}

describe("shop v2 currency balance", () => {
  it("shows the owned count as typed, before the debounced calculation echoes it", () => {
    const updateExistingQuantity = jest.fn<(uid: string, value: number) => void>();
    const base = planWith();
    // The calculation still holds the count from before the last keystroke.
    const plan = createEventShopPlan({
      ...base,
      state: { ...base.state, existingPaymentItemQuantities: { "event-currency": 1 } },
      actions: { ...base.actions, updateExistingQuantity },
    });
    const view = render(createElement(ShopBalanceSection, { plan }));
    const input = screen.getByLabelText<HTMLInputElement>("이벤트 재화 보유 개수");
    expect(input.value).toBe("1");

    fireEvent.change(input, { target: { value: "12" } });
    expect(updateExistingQuantity).toHaveBeenLastCalledWith("event-currency", 12);
    view.rerender(
      createElement(ShopBalanceSection, {
        plan: { ...plan, state: { ...plan.state, existingPaymentItemQuantities: { "event-currency": 12 } } },
      }),
    );
    expect(screen.getByLabelText<HTMLInputElement>("이벤트 재화 보유 개수").value).toBe("12");
  });

  it("does not read a failed calculation as enough", () => {
    const base = planWith();
    render(
      createElement(ShopBalanceSection, {
        plan: {
          ...base,
          calculationFailed: true,
          state: { ...base.state, existingPaymentItemQuantities: { "event-currency": 500 } },
        },
      }),
    );

    expect(screen.getByText("계산 실패")).toBeTruthy();
    expect(screen.queryByText("충분")).toBeNull();
    expect(screen.getAllByText("—")).toHaveLength(2);
    // The owned count stays editable and keeps the saved value.
    expect(screen.getByLabelText<HTMLInputElement>("이벤트 재화 보유 개수").value).toBe("500");
  });

  it("waits for the first calculation instead of reading its empty result as enough", () => {
    render(
      createElement(ShopBalanceSection, { plan: planWith({ isCalculating: true, hasCalculationResult: false }) }),
    );

    expect(screen.getByText("계산 중")).toBeTruthy();
    expect(screen.queryByText("충분")).toBeNull();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("keeps the previous result, dimmed, while a later calculation runs", () => {
    const base = planWith();
    const { container } = render(
      createElement(ShopBalanceSection, {
        plan: {
          ...base,
          isCalculating: true,
          stageCalculations: {
            ...base.stageCalculations,
            itemBreakdown: { ...base.stageCalculations.itemBreakdown, remaining: { "event-currency": -300 } },
          },
        },
      }),
    );

    expect(screen.getByText(/300 부족/)).toBeTruthy();
    expect(screen.queryByText("계산 중")).toBeNull();
    expect(container.querySelectorAll(".opacity-50")).toHaveLength(2);
  });

  it("marks a pending treasure hunt calculation as calculating, not as zero", () => {
    render(createElement(ShopBalanceSection, { plan: planWith({ resultTreasureHuntStatus: "pending" }) }));

    expect(screen.getByText("계산 중")).toBeTruthy();
    expect(screen.queryByText("충분")).toBeNull();
  });
});
