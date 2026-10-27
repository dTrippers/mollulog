/** @jest-environment jsdom */

import { describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TextDecoder, TextEncoder } from "node:util";
import type { ShopActions, ShopState } from "~/components/features/events/shop/hooks";
import type { MinigameConfig } from "~/domain/event-shop";
import type { RoadPuzzleStatsCalculation } from "~/components/features/events/shop/hooks/useRoadPuzzleStats";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { roadPuzzleLocale } from "~/locales/ko";

Object.defineProperty(globalThis, "TextEncoder", { configurable: true, value: TextEncoder });
Object.defineProperty(globalThis, "TextDecoder", { configurable: true, value: TextDecoder });
const { MemoryRouter } = require("react-router") as typeof import("react-router");
const { RoadPuzzleSection } = require("~/components/features/events/shop/RoadPuzzleSection") as typeof import("~/components/features/events/shop/RoadPuzzleSection");

const maps = [{
  uid: "road-puzzle-section-map",
  name: "map",
  deck: { straight: 7, longCurve: 12, shortCurve: 11 },
  tiles: [],
  fixedRails: [],
}];

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
    railSetReward: [{ resourceType: ResourceTypeEnum.Currency, resourceUid: "credits", resourceName: "크레딧", quantity: 7_500 }],
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
      additionalRewards: [{ resourceType: ResourceTypeEnum.Currency, resourceUid: "path-reward", resourceName: "경로 보상", quantity: 100 }],
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
      minimumStickers: 2_250,
      maximumStickers: 4_500,
      expectedStickers: 2_651,
    },
  },
  completedMaps: 1,
  totalMaps: 1,
  elapsedMs: 20,
  retry: jest.fn(),
};

function roadPuzzleSectionElement(
  targetRound: number,
  startRound: number,
  currentCalculation: RoadPuzzleStatsCalculation = calculation,
) {
  return createElement(
    MemoryRouter,
    null,
    createElement(RoadPuzzleSection, {
      config,
      eventUid: "10846",
      state: {
        minigamePlayCount: targetRound,
        minigameStartRound: startRound,
        minigamePaymentQuantityMode: "expected",
      } as ShopState,
      actions: {
        setMinigamePlayCount: jest.fn(),
        setMinigameStartRound: jest.fn(),
        setMinigamePaymentQuantityMode: jest.fn(),
      } as unknown as ShopActions,
      calculation: currentCalculation,
    }),
  );
}

function renderSection(
  targetRound: number,
  startRound: number,
  currentCalculation: RoadPuzzleStatsCalculation = calculation,
) {
  return renderToStaticMarkup(roadPuzzleSectionElement(targetRound, startRound, currentCalculation));
}

describe("RoadPuzzleSection", () => {
  it("uses resource wording in the shop help, caption, and calculation statuses", () => {
    const readyMarkup = renderSection(9, 3);
    const pendingMarkup = renderSection(9, 3, { ...calculation, status: "pending" });
    const failedMarkup = renderSection(9, 3, { ...calculation, status: "failed" });

    expect(roadPuzzleLocale.costModeHelp).toBe(
      "기대값은 남은 레일이 무작위 순서로 등장하고, 경로가 완성되면 멈출 때 평균적으로 필요한 재화예요. 7회차~는 5개 맵 평균이에요. 최대값은 레일을 모두 뽑는 경우예요.",
    );
    expect(roadPuzzleLocale.calculatingCost).toBe("필요 재화를 계산하고 있어요");
    expect(roadPuzzleLocale.calculationComplete).toBe("필요 재화 계산을 마쳤어요");
    expect(roadPuzzleLocale.calculationFailed).toBe("필요 재화를 계산하지 못했어요");
    expect(readyMarkup).toContain("회차별 필요 재화와 보상");
    expect(readyMarkup).toContain(roadPuzzleLocale.calculationComplete);
    expect(pendingMarkup).toContain(roadPuzzleLocale.calculatingCost);
    expect(failedMarkup).toContain(roadPuzzleLocale.calculationFailed);
  });

  it("shows the updated shop cost explanation in its tooltip", () => {
    const { container } = render(roadPuzzleSectionElement(9, 3));
    const icon = container.querySelector("svg.size-4.text-muted-foreground");
    const trigger = icon?.parentElement;
    if (!trigger) throw new Error("The cost explanation tooltip trigger is missing.");

    fireEvent.focus(trigger);

    expect(screen.getByRole("tooltip").textContent).toBe(roadPuzzleLocale.costModeHelp);
  });

  it("shows a 7-row expected-cost table, per-run loop rewards, and completion rewards without path or rail-set rewards", () => {
    const markup = renderSection(9, 3);
    expect(markup).toContain("최소값");
    expect(markup).toContain("기대값");
    expect(markup).toContain("최대값");
    expect(markup).toContain("7회차~ ×3");
    expect(markup).toContain("≈2,651");
    expect(markup).toContain("회차별 맵");
    expect(markup).toContain("최단 경로와 필요한 레일");
    expect(markup).toContain('href="/events/10846/road-puzzle?round=7&amp;map=1"');
    const linkedRounds = [...markup.matchAll(/road-puzzle\?round=(\d+)&amp;map=1/g)].map((match) => Number(match[1]));
    expect(linkedRounds).toContain(7);
    expect(linkedRounds.every((round) => round <= 7)).toBe(true);
    expect(markup).not.toContain("경로 보상");
    expect(markup).not.toContain("7,500");
  });

  it("hides totals at target zero and excludes completed rounds from row highlighting", () => {
    const zeroMarkup = renderSection(0, 1);
    expect(zeroMarkup).not.toContain('text-sm font-semibold text-foreground">필요 재화');
    expect(zeroMarkup).not.toContain('text-sm font-semibold text-foreground">획득 보상');

    const completedMarkup = renderSection(9, 3);
    expect(completedMarkup).toContain("(포함)");
    const firstRound = completedMarkup.match(/<tr[^>]*>[\s\S]*?1회차[\s\S]*?<\/tr>/)?.[0] ?? "";
    expect(firstRound).not.toContain("(포함)");
  });

  it("places the round disclosure at the row end and names expanded rewards", () => {
    const { container } = render(roadPuzzleSectionElement(9, 3));
    const table = container.querySelector("table");
    expect(table?.closest(".rounded-md.bg-card.p-3")).not.toBeNull();
    const firstRow = Array.from(table!.querySelectorAll<HTMLTableRowElement>("tbody tr")).find((row) =>
      row.querySelector("th")?.textContent?.includes("1회차"),
    );
    expect(firstRow?.querySelector("th button")).toBeNull();
    expect(firstRow?.lastElementChild?.querySelector('button[aria-expanded="false"][aria-controls="road-puzzle-round-1-details"]')).not.toBeNull();

    fireEvent.click(within(firstRow!).getByRole("button", { name: "1회차 보상 펼치기" }));
    expect(within(firstRow!).getByRole("button", { name: "1회차 보상 접기" }).getAttribute("aria-expanded")).toBe("true");
    const details = container.querySelector("#road-puzzle-round-1-details");
    expect(details).not.toBeNull();
    expect(Array.from(details!.querySelectorAll("img")).map((image) => image.getAttribute("alt"))).toContain("파이프 렌치");
  });
});
