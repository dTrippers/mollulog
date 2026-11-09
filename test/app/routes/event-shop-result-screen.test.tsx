import { describe, expect, it, jest } from "@jest/globals";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { SaveToast } from "~/components/v2/primitives/SaveToast";
import { ShopResultContents } from "~/routes/events.$uid._components/EventShopCalculator";
import { ShopSignInNote } from "~/routes/events.$uid._components/shop/ShopResultPanel";
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
  it("shows the explicit empty selection state", () => {
    const markup = render(createEventShopPlan());

    expect(markup).toContain("필요 AP");
    expect(markup).toContain(">—</p>");
    expect(markup).toContain("살 아이템을 고르면 계산해요");
  });

  it("offers sign-in for account saving in a separate note", () => {
    const markup = renderToStaticMarkup(createElement(ShopSignInNote));

    expect(markup).toContain("로그인하면 계정 저장·보유 학생 반영");
    expect(markup).toContain(">로그인</button>");
  });

  it("dims the previous values with a calculating status while selected inputs are pending", () => {
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

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('<span role="status"');
    expect(markup).toContain("계산 중...");
    expect(markup).toMatch(/opacity-50">9,620<\/p>/);
    expect(markup).not.toContain("살 아이템을 고르면 계산해요");
  });

  it("shows a save failure as an alert toast with a retry action", () => {
    const retry = jest.fn();
    const markup = renderToStaticMarkup(createElement(SaveToast, { saving: false, failed: true, onRetry: retry }));

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("저장하지 못했어요");
    expect(markup).toContain("다시 시도");
  });
});
