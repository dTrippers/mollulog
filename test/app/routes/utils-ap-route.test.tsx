import { beforeEach, describe, expect, it, jest } from "@jest/globals";

type CardProps = {
  event: { timelineUid: string; runType?: string | null };
  calculation: ApPlannerCalculation | null;
  calculationError: string | null;
  rewardDataPending: boolean;
  shopTargetExists: boolean;
};

const renderedCards: CardProps[] = [];

jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLoaderData: jest.fn(),
    useFetcher: () => ({ state: "idle", data: undefined, submit: jest.fn() }),
  };
});
jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/components/features/futures", () => ({ useGuestPlanner: () => ({ snapshot: null }) }));
jest.mock("~/components/features/layout/Page", () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => children,
}));
jest.mock("~/routes/utils.ap._components/ApTimelineEvent", () => ({
  __esModule: true,
  default: (props: CardProps) => {
    renderedCards.push(props);
    return null;
  },
}));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLoaderData } from "react-router";
import type { MinigameConfig, ShopResource, Stage } from "~/domain/event-shop";
import { calculateShopApRequirement } from "~/domain/event-shop/calculations/calculate-shop-ap";
import { createDefaultEventShopState } from "~/domain/event-shop-state";
import { createDefaultJankenPlannerEntry, deriveJankenPlan } from "~/domain/event-shop/janken";
import { type ApPlannerCalculation, calculateApPlannerEvent } from "~/domain/ap-planner";
import type { JankenPlannerEntry } from "~/domain/planner-state";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { janken860Fixture } from "../domain/fixtures/janken-860";
import ApPlannerRoute from "~/routes/utils.ap";
import type { IntegratedPlannerShopEvent } from "~/views/integrated-planner";

const mockUseLoaderData = useLoaderData as unknown as jest.Mock;

const conditions = { accountLevel: 85, cafeRank: 8, comfort: 4_500 };
const previous = {
  uid: "previous",
  name: "앞 이벤트",
  contentType: "event",
  runType: "first",
  startAt: "2026-09-25T11:00:00+09:00",
  endAt: "2026-09-30T10:00:00+09:00",
};
const next = {
  uid: "next",
  name: "다음 이벤트",
  contentType: "event",
  runType: "rerun",
  startAt: "2026-09-30T11:00:00+09:00",
  endAt: "2026-10-01T11:00:00+09:00",
};
const nextAccessAt = "2026-09-30T12:00:00+09:00";
const now = "2026-09-30T10:30:00+09:00";
const stages: Stage[] = [{ uid: "story", index: "1", entryAp: 12, difficulty: 0, rewards: [] }];

function loaderData(overriddenRequiredQuantities: Record<string, number> = {}) {
  const shopState = { ...createDefaultEventShopState(stages, []), includeFirstClear: true, overriddenRequiredQuantities };
  return {
    signedIn: true,
    now,
    accountStateStatus: "available",
    timelineEventsStatus: "available",
    shopEventsStatus: "available",
    timelineEvents: [previous, next],
    accountState: {
      apPlanner: {
        ...conditions,
        eventPlans: { previous: { accessAt: previous.startAt }, next: { accessAt: nextAccessAt } },
      },
      options: defaultPyroxenePlannerOptions,
      timelineItems: [
        { uid: "ap-package", source: "package_ap", eventAt: "2026-09-30T04:00:00+09:00", autoRepurchase: false },
        { uid: "other-record", source: "buy", eventAt: "2026-09-30T04:00:00+09:00", autoRepurchase: false },
      ],
      jankenProgress: {},
    },
    shopEvents: [previous, next].map((event) => ({
      timelineUid: event.uid,
      name: event.name,
      shopStateUid: event.uid,
      status: "available",
      accountStateStatus: "available",
      startAt: event.startAt,
      endAt: event.endAt,
      accountState: shopState,
      jankenStudentGrowthUid: null,
      jankenDefaultProgress: null,
      content: { stages, shopResources: [], eventRewardBonus: [], minigameConfig: null as MinigameConfig | null },
    })),
  };
}

function renderNextCard(data: ReturnType<typeof loaderData>): CardProps | undefined {
  renderedCards.length = 0;
  mockUseLoaderData.mockReturnValue(data);
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ApPlannerRoute)));
  return renderedCards.find((card) => card.event.timelineUid === "next");
}

describe("AP planner route", () => {
  beforeEach(() => {
    mockUseLoaderData.mockReset();
  });

  it("uses the renamed section title and passes runType from the timeline events", () => {
    mockUseLoaderData.mockReturnValue(loaderData());
    renderedCards.length = 0;
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ApPlannerRoute)));

    expect(markup).toContain("이벤트 별 AP 계획");
    expect(markup).not.toContain("이벤트별 AP</h2>");
    expect(renderedCards.find((card) => card.event.timelineUid === "next")?.event.runType).toBe("rerun");
  });

  it("keeps a hidden, just-ended planned event as the owner of its AP period", () => {
    const card = renderNextCard(loaderData());

    expect(renderedCards.some((rendered) => rendered.event.timelineUid === "previous")).toBe(false);
    const expected = calculateApPlannerEvent({
      event: {
        timelineUid: next.uid,
        name: next.name,
        startAt: next.startAt,
        endAt: next.endAt,
        exchangeUntil: next.endAt,
        requiredAp: 12,
        requiredBreakdown: { firstClearAp: 12, questSweepAp: 0, extraSweepAp: 0 },
      },
      conditions,
      plan: { accessAt: nextAccessAt },
      currentAt: now,
      options: defaultPyroxenePlannerOptions,
      packageRecords: [{ eventAt: "2026-09-30T04:00:00+09:00", autoRepurchase: false }],
      previousPlannedEvents: [{ ...previous, timelineUid: previous.uid }],
    });
    expect(card?.calculation?.overlapEventName).toBe("앞 이벤트");
    expect(card?.calculation?.availableAp).toBe(expected.availableAp);
    expect(card?.calculation?.supplyBreakdown).toMatchObject({ stockpile: 70, dailyTasks: 150, apPackage: 150 });
  });

  it("reports a shop target with unobtainable currency instead of a partial AP verdict", () => {
    const card = renderNextCard(loaderData({ unobtainable: 1_000 }));

    expect(card?.calculation).toBeNull();
    expect(card?.shopTargetExists).toBe(true);
    expect(card?.rewardDataPending).toBe(true);
    expect(card?.calculationError).toBe("해당 이벤트의 퀘스트/미니게임 보상 데이터를 준비중이에요. 조금만 기다려주세요.");
  });

  it("uses the derived janken plan so AP matches the shop calculator", () => {
    const data = loaderData();
    const shop = data.shopEvents[1] as unknown as IntegratedPlannerShopEvent;
    const quest: Stage = {
      uid: "janken-entry-quest",
      entryAp: 12,
      index: "1-1",
      difficulty: 1,
      rewards: [
        {
          amount: 100_000,
          rewardRequirement: null,
          chance: null,
          item: {
            uid: "80860",
            name: "entry-token",
            category: "coin",
            rarity: 1,
            resourceType: ResourceTypeEnum.Item,
          },
        },
        {
          amount: 10_000,
          rewardRequirement: null,
          chance: null,
          item: {
            uid: "80863",
            name: "shop-currency",
            category: "coin",
            rarity: 1,
            resourceType: ResourceTypeEnum.Item,
          },
        },
      ],
    };
    const shopCurrency = { type: ResourceTypeEnum.Item, uid: "80863", name: "shop-currency" };
    const shopResource: ShopResource = {
      uid: "janken-shop-item",
      resource: { type: ResourceTypeEnum.Item, uid: "shop-item", name: "shop-item", rarity: 1 },
      resourceAmount: 1,
      paymentResource: shopCurrency,
      purchaseTiers: [{ tierIndex: 1, startQuantity: 0, quantity: 1, unitPrice: 100, paymentResource: shopCurrency }],
      shopAmount: 1,
    };
    const entry: JankenPlannerEntry = {
      ...createDefaultJankenPlannerEntry({ currentTier: 1, heldEleph: 0 }),
      goals: {
        ...createDefaultJankenPlannerEntry({ currentTier: 1, heldEleph: 0 }).goals,
        targetScore: 100_000,
        averageScore: 100_000,
      },
    };
    const minigameConfig: MinigameConfig = {
      minigameType: "janken",
      payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "80860", quantity: 400 },
      payments: [],
      rewardGroups: [],
      janken: janken860Fixture,
    };
    const defaultProgress = { currentTier: 1, heldEleph: 0 };
    const shopState = shop.accountState;
    if (!shop || !shopState) throw new Error("Expected AP shop fixture.");
    shop.shopStateUid = "next-shop";
    shop.jankenStudentGrowthUid = "26016";
    shop.jankenDefaultProgress = defaultProgress;
    shop.content = {
      stages: [quest as never],
      shopResources: [shopResource],
      eventRewardBonus: [],
      minigameConfig,
    };
    const apShopState = {
      ...shopState,
      itemQuantities: { [shopResource.uid]: 1 },
      enabledStages: { [quest.uid]: true },
    };
    shop.accountState = apShopState;
    (data.accountState.jankenProgress as Record<string, JankenPlannerEntry>)["next-shop"] = entry;
    const plan = deriveJankenPlan(janken860Fixture, entry, defaultProgress, {
      shopCurrencyRequired: 100,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    });
    const expected = calculateShopApRequirement({
      state: apShopState,
      stages: [quest],
      shopResources: [shopResource],
      appliedBonusRatio: {},
      jankenStagePlays: plan.stagePlays,
      jankenClearedStageUids: entry.progress.clearedStageUids,
      jankenScore: {
        currentScore: entry.progress.cumulativeScore,
        averageScore: entry.goals.averageScore,
      },
      minigameConfig,
    });
    const card = renderNextCard(data);

    expect(card?.calculation?.requiredAp).toBe(expected.totalApWithExtras);
    expect(card?.calculation?.requiredAp).toBeGreaterThan(0);
  });

  it.each([false, true])("does not undercount a treasure-hunt plan with first-clear AP %s", (includeFirstClear) => {
    const data = loaderData();
    for (const shop of data.shopEvents) {
      shop.accountState.includeFirstClear = includeFirstClear;
      shop.accountState.minigamePlayCount = 6;
      shop.content.minigameConfig = {
        minigameType: "treasure_hunt",
        payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "treasure-ticket", quantity: 1 },
        payments: [],
        rewardGroups: [],
      };
    }
    const card = renderNextCard(data);

    expect(card?.calculation).toBeNull();
    expect(card?.shopTargetExists).toBe(true);
    expect(card?.calculationError).toBe("보물찾기가 포함된 AP는 이벤트 상점 계산기에서 확인해주세요.");
  });
});
