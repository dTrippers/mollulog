/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MinigameConfig } from "~/domain/event-shop";
import { getRoadPuzzleTotalRewards } from "~/domain/road-puzzle/calculator";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { RoadPuzzleStatsCalculation } from "~/lib/event-shop/hooks/useRoadPuzzleStats";
import { roadPuzzleLocale } from "~/locales/ko";
import { RoadPuzzleShopSection } from "~/routes/events.$uid._components/RoadPuzzleShopSection";
import { createEventShopPlan } from "./event-shop-fixtures";

jest.mock("react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) =>
    createElement("a", { href: to, className }, children),
}));
jest.mock("~/components/v2/layout", () => ({
  AsideLinks: ({ items }: { items: { key: string; title: string; description?: string; to: string }[] }) =>
    createElement(
      "nav",
      null,
      items.map((item) => createElement("a", { key: item.key, href: item.to }, item.title, " ", item.description)),
    ),
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
        { resourceType: ResourceTypeEnum.Item, resourceUid: "eleph", resourceName: "아오바의 엘레프", quantity: 2 },
        { resourceType: ResourceTypeEnum.Currency, resourceUid: "pyroxene", resourceName: "청휘석", quantity: 200 },
        { resourceType: ResourceTypeEnum.Currency, resourceUid: "credits", resourceName: "크레딧", quantity: 1_000 },
        { resourceType: ResourceTypeEnum.Item, resourceUid: "note", resourceName: "노트", quantity: 3 },
      ],
      additionalRewards: [
        { resourceType: ResourceTypeEnum.Currency, resourceUid: "path-reward", resourceName: "경로 보상", quantity: 100 },
      ],
    })),
  },
};

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

function sectionElement(
  targetRound: number,
  startRound: number,
  currentCalculation: RoadPuzzleStatsCalculation = calculation,
) {
  const base = createEventShopPlan();
  const plan = createEventShopPlan({
    eventUid: "10846",
    minigameConfig: config,
    state: { ...base.state, minigamePlayCount: targetRound, minigameStartRound: startRound },
    roadPuzzleCalculation: currentCalculation,
    minigameRewards: getRoadPuzzleTotalRewards(config.roadPuzzle!, startRound, targetRound),
  });
  return createElement(RoadPuzzleShopSection, { plan, config });
}

function renderSection(
  targetRound: number,
  startRound: number,
  currentCalculation: RoadPuzzleStatsCalculation = calculation,
) {
  return renderToStaticMarkup(sectionElement(targetRound, startRound, currentCalculation));
}

describe("RoadPuzzleShopSection", () => {
  it("uses resource wording in the help, caption, and calculation statuses", () => {
    const readyMarkup = renderSection(9, 3);
    const pendingMarkup = renderSection(9, 3, { ...calculation, status: "pending" });
    const failedMarkup = renderSection(9, 3, { ...calculation, status: "failed" });

    expect(readyMarkup).toContain(roadPuzzleLocale.costModeHelp);
    expect(readyMarkup).toContain("회차별 필요 재화와 보상");
    expect(readyMarkup).toContain(roadPuzzleLocale.calculationComplete);
    expect(pendingMarkup).toContain(roadPuzzleLocale.calculatingCost);
    expect(failedMarkup).toContain(roadPuzzleLocale.calculationFailed);
    expect(failedMarkup).toContain(roadPuzzleLocale.retry);
  });

  it("shows a 7-row expected-cost table, per-run loop rewards, and the map viewer link", () => {
    const markup = renderSection(9, 3);
    expect(markup).toContain("최소값");
    expect(markup).toContain("기대값");
    expect(markup).toContain("최대값");
    expect(markup).toContain("7회차~ ×3");
    expect(markup).toContain("≈2,651");
    expect(markup).toContain("회차별 맵");
    expect(markup).toContain("최단 경로와 필요한 레일");
    expect(markup).toContain('href="/events/10846/road-puzzle?round=7&amp;map=1"');
    expect(markup).not.toContain("경로 보상");
    expect(markup).not.toContain("7,500");
  });

  it("hides totals at target zero and excludes completed rounds from row highlighting", () => {
    const zeroMarkup = renderSection(0, 1);
    expect(zeroMarkup).not.toContain(`>${roadPuzzleLocale.requiredResources}</h3>`);
    expect(zeroMarkup).not.toContain(`>${roadPuzzleLocale.totalRewards}</h3>`);

    const completedMarkup = renderSection(9, 3);
    expect(completedMarkup).toContain("(포함)");
    const firstRound = completedMarkup.match(/<tr[^>]*>[\s\S]*?1회차[\s\S]*?<\/tr>/)?.[0] ?? "";
    expect(firstRound).not.toContain("(포함)");
  });

  it("places the round disclosure at the row end and lists completion and path rewards", () => {
    const { container } = render(sectionElement(9, 3));
    const firstRow = Array.from(container.querySelectorAll<HTMLTableRowElement>("tbody tr")).find((row) =>
      row.querySelector("th")?.textContent?.includes("1회차"),
    );
    expect(firstRow?.querySelector("th button")).toBeNull();
    expect(
      firstRow?.lastElementChild?.querySelector(
        'button[aria-expanded="false"][aria-controls="road-puzzle-round-1-details"]',
      ),
    ).not.toBeNull();

    fireEvent.click(within(firstRow!).getByRole("button", { name: "1회차 보상 펼치기" }));
    expect(within(firstRow!).getByRole("button", { name: "1회차 보상 접기" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    const details = container.querySelector("#road-puzzle-round-1-details");
    expect(details?.textContent).toContain(roadPuzzleLocale.pathRewards);
    expect(screen.getByRole("link", { name: roadPuzzleLocale.mapLink }).getAttribute("href")).toBe(
      "/events/10846/road-puzzle?round=1&map=1",
    );
  });

  it("shows explicit states when road puzzle or reward data is missing", () => {
    expect(
      renderToStaticMarkup(
        createElement(RoadPuzzleShopSection, {
          plan: createEventShopPlan(),
          config: { ...config, roadPuzzle: undefined },
        }),
      ),
    ).toContain(roadPuzzleLocale.noData);
    const withoutRewards: MinigameConfig = {
      ...config,
      roadPuzzle: { ...config.roadPuzzle!, rounds: config.roadPuzzle!.rounds.map((round) => ({ ...round, rewards: [] })) },
    };
    expect(
      renderToStaticMarkup(createElement(RoadPuzzleShopSection, { plan: createEventShopPlan(), config: withoutRewards })),
    ).toContain(roadPuzzleLocale.rewardDataMissing);
  });
});
