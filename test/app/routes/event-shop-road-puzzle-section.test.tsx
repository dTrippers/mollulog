/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { MinigameConfig } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { RoadPuzzleStatsCalculation } from "~/lib/event-shop/hooks/useRoadPuzzleStats";
import { roadPuzzleLocale } from "~/locales/ko";
import { ShopMinigameSection } from "~/routes/events.$uid._components/shop/ShopMinigameSection";
import { createEventShopPlan } from "./event-shop-fixtures";

jest.mock("react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) =>
    createElement("a", { href: to, className }, children),
}));

const maps = [
  {
    uid: "road-puzzle-section-map",
    name: "map",
    deck: { straight: 7, longCurve: 12, shortCurve: 11 },
    tiles: [],
    fixedRails: [],
  },
];

const config: MinigameConfig = {
  minigameType: "road_puzzle",
  payment: {
    resourceType: ResourceTypeEnum.Item,
    resourceUid: "sticker",
    resourceName: "하이랜더 기념 스티커",
    quantity: 150,
  },
  payments: [],
  rewardGroups: [],
  roadPuzzle: {
    instantClearRound: 7,
    railSetReward: [
      { resourceType: ResourceTypeEnum.Currency, resourceUid: "credits", resourceName: "크레딧", quantity: 7_500 },
    ],
    maps,
    rounds: Array.from({ length: 7 }, (_, index) => ({
      round: index + 1,
      isLoop: index === 6,
      mapUids: [maps[0]!.uid],
      rewards: [
        { resourceType: ResourceTypeEnum.Item, resourceUid: "wrench", resourceName: "파이프 렌치", quantity: 10 },
      ],
      additionalRewards: [
        { resourceType: ResourceTypeEnum.Currency, resourceUid: "path-reward", resourceName: "경로 보상", quantity: 100 },
      ],
    })),
  },
};

// Tile counts; the card prices them with the payment quantity (150 per tile here).
const calculation: RoadPuzzleStatsCalculation = {
  status: "ready",
  resultsByUid: {
    [maps[0]!.uid]: {
      paretoVectors: [{ straight: 15, longCurve: 0, shortCurve: 0 }],
      minimumVector: { straight: 15, longCurve: 0, shortCurve: 0 },
      witness: [],
      minimumTiles: 15,
      maximumTiles: 30,
      expectedTiles: 2_651 / 150,
    },
  },
  completedMaps: 1,
  totalMaps: 1,
  elapsedMs: 20,
  retry: jest.fn(),
};

function renderSection(
  targetRound: number,
  startRound: number,
  currentCalculation: RoadPuzzleStatsCalculation = calculation,
  currentConfig: MinigameConfig = config,
) {
  const base = createEventShopPlan();
  const plan = createEventShopPlan({
    eventUid: "10846",
    minigameConfig: currentConfig,
    state: {
      ...base.state,
      minigamePlayCount: targetRound,
      minigameStartRound: startRound,
      minigamePaymentQuantityMode: "expected",
    },
    roadPuzzleCalculation: currentCalculation,
  });
  return render(createElement(ShopMinigameSection, { plan }));
}

describe("road puzzle shop card", () => {
  it("prices the remaining rounds with the payment quantity and counts loop runs", () => {
    const { container } = renderSection(9, 3);
    const text = container.textContent ?? "";

    expect(text).not.toContain("1회차");
    expect(text).not.toContain("2회차");
    expect(text).toContain("3회차");
    expect(text).toContain("7회차 이후");
    // Rounds 3–6 once each and the loop round three times, at about 2,651 stickers per run.
    expect(text).toContain("2,651");
    expect(text).toContain("7,953");
    expect(text).toContain("18,557");
    expect(text).not.toContain("7,500");
    expect(screen.getByRole("link", { name: /철도 연결 탭/ }).getAttribute("href")).toBe(
      "/events/10846/road-puzzle?round=7&map=1",
    );
  });

  it("shows no round costs at target zero", () => {
    const { container } = renderSection(0, 1);

    expect(container.textContent).not.toContain("회차 이후");
    expect(container.textContent).not.toContain("하이랜더 기념 스티커");
  });

  it("shows pending and failed calculation states", () => {
    const pending = renderSection(9, 3, { ...calculation, status: "pending" });
    expect(pending.container.textContent).toContain(roadPuzzleLocale.calculating);
    expect(pending.container.textContent).not.toContain("18,557");
    pending.unmount();

    const retry = jest.fn();
    renderSection(9, 3, { ...calculation, status: "failed", retry });
    expect(screen.getByText(roadPuzzleLocale.calculationFailed)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: roadPuzzleLocale.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows explicit states when road puzzle or reward data is missing", () => {
    const missing = renderSection(9, 3, calculation, { ...config, roadPuzzle: undefined });
    expect(missing.container.textContent).toContain(roadPuzzleLocale.noData);
    missing.unmount();

    const withoutRewards: MinigameConfig = {
      ...config,
      roadPuzzle: { ...config.roadPuzzle!, rounds: config.roadPuzzle!.rounds.map((round) => ({ ...round, rewards: [] })) },
    };
    const { container } = renderSection(9, 3, calculation, withoutRewards);
    expect(container.textContent).toContain(roadPuzzleLocale.rewardDataMissing);
  });
});
