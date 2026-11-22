import { describe, expect, it, jest } from "@jest/globals";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { TreasureHuntScreen } from "~/routes/events.$uid._components/TreasureHuntScreen";
import { useTreasureHuntBoardAnalysis } from "~/lib/treasure-hunt/useTreasureHuntBoardAnalysis";
import type { TreasureHuntConfig } from "~/domain/event-shop";
import { treasureHuntLocale } from "~/locales/ko";

jest.mock("~/components/v2/layout", () => ({
  PageMain: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));
jest.mock("~/lib/treasure-hunt/useTreasureHuntBoardAnalysis", () => ({
  useTreasureHuntBoardAnalysis: jest.fn(),
}));

const mockedUseTreasureHuntBoardAnalysis = jest.mocked(useTreasureHuntBoardAnalysis);
const config: TreasureHuntConfig = {
  loopRound: 1,
  rounds: [{
    round: 1,
    boardWidth: 1,
    boardHeight: 1,
    cellCost: { resourceType: ResourceTypeEnum.Item, resourceUid: "event-coin", quantity: 1 },
    openCellRewards: [],
    treasures: [{ uid: "treasure", width: 1, height: 1, count: 1, rewards: [] }],
  }],
};

const rewardTileConfig: TreasureHuntConfig = {
  loopRound: 1,
  rounds: [{
    round: 1,
    boardWidth: 9,
    boardHeight: 5,
    cellCost: {
      resourceType: ResourceTypeEnum.Item,
      resourceUid: "event-coin",
      resourceName: "이벤트 코인",
      quantity: 200,
    },
    openCellRewards: [{
      resourceType: ResourceTypeEnum.Currency,
      resourceUid: "credit",
      resourceName: "크레딧 포인트",
      quantity: 40000,
    }],
    treasures: [
      {
        uid: "treasure",
        width: 3,
        height: 2,
        count: 2,
        rewards: [{
          resourceType: ResourceTypeEnum.Item,
          resourceUid: "reward-book",
          resourceName: "일반 활동 보고서",
          quantity: 30,
          rarity: 2,
        }],
      },
      { uid: "small-treasure", width: 1, height: 1, count: 19, rewards: [] },
    ],
  }],
};

describe("treasure hunt v2 screen", () => {
  it("shows a no-data notice when configuration is unavailable", () => {
    const markup = renderToStaticMarkup(createElement(TreasureHuntScreen, { eventUid: "event-1", config: null }));

    expect(markup).toContain("보물찾기 보상 정보를 준비중이에요");
    expect(markup).not.toContain("다시 시도");
  });

  it("shows a retry state when board analysis fails", () => {
    mockedUseTreasureHuntBoardAnalysis.mockReturnValue({ status: "failed", result: null, showSpinner: false, retry: jest.fn() });

    const markup = renderToStaticMarkup(createElement(TreasureHuntScreen, { eventUid: "event-1", config }));

    expect(markup).toContain("보물 확률을 계산하지 못했어요");
    expect(markup).toContain("다시 시도");
  });

  it("hides the previous board's recommendation while the analysis recalculates", () => {
    const previousResult = {
      status: "ok" as const,
      cells: [[0.8]],
      recommended: [{ x: 0, y: 0 }],
      remaining: [],
    };
    mockedUseTreasureHuntBoardAnalysis.mockReturnValue({
      status: "ok",
      result: previousResult,
      showSpinner: false,
      retry: jest.fn(),
    });
    const ready = renderToStaticMarkup(createElement(TreasureHuntScreen, { eventUid: "event-1", config }));
    expect(ready).toContain(treasureHuntLocale.recommendation(1, 80));

    // Recalculation keeps the old result; it belongs to the previous board, so it stays hidden.
    mockedUseTreasureHuntBoardAnalysis.mockReturnValue({
      status: "calculating",
      result: previousResult,
      showSpinner: false,
      retry: jest.fn(),
    });
    const calculating = renderToStaticMarkup(createElement(TreasureHuntScreen, { eventUid: "event-1", config }));
    expect(calculating).not.toContain(treasureHuntLocale.recommendation(1, 80));
  });

  it("maps treasure probability to the six 1.x heat steps", () => {
    const sixCellConfig: TreasureHuntConfig = {
      loopRound: 1,
      rounds: [{ ...config.rounds[0], boardWidth: 6 }],
    };
    mockedUseTreasureHuntBoardAnalysis.mockReturnValue({
      status: "ok",
      result: {
        status: "ok",
        cells: [[0, 0.2, 0.4, 0.6, 0.8, 0.81]],
        recommended: [],
        remaining: [{ width: 1, height: 1, count: 1 }],
      },
      showSpinner: false,
      retry: jest.fn(),
    });

    const markup = renderToStaticMarkup(createElement(TreasureHuntScreen, { eventUid: "event-1", config: sixCellConfig }));

    expect([...markup.matchAll(/bg-v2-treasure-heat-\d/g)].map(([heatClass]) => heatClass)).toEqual([
      "bg-v2-treasure-heat-0",
      "bg-v2-treasure-heat-1",
      "bg-v2-treasure-heat-2",
      "bg-v2-treasure-heat-3",
      "bg-v2-treasure-heat-4",
      "bg-v2-treasure-heat-5",
    ]);
  });

  it("renders round rewards as rarity resource tiles with quantity labels", () => {
    mockedUseTreasureHuntBoardAnalysis.mockReturnValue({ status: "ok", result: null, showSpinner: false, retry: jest.fn() });

    const markup = renderToStaticMarkup(createElement(TreasureHuntScreen, { eventUid: "event-1", config: rewardTileConfig }));

    expect(markup).toContain("40K");
    expect(markup).toContain("200");
    expect(markup).toContain("60");
    expect(markup).toContain("bg-v2-item-rarity-1");
    expect(markup).toContain("bg-v2-item-rarity-2");
    expect(markup).toContain("이론상 6,200~9,000");
  });

  it("uses the shop section title scale and removes the remaining-treasure divider", () => {
    mockedUseTreasureHuntBoardAnalysis.mockReturnValue({ status: "ok", result: null, showSpinner: false, retry: jest.fn() });

    const markup = renderToStaticMarkup(createElement(TreasureHuntScreen, { eventUid: "event-1", config }));

    expect(markup).toContain("text-lg font-semibold text-v2-fg");
    expect(markup).not.toContain("border-t border-v2-divider pt-v2-block-gap");
  });
});
