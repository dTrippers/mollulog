/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import { describe, expect, it, jest } from "@jest/globals";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useMatches, useOutletContext } from "react-router";
import { fireEvent, render as renderDom, screen, within } from "@testing-library/react";
import type { EventRewardBonus, MinigameConfig, ShopResource, Stage } from "~/domain/event-shop";
import { evaluateJankenPlan } from "~/domain/event-shop/janken";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { calculateBonusSummary } from "~/lib/event-shop/hooks/useBonusCalculation";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import EventShopCalculator, { matchesShopEventSearch } from "~/routes/events.$uid._components/EventShopCalculator";
import { janken860Fixture } from "../domain/fixtures/janken-860";
import { createCardFlipPlan, createEventShopPlan } from "./event-shop-fixtures";

describe("event shop event search", () => {
  it("matches pickup names and keeps unrevealed spoiler names hidden from search", () => {
    const event = {
      uid: "event-1",
      name: "이벤트 상점",
      since: "2026-01-01T00:00:00.000Z",
      until: null,
      isSpoiler: false,
      recruitments: [{ pickup: true, student: { uid: "student-1", name: "키사키" } }],
    };
    const spoiler = { ...event, uid: "event-2", name: "비밀 이벤트", isSpoiler: true };

    expect(matchesShopEventSearch(event, "키사키", [])).toBe(true);
    expect(matchesShopEventSearch(spoiler, "비밀", [])).toBe(false);
    expect(matchesShopEventSearch(spoiler, "키사키", [])).toBe(false);
    expect(matchesShopEventSearch(spoiler, "???", [])).toBe(true);
  });
});

let mockPlan: EventShopPlanContext;
let mockStacked = false;

jest.mock("react-router", () => {
  return {
    Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
    MemoryRouter: ({ children }: { children: ReactNode }) => children,
    useOutletContext: jest.fn(() => mockPlan),
    useMatches: jest.fn(() => []),
    useFetcher: () => ({ data: undefined, submit: jest.fn() }),
  };
});
jest.mock("~/components/v2/layout", () => ({
  AsideLinks: () => null,
  PageActionBar: ({ children, className, summary }: { children: ReactNode; className?: string; summary?: ReactNode }) =>
    createElement("div", { className }, createElement("div", { "data-testid": "page-action-bar-summary" }, summary), children),
  PageAside: ({ children }: { children: ReactNode }) => createElement("aside", null, children),
  PageMain: ({ children }: { children: ReactNode }) => createElement("main", null, children),
  PanelSheet: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  useV2Page: () => ({ stacked: mockStacked, openSheet: jest.fn() }),
}));
jest.mock("~/contexts/SignInProvider", () => ({ useSignIn: () => ({ showSignIn: jest.fn() }) }));

const mockedUseOutletContext = jest.mocked(useOutletContext);
const mockedUseMatches = jest.mocked(useMatches);

function render(): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EventShopCalculator)));
}

function createShopFixture() {
  const currency = { type: ResourceTypeEnum.Currency, uid: "event-currency", name: "이벤트 재화" };
  const shopResource: ShopResource = {
    uid: "shop-item-1",
    resource: { type: ResourceTypeEnum.Item, uid: "item-1", name: "상점 아이템", rarity: 1 },
    resourceAmount: 1,
    paymentResource: currency,
    purchaseTiers: [
      { tierIndex: 1, startQuantity: 0, quantity: 1, unitPrice: 1200, paymentResource: currency },
      { tierIndex: 2, startQuantity: 1, quantity: 1, unitPrice: 1500, paymentResource: currency },
    ],
    shopAmount: 20,
  };
  return { currency, shopResource };
}

function createRoundMinigamePlan(
  minigameType: "clue_search" | "treasure_hunt",
  minigamePlayCount: number,
  minigameStartRound: number,
  actions: Partial<EventShopPlanContext["actions"]> = {},
) {
  const config: MinigameConfig = {
    minigameType,
    payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "minigame-cost", quantity: 1 },
    payments: [],
    rewardGroups: [],
  };
  const plan = createEventShopPlan();
  return createEventShopPlan({
    minigameConfig: config,
    minigamePaymentCosts: [],
    minigameRewards: [],
    state: { ...plan.state, minigamePlayCount, minigameStartRound },
    actions: { ...plan.actions, ...actions },
  });
}

describe("event shop v2 calculator", () => {
  it("shows shared bonus selections after switching from per-item mode, matching the applied bonus", () => {
    const eventRewardBonus: EventRewardBonus[] = [
      {
        uid: "bonus-item",
        name: "보너스 아이템",
        rewardBonuses: [{ student: { uid: "student-1", name: "키사키", role: "striker" }, ratio: "0.1" }],
      },
    ];
    const itemSelections = { "bonus-item": ["student-1"] };
    const makePlan = (mode: "shared" | "perItem") => {
      const selectedStudentUidsByItem = mode === "perItem" ? itemSelections : undefined;
      const bonusSummary = calculateBonusSummary({
        eventRewardBonus,
        selectedStudentUids: [],
        selectedStudentUidsByItem,
      });
      const empty = createEventShopPlan();
      return createEventShopPlan({
        eventRewardBonus,
        bonusSummary,
        state: {
          ...empty.state,
          bonusStudentSelectionMode: mode,
          selectedBonusStudentUids: [],
          selectedBonusStudentUidsByItem: itemSelections,
        },
      });
    };
    const setMode = jest.fn<(mode: "shared" | "perItem", itemUids: string[]) => void>();
    const perItemPlan = makePlan("perItem");
    mockPlan = {
      ...perItemPlan,
      actions: { ...perItemPlan.actions, setBonusStudentSelectionMode: setMode },
    };

    const view = renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));
    fireEvent.click(screen.getByRole("button", { name: "아이템별" }));

    expect(screen.getByRole("button", { name: /키사키 상세, 선택됨/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("보너스 아이템").parentElement?.textContent).toContain("적용 10% / 최대 10%");

    fireEvent.click(screen.getByRole("button", { name: "모든 아이템 동일" }));
    expect(setMode).toHaveBeenCalledWith("shared", ["bonus-item"]);
    const sharedPlan = makePlan("shared");
    mockPlan = { ...sharedPlan, actions: { ...sharedPlan.actions, setBonusStudentSelectionMode: setMode } };
    view.rerender(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    expect(screen.getByRole("button", { name: /키사키 상세, 선택 안 됨/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("보너스 아이템").parentElement?.textContent).toContain("적용 0% / 최대 10%");
  });

  it("restores the completed-round control for treasure hunt and resets its start round when disabled", () => {
    const setMinigameStartRound = jest.fn<(round: number) => void>();
    mockPlan = createRoundMinigamePlan("treasure_hunt", 4, 3, { setMinigameStartRound });

    const { container } = renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));
    const completedRound = container.querySelector<HTMLInputElement>("#event-minigame-completed-round");
    const toggle = screen.getByRole("switch", { name: "완료한 회차 제외" });

    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(completedRound?.value).toBe("2");
    expect(screen.getByText("완료한 다음 회차부터 계산해요")).toBeTruthy();

    fireEvent.change(completedRound!, { target: { value: "1" } });
    expect(setMinigameStartRound).toHaveBeenCalledWith(2);
    setMinigameStartRound.mockClear();
    fireEvent.click(toggle);

    expect(setMinigameStartRound).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("spinbutton", { name: "완료 회차" })).toBeNull();
  });

  it.each([
    ["clue_search", 2],
    ["clue_search", 0],
    ["treasure_hunt", 2],
    ["treasure_hunt", 0],
  ] as const)("normalizes the start round when %s play count shrinks to %i", (minigameType, count) => {
    const setMinigamePlayCount = jest.fn<(playCount: number) => void>();
    const setMinigameStartRound = jest.fn<(round: number) => void>();
    mockPlan = createRoundMinigamePlan(minigameType, 4, 3, { setMinigamePlayCount, setMinigameStartRound });
    const { container } = renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));
    expect(screen.getByText("목표 회차")).toBeTruthy();

    fireEvent.change(container.querySelector<HTMLInputElement>("#event-minigame-count")!, {
      target: { value: String(count) },
    });

    expect(setMinigamePlayCount).toHaveBeenCalledWith(count);
    expect(setMinigameStartRound).toHaveBeenCalledWith(Math.max(1, count));
  });

  it("renders owned shop quantities, purchase prices, and stage AP rewards", () => {
    const { currency, shopResource } = createShopFixture();
    const stage: Stage = {
      uid: "stage-1",
      entryAp: 20,
      index: "1",
      difficulty: 1,
      rewards: [
        {
          amount: 10,
          rewardRequirement: null,
          chance: null,
          item: {
            uid: "stage-coin",
            name: "스테이지 코인",
            category: "coin",
            rarity: 1,
            resourceType: ResourceTypeEnum.Item,
          },
        },
      ],
    };
    const plan = createEventShopPlan();
    mockPlan = createEventShopPlan({
      shopResources: [shopResource],
      ownedQuantities: { "shop-item-1": 1234 },
      collectableResources: [
        { ...currency, forPayment: true },
        { type: ResourceTypeEnum.Item, uid: "item-1", name: "상점 아이템", forPayment: false },
      ],
      stages: [stage],
      state: {
        ...plan.state,
        itemQuantities: { "shop-item-1": 2 },
        enabledStages: { "stage-1": true },
      },
      stageCalculations: {
        ...plan.stageCalculations,
        stageRuns: { "stage-1": 5 },
      },
    });

    const markup = render();

    expect(mockedUseOutletContext).toHaveBeenCalled();
    expect(mockedUseMatches).toHaveBeenCalled();
    expect(markup).toContain("상점 아이템");
    expect(markup).toContain("1,200~");
    expect(markup).toContain("1,500");
    expect(markup).toMatch(/보유 <span class="whitespace-nowrap font-semibold tabular-nums text-v2-fg">1,234<\/span>/);
    expect(markup).toContain("text-v2-ap");
    expect(markup).toContain(">20</span>");
    expect(markup).toContain("스테이지 코인");
  });

  it("hides the owned quantity line when inventory is zero or undefined", () => {
    const { currency, shopResource } = createShopFixture();
    const inventoryCases: NonNullable<EventShopPlanContext["ownedQuantities"]>[] = [{ [shopResource.uid]: 0 }, {}];

    for (const ownedQuantities of inventoryCases) {
      mockPlan = createEventShopPlan({
        shopResources: [shopResource],
        ownedQuantities,
        collectableResources: [{ ...currency, forPayment: true }],
      });

      expect(render()).not.toMatch(/보유 <span/);
    }
  });

  it("keeps result edit buttons at the bottom and marks an overridden target line", () => {
    const plan = createEventShopPlan({
      collectableResources: [
        { type: ResourceTypeEnum.Currency, uid: "event-currency", name: "이벤트 재화", forPayment: true },
      ],
      state: {
        ...createEventShopPlan().state,
        overriddenRequiredQuantities: { "event-currency": 1000 },
      },
    });
    mockPlan = plan;

    const markup = render();

    expect(markup).toContain("flex h-full min-w-0 flex-col rounded-md bg-v2-surface p-v2-tile-p");
    expect(markup).toContain("mt-auto flex flex-wrap justify-end gap-2 pt-v2-group-gap");
    expect(markup).toContain('<p><span class="mr-1.5">·</span>입력한 목표 수량</p>');

    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    expect(screen.getByRole("button", { name: "이벤트 재화 보유 수량 입력" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이벤트 재화 목표 수량 입력" })).toBeTruthy();
  });

  it("uses the configured draw count in the all-open helper when no plays are selected", () => {
    const plan = createCardFlipPlan();
    const config = plan.minigameConfig;
    if (config?.cardFlip?.status !== "available") throw new Error("card-flip fixture must be available");

    mockPlan = createCardFlipPlan({
      minigameConfig: {
        ...config,
        cardFlip: {
          ...config.cardFlip,
          drawRules: { ...config.cardFlip.drawRules, maxDrawCount: 4 },
        },
      },
      state: { ...plan.state, minigamePlayCount: 0 },
    });

    expect(render()).toContain("항상 4장을 모두 열어요");
  });

  it("truncates fractional janken stage counts and keeps the stage editor visible for invalid saved counts", () => {
    const empty = createEventShopPlan();
    const config: MinigameConfig = {
      minigameType: "janken",
      payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "80860", quantity: 400 },
      payments: [],
      rewardGroups: [],
      janken: janken860Fixture,
    };
    const setJankenStagePlays = jest.fn<(plays: Record<string, number>) => void>();
    const overrides = {
      minigameConfig: config,
      minigameConfigForCalculations: config,
      actions: { ...empty.actions, setJankenStagePlays },
    };
    mockPlan = createEventShopPlan({ ...overrides, state: { ...empty.state, jankenStagePlays: {} } });
    const view = renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));
    const input = screen.getByRole("spinbutton", { name: "노말 4 플레이 횟수" });

    fireEvent.change(input, { target: { value: "1.5" } });

    expect(setJankenStagePlays).toHaveBeenCalledWith({ "100860204": 1 });
    mockPlan = createEventShopPlan({ ...overrides, state: { ...empty.state, jankenStagePlays: { "100860204": 1.5 } } });
    view.rerender(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    expect(screen.getByRole("spinbutton", { name: "노말 4 플레이 횟수" })).toBeTruthy();
    expect(screen.getByText("무술대회 설정을 확인하지 못했어요.")).toBeTruthy();
  });

  it("shows the saved-score basis or missing-average notice for challenge plays", () => {
    const empty = createEventShopPlan();
    const config: MinigameConfig = {
      minigameType: "janken",
      payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "80860", quantity: 400 },
      payments: [],
      rewardGroups: [],
      janken: janken860Fixture,
    };
    const base = createEventShopPlan({
      minigameConfig: config,
      minigameConfigForCalculations: config,
      state: { ...empty.state, jankenStagePlays: { "100860301": 2 } },
      jankenClearedStageUids: [
        "100860101",
        "100860102",
        "100860103",
        "100860104",
        "100860105",
        "100860201",
        "100860202",
        "100860203",
        "100860204",
      ],
    });

    mockPlan = createEventShopPlan({ ...base, jankenScore: { currentScore: 1_200_000, averageScore: 250_000 } });
    const view = renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));
    expect(document.body.textContent).toContain("누적 스코어 보상 포함 · 현재 120만 점 → 예상 170만 점");
    expect(document.body.textContent).toContain("스코어는 무술대회 플래너의 진행 상황을 기준으로 계산해요.");

    mockPlan = createEventShopPlan({ ...base, jankenScore: { currentScore: 1_200_000, averageScore: null } });
    view.rerender(createElement(MemoryRouter, null, createElement(EventShopCalculator)));
    expect(document.body.textContent).toContain(
      "1회 평균 스코어가 없어 누적 스코어 보상은 계산하지 않았어요. 무술대회 플래너에서 입력해 주세요.",
    );
  });

  it("omits zero-quantity rewards from the janken expected rewards list", () => {
    const janken = {
      ...janken860Fixture,
      scoreRewards: janken860Fixture.scoreRewards.map((tier, index) =>
        index === janken860Fixture.scoreRewards.length - 1
          ? {
              ...tier,
              rewards: [
                ...tier.rewards,
                {
                  resourceType: ResourceTypeEnum.Item,
                  resourceUid: "zero-reward",
                  quantity: 0,
                  probability: 1,
                  tag: "default" as const,
                },
              ],
            }
          : tier,
      ),
    };
    const config: MinigameConfig = {
      minigameType: "janken",
      payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "80860", quantity: 400 },
      payments: [],
      rewardGroups: [],
      janken,
    };
    const evaluation = evaluateJankenPlan(janken, {
      stagePlays: { "100860301": 1 },
      currentScore: 6_500_000,
      averageScore: 500_000,
    });
    expect(evaluation.rewards["zero-reward"]).toBe(0);

    const empty = createEventShopPlan();
    mockPlan = createEventShopPlan({
      minigameConfig: config,
      minigameConfigForCalculations: config,
      jankenScore: { currentScore: 6_500_000, averageScore: 500_000 },
      state: { ...empty.state, jankenStagePlays: { "100860301": 1 } },
    });
    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    const rewardsList = within(screen.getByRole("list"));
    expect(rewardsList.queryByText("0", { exact: true })).toBeNull();
    expect(rewardsList.getByText("5", { exact: true })).toBeTruthy();
  });

  it("renders event search and results directly in the mobile sheet", () => {
    mockStacked = true;
    mockedUseMatches.mockReturnValue([
      {
        id: "routes/events.$uid",
        pathname: "/events/event-1",
        params: { uid: "event-1" },
        data: {
          status: "ready",
          shopAvailableEvents: [
            {
              uid: "event-1",
              name: "현재 이벤트",
              since: "2026-01-01T00:00:00.000Z",
              until: null,
              isSpoiler: false,
              recruitments: [],
            },
            {
              uid: "event-2",
              name: "다른 이벤트",
              since: "2026-02-01T00:00:00.000Z",
              until: null,
              isSpoiler: false,
              recruitments: [],
            },
          ],
        },
        handle: undefined,
      },
    ] as unknown as ReturnType<typeof useMatches>);
    mockPlan = createEventShopPlan();

    const markup = render();

    expect(markup).toContain('aria-label="이벤트 검색"');
    expect(markup).toContain("다른 이벤트");
    expect(markup).toContain("v2-action-bar");
    expect(markup).not.toContain('aria-haspopup="dialog"');
    mockStacked = false;
    mockedUseMatches.mockReturnValue([]);
  });

  it("hides stale AP values from the mobile action bar while calculating", () => {
    mockStacked = true;
    const emptyPlan = createEventShopPlan();
    mockPlan = createEventShopPlan({
      isCalculating: true,
      collectableResources: [
        { type: ResourceTypeEnum.Currency, uid: "event-currency", name: "이벤트 재화", forPayment: true },
      ],
      state: { ...emptyPlan.state, itemQuantities: { "shop-item": 90 } },
      stageCalculations: { ...emptyPlan.stageCalculations, totalApWithExtras: 9620 },
    });

    const markup = render();
    const summary = markup.match(/<div data-testid="page-action-bar-summary">([\s\S]*?)<\/div>/)?.[1];

    expect(summary).toBeDefined();
    expect(summary).toContain("필요 AP");
    expect(summary).not.toContain("—");
    expect(summary).not.toContain("9,620");
    mockStacked = false;
  });

  it.each([
    ["pending", "철도 연결 비용을 계산하고 있어요"],
    ["failed", "철도 연결 비용을 계산하지 못해 소탕 횟수와 필요한 AP를 보여드릴 수 없어요"],
    ["missing", "철도 연결 데이터를 찾지 못했어요"],
  ] as const)("holds stage runs and AP while the road puzzle planner is %s", (status, message) => {
    const emptyPlan = createEventShopPlan();
    mockPlan = createEventShopPlan({
      stages: [{ uid: "stage-1", index: "1", difficulty: 1, entryAp: 20, rewards: [] }],
      state: { ...emptyPlan.state, enabledStages: { "stage-1": true } },
      stageCalculations: { ...emptyPlan.stageCalculations, stageRuns: { "stage-1": 77 }, totalApWithExtras: 1540 },
      holdRoadPuzzleCalculations: true,
      roadPuzzlePlannerStatus: status,
    });

    const markup = render();

    expect(markup).toContain(message);
    expect(markup).not.toContain("77회 소탕");
    expect(markup).not.toContain("1,540");
    if (status === "failed") expect(markup).toContain("다시 시도");
  });
});
