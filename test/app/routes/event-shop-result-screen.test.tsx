import { describe, expect, it, jest } from "@jest/globals";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { ShopResultContents } from "~/routes/events.$uid._components/EventShopCalculator";
import { createEventShopPlan } from "./event-shop-fixtures";

jest.mock("react-router", () => {
  return {
    Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
    MemoryRouter: ({ children }: { children: ReactNode }) => children,
    useFetcher: () => ({ data: undefined, submit: jest.fn() }),
  };
});
jest.mock("~/contexts/SignInProvider", () => ({ useSignIn: () => ({ showSignIn: jest.fn() }) }));

function render(plan: Parameters<typeof ShopResultContents>[0]["plan"]): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ShopResultContents, { plan })));
}

describe("shop v2 result area", () => {
  it("shows the guest guidance and the explicit empty selection state", () => {
    const markup = render(createEventShopPlan());

    expect(markup).toContain("필요 AP");
    expect(markup).toContain("로그인하면 모집 학생 반영·계정 저장");
    expect(markup).toContain("로그인");
    expect(markup).toContain("구매할 아이템을 선택하세요");
  });

  it("shows only the calculating state while selected inputs are pending", () => {
    const emptyPlan = createEventShopPlan();
    const markup = render(
      createEventShopPlan({
        isCalculating: true,
        collectableResources: [
          { type: ResourceTypeEnum.Currency, uid: "event-currency", name: "이벤트 재화", forPayment: true },
        ],
        state: { ...emptyPlan.state, itemQuantities: { "shop-item": 90 } },
        stageCalculations: {
          ...emptyPlan.stageCalculations,
          totalApWithExtras: 9620,
          itemBreakdown: {
            ...emptyPlan.stageCalculations.itemBreakdown,
            remaining: { "event-currency": 500 },
          },
        },
      }),
    );

    expect(markup).toContain("계산 중…");
    expect(markup).not.toContain("—");
    expect(markup).not.toContain("구매할 아이템을 선택하세요");
    expect(markup).not.toContain("9,620");
    expect(markup).not.toContain("필요 수량");
  });

  it("keeps save failure in the result live region with a retry action", () => {
    const markup = render(createEventShopPlan({ saveError: "저장에 실패했어요", retrySave: jest.fn() }));

    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("저장에 실패했어요");
    expect(markup).toContain("다시 시도");
  });
});
