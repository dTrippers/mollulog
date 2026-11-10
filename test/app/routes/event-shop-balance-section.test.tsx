/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it("edits the owned count from its popover and applies it on save", () => {
    const updateExistingQuantity = jest.fn<(uid: string, value: number) => void>();
    const base = planWith();
    const plan = createEventShopPlan({
      ...base,
      state: { ...base.state, existingPaymentItemQuantities: { "event-currency": 1 } },
      actions: { ...base.actions, updateExistingQuantity },
    });
    render(createElement(ShopBalanceSection, { plan }));
    fireEvent.click(screen.getByRole("button", { name: "이벤트 재화 보유 개수 입력" }));
    const input = screen.getByLabelText<HTMLInputElement>("이벤트 재화 보유 개수", { selector: "input" });
    expect(input.value).toBe("1");

    fireEvent.change(input, { target: { value: "12" } });
    expect(updateExistingQuantity).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(updateExistingQuantity).toHaveBeenLastCalledWith("event-currency", 12);
  });

  it("lists the sources of the required and acquired counts", () => {
    const base = planWith();
    render(
      createElement(ShopBalanceSection, {
        plan: {
          ...base,
          stageCalculations: {
            ...base.stageCalculations,
            itemBreakdown: {
              ...base.stageCalculations.itemBreakdown,
              fromRepeatedRuns: { "event-currency": 240 },
              remaining: { "event-currency": -60 },
            },
          },
        },
      }),
    );

    expect(screen.getByText("필요 개수").nextElementSibling?.textContent).toBe("300");
    expect(screen.getByText("획득 개수").nextElementSibling?.textContent).toBe("240");
    expect(screen.getByText("· 퀘스트")).toBeTruthy();
    expect(screen.getByText("부족 개수").nextElementSibling?.textContent).toBe("60");
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
    expect(screen.queryByText("부족 개수")).toBeNull();
    expect(screen.getAllByText("—")).toHaveLength(2);
    // The owned count stays editable and keeps the saved value.
    fireEvent.click(screen.getByRole("button", { name: "이벤트 재화 보유 개수 입력" }));
    expect(screen.getByLabelText<HTMLInputElement>("이벤트 재화 보유 개수", { selector: "input" }).value).toBe("500");
  });

  it("returns focus to the trigger when the popover saves, cancels, or resets", () => {
    const base = planWith();
    render(
      createElement(ShopBalanceSection, {
        plan: { ...base, state: { ...base.state, existingPaymentItemQuantities: { "event-currency": 5 } } },
      }),
    );
    const trigger = screen.getByRole("button", { name: "이벤트 재화 보유 개수 입력" });
    for (const action of ["저장", "취소", "초기화"]) {
      fireEvent.click(trigger);
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "이벤트 재화 보유 개수" })).getByRole("button", { name: action }),
      );
      expect(document.activeElement).toBe(trigger);
    }
  });

  it("warns about an unobtainable currency and adds the cheapest stage that yields it", () => {
    const toggleStage = jest.fn<(uid: string, enabled: boolean) => void>();
    const base = planWith();
    const stage = {
      uid: "stage-1",
      index: "01",
      name: "스테이지 1",
      difficulty: 1,
      entryAp: 10,
      rewards: [{ item: { uid: "event-currency", name: "이벤트 재화" }, amount: 5, rewardRequirement: null }],
    } as unknown as EventShopPlanContext["stages"][number];
    render(
      createElement(ShopBalanceSection, {
        plan: {
          ...base,
          stages: [stage],
          actions: { ...base.actions, toggleStage },
          stageCalculations: { ...base.stageCalculations, unobtainableTargets: { "event-currency": 300 } },
        },
      }),
    );

    expect(screen.getByText("획득할 수 없는 재화가 있어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "스테이지 01 추가" }));
    expect(toggleStage).toHaveBeenCalledWith("stage-1", true);
  });

  it("hides the numbers of a blocked calculation and keeps the target editor closed until it settles", () => {
    render(createElement(ShopBalanceSection, { plan: planWith({ resultTreasureHuntStatus: "round-limit" }) }));

    expect(screen.getByText("계산 불가")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText("부족 개수")).toBeNull();
    expect(screen.getByRole("button", { name: "이벤트 재화 목표 개수 입력" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "이벤트 재화 보유 개수 입력" }).hasAttribute("disabled")).toBe(false);
  });

  it("waits for the first calculation instead of reading its empty result as enough", () => {
    render(
      createElement(ShopBalanceSection, { plan: planWith({ isCalculating: true, hasCalculationResult: false }) }),
    );

    expect(screen.getByText("계산 중")).toBeTruthy();
    expect(screen.queryByText("부족 개수")).toBeNull();
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

    expect(screen.getByText("부족 개수").nextElementSibling?.textContent).toBe("300");
    expect(screen.queryByText("계산 중")).toBeNull();
    expect(container.querySelectorAll(".opacity-50")).toHaveLength(3);
  });

  it("marks a pending treasure hunt calculation as calculating, not as zero", () => {
    render(createElement(ShopBalanceSection, { plan: planWith({ resultTreasureHuntStatus: "pending" }) }));

    expect(screen.getByText("계산 중")).toBeTruthy();
    expect(screen.queryByText("부족 개수")).toBeNull();
  });
});
