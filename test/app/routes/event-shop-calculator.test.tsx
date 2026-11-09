/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useMatches, useOutletContext } from "react-router";
import { fireEvent, render as renderDom, screen, within } from "@testing-library/react";
import type { EventRewardBonus, MinigameConfig, ShopResource, Stage } from "~/domain/event-shop";
import { deriveJankenPlan } from "~/domain/event-shop/janken";
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
  MobileActionBar: ({ leading }: { leading?: ReactNode }) =>
    createElement("div", { "data-testid": "mobile-action-bar" }, leading),
  PageAside: ({ children }: { children: ReactNode }) => createElement("aside", null, children),
  PageMain: ({ children }: { children: ReactNode }) => createElement("main", null, children),
  PanelSheet: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  useV2Page: () => ({ stacked: mockStacked, openSheet: jest.fn(), sheetPanelId: null }),
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
  beforeEach(() => {
    mockStacked = false;
    mockedUseMatches.mockReturnValue([]);
  });

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
    expect(screen.getByText("재화마다 서로 다른 보너스 학생을 선택했어요. 재화별 탭에서 확인해주세요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "재화별" }));

    expect(screen.getByRole("button", { name: /키사키 상세, 선택됨/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("보너스 아이템").parentElement?.textContent).toContain("적용 10% / 최대 10%");

    fireEvent.click(screen.getByRole("button", { name: "모든 재화 동일" }));
    expect(setMode).toHaveBeenCalledWith("shared", ["bonus-item"]);
    const sharedPlan = makePlan("shared");
    mockPlan = { ...sharedPlan, actions: { ...sharedPlan.actions, setBonusStudentSelectionMode: setMode } };
    view.rerender(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    expect(screen.getByRole("button", { name: /키사키 상세, 선택 안 됨/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("보너스 아이템").parentElement?.textContent).toContain("적용 0% / 최대 10%");
  });

  it("edits the completed round of a treasure hunt as the round before the start round", () => {
    const setMinigameStartRound = jest.fn<(round: number) => void>();
    mockPlan = createRoundMinigamePlan("treasure_hunt", 4, 3, { setMinigameStartRound });

    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));
    const completedRound = screen.getByLabelText<HTMLInputElement>("완료한 회차");

    expect(completedRound.value).toBe("2");
    expect(screen.getByLabelText<HTMLInputElement>("목표 회차").value).toBe("4");

    fireEvent.change(completedRound, { target: { value: "1" } });
    expect(setMinigameStartRound).toHaveBeenCalledWith(2);
  });

  it.each([
    ["clue_search", "플레이 횟수", 2],
    ["clue_search", "플레이 횟수", 0],
    ["treasure_hunt", "목표 회차", 2],
    ["treasure_hunt", "목표 회차", 0],
  ] as const)("normalizes the start round when %s play count shrinks to %i", (minigameType, label, count) => {
    const setMinigamePlayCount = jest.fn<(playCount: number) => void>();
    const setMinigameStartRound = jest.fn<(round: number) => void>();
    mockPlan = createRoundMinigamePlan(minigameType, 4, 3, { setMinigamePlayCount, setMinigameStartRound });
    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    fireEvent.change(screen.getByLabelText(label), { target: { value: String(count) } });

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
    // The price steps up, so each tier shows with an arrow between them.
    expect(markup).toMatch(/1,200<\/span>[\s\S]*aria-label="다음 단계"[\s\S]*1,500/);
    expect(markup).toContain('<span class="tabular-nums">보유 1,234</span>');
    expect(markup).toContain("text-v2-ap");
    expect(markup).toMatch(/aria-label="AP"[^>]*>[\s\S]*?<\/svg>20<\/span>/);
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

      expect(render()).not.toContain('<span class="tabular-nums">보유 ');
    }
  });

  it("edits owned and required currency inline and offers a reset for an overridden requirement", () => {
    const resetOverriddenRequired = jest.fn<(uid: string) => void>();
    const base = createEventShopPlan({
      collectableResources: [
        { type: ResourceTypeEnum.Currency, uid: "event-currency", name: "이벤트 재화", forPayment: true },
      ],
      state: {
        ...createEventShopPlan().state,
        overriddenRequiredQuantities: { "event-currency": 1000 },
      },
    });
    mockPlan = { ...base, actions: { ...base.actions, resetOverriddenRequired } };

    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    expect(screen.getByLabelText("이벤트 재화 보유 개수")).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("이벤트 재화 필요 개수").value).toBe("1000");
    fireEvent.click(screen.getByRole("button", { name: "계산값으로 되돌리기" }));
    expect(resetOverriddenRequired).toHaveBeenCalledWith("event-currency");
  });

  it("shows the card count, the strategy, and a link to the strategy comparison for card flip", () => {
    const plan = createCardFlipPlan();
    mockPlan = createCardFlipPlan({ state: { ...plan.state, minigamePlayCount: 0 } });

    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    expect(screen.getByLabelText<HTMLInputElement>("카드 수").value).toBe("0");
    expect(screen.getByRole("link", { name: /전략 비교/ }).getAttribute("href")).toBe(
      `/events/${mockPlan.eventUid}/shop/card-flip`,
    );
    expect(screen.queryByText(/기대 획득 개수/)).toBeNull();
  });

  it("shows the planner-derived janken stage counts as a read-only summary", () => {
    const empty = createEventShopPlan();
    const config: MinigameConfig = {
      minigameType: "janken",
      payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "80860", quantity: 400 },
      payments: [],
      rewardGroups: [],
      janken: janken860Fixture,
    };
    const entry = {
      ...empty.jankenEntry,
      goals: { ...empty.jankenEntry.goals, targetScore: 100_000, averageScore: 100_000 },
    };
    const planned = deriveJankenPlan(config.janken!, entry, { currentTier: 1, heldEleph: 0 }, {
      shopCurrencyRequired: 0,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    });
    mockPlan = createEventShopPlan({
      minigameConfig: config,
      minigameConfigForCalculations: config,
      jankenEntry: entry,
      jankenPlan: planned,
    });
    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    expect(screen.getByText("노말 4")).toBeTruthy();
    expect(screen.getByText("챌린지")).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("link", { name: /세부 설정/ }).getAttribute("href")).toBe(
      `/events/${mockPlan.eventUid}/shop/janken`,
    );
  });

  it("shows the total entry currency for each planned stage row", () => {
    const normalFour = janken860Fixture.stages.find(({ stageType, stageNumber }) => stageType === "normal" && stageNumber === 4);
    if (!normalFour) throw new Error("The event 860 fixture must include normal stage 4.");
    const config: MinigameConfig = {
      minigameType: "janken",
      payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "80860", quantity: 400 },
      payments: [],
      rewardGroups: [],
      janken: janken860Fixture,
    };
    const empty = createEventShopPlan();
    mockPlan = createEventShopPlan({
      minigameConfig: config,
      minigameConfigForCalculations: config,
      jankenPlan: {
        status: "available",
        stagePlays: { [normalFour.uid]: 98 },
        entryCost: 39_200,
        entryResourceUid: "80860",
        rewards: {},
        projectedScore: 0,
        achievedGoals: 0,
        totalGoals: 0,
        planSteps: [],
      },
      jankenEntry: empty.jankenEntry,
    });
    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    const row = screen.getByText("노말 4").closest("div");
    expect(row?.textContent).toContain("×98");
    expect(row?.textContent).toContain("39,200");
    expect(screen.getByText("필요 입장 재화").closest("div")?.textContent).toContain("39,200");
  });

  it("formats score and equipment goals as goal pills", () => {
    const config: MinigameConfig = {
      minigameType: "janken",
      payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "80860", quantity: 400 },
      payments: [],
      rewardGroups: [],
      janken: janken860Fixture,
    };
    const empty = createEventShopPlan();
    const entry = {
      ...empty.jankenEntry,
      goals: {
        ...empty.jankenEntry.goals,
        targetTier: 6,
        targetScore: 4_000_000,
        averageScore: 100_000,
        targetEquipmentTier: 5,
      },
    };
    mockPlan = createEventShopPlan({
      minigameConfig: config,
      minigameConfigForCalculations: config,
      jankenEntry: entry,
      jankenPlan: deriveJankenPlan(janken860Fixture, entry, empty.jankenDefaultProgress, {
        shopCurrencyRequired: 10,
        shopCurrencyResourceUid: "80863",
        studentGrowthResourceUid: "26016",
      }),
    });
    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    const goals = screen.getByText("목표").parentElement;
    expect([...(goals?.querySelectorAll(":scope > span[title]") ?? [])].map((pill) => pill.textContent)).toEqual([
      "부족분",
      "고유무기 1",
      "누적 스코어 400만 점",
      "T5",
    ]);
  });

  it("uses the live plain-star student goal in the goal pills", () => {
    const config: MinigameConfig = {
      minigameType: "janken",
      payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "80860", quantity: 400 },
      payments: [],
      rewardGroups: [],
      janken: janken860Fixture,
    };
    const empty = createEventShopPlan();
    const liveEntry = {
      ...empty.jankenEntry,
      goals: { ...empty.jankenEntry.goals, targetTier: 4 },
    };
    const staleSavedEntry = {
      ...empty.jankenEntry,
      goals: { ...empty.jankenEntry.goals, targetTier: null },
    };
    mockPlan = createEventShopPlan({
      minigameConfig: config,
      minigameConfigForCalculations: config,
      jankenEntry: liveEntry,
      savedJankenEntry: staleSavedEntry,
      jankenPlan: deriveJankenPlan(janken860Fixture, liveEntry, empty.jankenDefaultProgress, {
        shopCurrencyRequired: 0,
        shopCurrencyResourceUid: "80863",
        studentGrowthResourceUid: "26016",
      }),
    });
    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    const goals = screen.getByText("목표").parentElement;
    expect([...(goals?.querySelectorAll(":scope > span[title]") ?? [])].map((pill) => pill.textContent)).toEqual([
      "부족분",
      "4성",
    ]);
  });

  it("shows the challenge plays from the planner score, or the missing-average notice", () => {
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
      jankenEntry: {
        ...empty.jankenEntry,
        progress: {
          ...empty.jankenEntry.progress,
          cumulativeScore: 1_200_000,
          clearedStageUids: [
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
        },
        goals: { ...empty.jankenEntry.goals, targetScore: 1_700_000, averageScore: 250_000 },
      },
    });

    const scoredEntry = base.jankenEntry;
    mockPlan = createEventShopPlan({
      ...base,
      jankenPlan: deriveJankenPlan(janken860Fixture, scoredEntry, base.jankenDefaultProgress, {
        shopCurrencyRequired: 0,
        shopCurrencyResourceUid: "80863",
        studentGrowthResourceUid: "26016",
      }),
    });
    const view = renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));
    // (1,700,000 - 1,200,000) / 250,000 = 2 challenge plays.
    expect(screen.getByText("챌린지").closest("div")?.textContent).toContain("×2");

    const missingAverageEntry = {
      ...base.jankenEntry,
      goals: { ...base.jankenEntry.goals, averageScore: null },
    };
    mockPlan = createEventShopPlan({
      ...base,
      jankenEntry: missingAverageEntry,
      jankenPlan: deriveJankenPlan(janken860Fixture, missingAverageEntry, base.jankenDefaultProgress, {
        shopCurrencyRequired: 0,
        shopCurrencyResourceUid: "80863",
        studentGrowthResourceUid: "26016",
      }),
    });
    view.rerender(createElement(MemoryRouter, null, createElement(EventShopCalculator)));
    expect(document.body.textContent).toContain(
      "세부 설정에 1회 평균 스코어가 없어서 플레이 횟수를 계산하지 못했어요.",
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
                  resourceName: "zero reward",
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
    const empty = createEventShopPlan();
    mockPlan = createEventShopPlan({
      minigameConfig: config,
      minigameConfigForCalculations: config,
      jankenEntry: {
        ...empty.jankenEntry,
        progress: { ...empty.jankenEntry.progress, cumulativeScore: 6_500_000 },
      },
      jankenPlan: {
        status: "available",
        stagePlays: { "100860301": 1 },
        entryCost: 400,
        entryResourceUid: "80860",
        rewards: { "80863": 5, "zero-reward": 0 },
        projectedScore: 7_000_000,
        achievedGoals: 1,
        totalGoals: 1,
        planSteps: [],
      },
    });
    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));

    const rewardsList = screen.getByText("기대 획득 개수 · 누적 스코어 보상 포함").nextElementSibling;
    expect(rewardsList?.querySelector('[aria-label="zero reward 이름 표시"], img[alt="zero reward"]')).toBeNull();
    expect(rewardsList?.textContent).toContain("5");
  });

  it("floats the result bar with the empty-selection state on stacked layouts", () => {
    mockStacked = true;
    mockPlan = createEventShopPlan();

    const markup = render();

    expect(markup).toContain('data-testid="mobile-action-bar"');
    expect(markup).toContain('aria-label="계산 결과 열기"');
    expect(markup).toContain("살 아이템을 고르면 계산해요");
  });

  it("dims the previous AP in the mobile action bar while recalculating", () => {
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

    renderDom(createElement(MemoryRouter, null, createElement(EventShopCalculator)));
    const bar = screen.getByRole("button", { name: "계산 결과 열기" });

    expect(bar.textContent).toContain("계산 중...");
    expect(within(bar).getByText("9,620").closest(".opacity-50")).not.toBeNull();
  });

  it.each([
    ["pending", "철도 연결 계산을 기다리는 중"],
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
    expect(markup).not.toContain("77회");
    expect(markup).not.toContain("1,540");
    if (status !== "pending") expect(markup).toContain("다시 시도");
  });
});
