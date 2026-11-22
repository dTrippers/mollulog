/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { createElement, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useOutletContext } from "react-router";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import CardFlipScreen from "~/routes/events.$uid._components/CardFlipScreen";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { createCardFlipPlan } from "./event-shop-fixtures";

let mockPlan: EventShopPlanContext;
const mockOpenSheet = jest.fn<(panelId: string) => void>();

jest.mock("react-router", () => {
  return { useOutletContext: jest.fn(() => mockPlan) };
});
jest.mock("~/components/v2/layout", () => ({
  MobileActionBar: ({ leading }: { leading?: ReactNode }) => createElement("div", { className: "v2-action-bar" }, leading),
  PageMain: ({ children }: { children: ReactNode }) => createElement("main", null, children),
  PageAside: ({ children }: { children: ReactNode }) => createElement("aside", null, children),
  PanelSheet: ({ children, panelId }: { children: ReactNode; panelId: string }) =>
    createElement("section", { "data-panel-id": panelId }, children),
  useV2Page: () => ({ stacked: true, openSheet: mockOpenSheet, sheetPanelId: null }),
}));
jest.mock("~/routes/events.$uid._components/EventShopCalculator", () => ({ ShopResultContents: () => null }));

const mockedUseOutletContext = jest.mocked(useOutletContext);

function renderScreen() {
  return render(createElement(CardFlipScreen));
}

describe("card flip v2 screen", () => {
  it("shows the mobile AP bar and opens the result sheet", () => {
    mockPlan = createCardFlipPlan();
    mockOpenSheet.mockClear();

    const { container } = renderScreen();
    const actionBar = container.querySelector(".v2-action-bar");

    expect(actionBar).toBeTruthy();
    expect(screen.queryByRole("button", { name: "이벤트 선택" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "계산 결과 열기" }));

    expect(mockOpenSheet).toHaveBeenCalledWith("result");
    expect(container.querySelector('[data-panel-id="result"]')).toBeTruthy();
  });

  it("renders the strategy table, selected plan, and accessible card reward", () => {
    mockPlan = createCardFlipPlan();

    const { container } = renderScreen();
    const markup = container.innerHTML;

    expect(mockedUseOutletContext).toHaveBeenCalled();
    expect(markup).toContain("카드 뒤집기 전략");
    expect(markup).toContain("현재 계획");
    expect(markup).toContain("1장만 열기");
    expect(markup).toContain("SR 이상 셔플");
    expect(markup).toContain("모두 열기");
    expect(markup).toContain("축제의 추억, SSR 등급, 이벤트 선물 3개");
    expect(markup).toContain("이벤트 선물");
    expect(markup).toContain("기대 획득 보상");
    expect(markup).toContain('aria-label="뒤집을 카드 수 감소"');
    expect(markup).toContain('aria-label="뒤집을 카드 수 증가"');
  });

  it("makes the current-plan resource table scroll region keyboard-focusable and named", () => {
    mockPlan = createCardFlipPlan();
    renderScreen();

    const region = screen.getByRole("region", { name: "현재 계획 재화 표" });

    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toContain("focus-visible:outline-v2-focus");
  });

  it("waits for the first calculation instead of reading the empty breakdown as a surplus", () => {
    mockPlan = createCardFlipPlan({
      isCalculating: true,
      hasCalculationResult: false,
      collectableResources: [{ type: ResourceTypeEnum.Item, uid: "photo-card", name: "포토 카드", forPayment: true }],
    });
    renderScreen();

    const region = screen.getByRole("region", { name: "현재 계획 재화 표" });
    const cells = [...region.querySelectorAll("tbody td")];

    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => cell.textContent === "—")).toBe(true);
    expect(region.querySelector(".text-v2-success")).toBeNull();
  });

  it("selects a strategy from its table header radio without a separate button group", () => {
    const setCardFlipStrategy = jest.fn<(strategy: "one-open" | "sr-reset" | "all-open") => void>();
    const plan = createCardFlipPlan();
    mockPlan = { ...plan, actions: { ...plan.actions, setCardFlipStrategy } };

    renderScreen();

    const radio = screen.getByRole("radio", { name: "SR 이상 셔플" });
    fireEvent.click(radio);

    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(setCardFlipStrategy).toHaveBeenCalledWith("sr-reset");
    expect(screen.queryByRole("button", { name: "1장만 열기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "SR 이상 셔플" })).toBeNull();
    expect(screen.queryByRole("button", { name: "모두 열기" })).toBeNull();
  });

  it("shares the selected tint across the strategy header and cells, with keep-all header text", () => {
    mockPlan = createCardFlipPlan();

    const { container } = renderScreen();
    const selectedHeader = container.querySelector<HTMLInputElement>('th input[type="radio"]:checked')?.closest("th");
    const selectedCells = [...container.querySelectorAll("tbody td.bg-v2-highlight")];

    expect(selectedHeader?.className).toContain("bg-v2-highlight");
    expect(selectedHeader?.className).toContain("text-v2-fg");
    expect(selectedHeader?.querySelectorAll(".break-keep")).toHaveLength(2);
    expect(selectedCells.length).toBeGreaterThan(0);
    expect(selectedCells.every((cell) => cell.className.includes("text-v2-fg"))).toBe(true);
  });

  it("keeps the strategy headers visible above the empty state when the card count is zero", () => {
    const plan = createCardFlipPlan();
    mockPlan = { ...plan, state: { ...plan.state, minigamePlayCount: 0 } };

    renderScreen();

    expect(screen.getByText("뒤집을 카드 수를 입력해 주세요")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByText("이벤트 선물")).toBeNull();
  });

  it("shows the invalid-data state without rendering the card list", () => {
    const plan = createCardFlipPlan();
    const config = plan.minigameConfig;
    if (!config || config.minigameType !== "card_flip") throw new Error("Card flip fixture is required");
    mockPlan = {
      ...plan,
      minigameConfig: { ...config, cardFlip: { status: "invalid" } },
    };

    const markup = renderScreen().container.innerHTML;

    expect(markup).toContain("카드별 보상 정보를 불러오지 못했어요");
    expect(markup).not.toContain("축제의 추억");
  });

  it("shows the unavailable-data state without rendering the card list", () => {
    const plan = createCardFlipPlan();
    const config = plan.minigameConfig;
    if (!config || config.minigameType !== "card_flip") throw new Error("Card flip fixture is required");
    mockPlan = {
      ...plan,
      minigameConfig: { ...config, cardFlip: { status: "unavailable" } },
      cardFlipComparison: null,
    };

    const markup = renderScreen().container.innerHTML;

    expect(markup).toContain("카드별 보상 정보가 아직 없어요");
    expect(markup).not.toContain("축제의 추억");
  });

});
