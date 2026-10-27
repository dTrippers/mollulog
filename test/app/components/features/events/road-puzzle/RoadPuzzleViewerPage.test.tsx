/** @jest-environment jsdom */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import type { MinigamePayment, RoadPuzzleConfig, RoadPuzzleMap } from "~/domain/event-shop";
import type { RoadPuzzleSolution } from "~/domain/road-puzzle/solver";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { RoadPuzzleStatsCalculation } from "~/components/features/events/shop/hooks/useRoadPuzzleStats";

Object.defineProperty(globalThis, "TextEncoder", { configurable: true, value: TextEncoder });
Object.defineProperty(globalThis, "TextDecoder", { configurable: true, value: TextDecoder });
const { MemoryRouter, useSearchParams } = require("react-router") as typeof import("react-router");
const { RoadPuzzleViewerPage } = require("~/components/features/events/road-puzzle/RoadPuzzleViewerPage") as typeof import("~/components/features/events/road-puzzle/RoadPuzzleViewerPage");

const mockUseRoadPuzzleStats = jest.fn();
jest.mock("~/components/features/events/shop/hooks/useRoadPuzzleStats", () => ({
  useRoadPuzzleStats: (...args: unknown[]) => mockUseRoadPuzzleStats(...args),
}));

const maps: RoadPuzzleMap[] = Array.from({ length: 11 }, (_, index) => ({
  uid: `viewer-map-${index + 1}`,
  name: `Map ${index + 1}`,
  deck: { straight: 1, longCurve: 2, shortCurve: 3 },
  tiles: [
    { x: 0, y: 0, z: 0, type: 1, rotation: 0 },
    { x: 1, y: -1, z: 0, type: 5, rotation: 0 },
    { x: 2, y: -2, z: 0, type: 2, rotation: 0 },
  ],
  fixedRails: [
    { x: 0, y: 0, z: 0, entranceIndex: 1, exitIndex: 0, rotation: 0 },
    { x: 2, y: -2, z: 0, entranceIndex: 3, exitIndex: 0, rotation: 0 },
  ],
}));

const config: RoadPuzzleConfig = {
  instantClearRound: 7,
  railSetReward: [],
  rounds: Array.from({ length: 7 }, (_, index) => ({
    round: index + 1,
    isLoop: index === 6,
    mapUids: index === 6 ? maps.slice(6).map(({ uid }) => uid) : [maps[index]!.uid],
    rewards: [],
    additionalRewards: [],
  })),
  maps,
};

const payment: MinigamePayment = {
  resourceType: ResourceTypeEnum.Item,
  resourceUid: "viewer-sticker",
  resourceName: "하이랜더 기념 스티커",
  quantity: 150,
};

const solution: RoadPuzzleSolution = {
  paretoVectors: [{ straight: 1, longCurve: 0, shortCurve: 0 }],
  minimumVector: { straight: 1, longCurve: 0, shortCurve: 0 },
  witness: [
    { x: 0, y: 0, z: 0, tile: "start", exitIndex: 0 },
    { x: 1, y: -1, z: 0, tile: "empty", railKind: "straight", entryIndex: 3, exitIndex: 0 },
    { x: 2, y: -2, z: 0, tile: "end", entryIndex: 3, exitIndex: 3 },
  ],
  minimumTiles: 1,
  maximumTiles: 6,
  expectedTiles: 2.5,
  minimumStickers: 150,
  maximumStickers: 900,
  expectedStickers: 375,
};

function mockCalculation(status: RoadPuzzleStatsCalculation["status"]): RoadPuzzleStatsCalculation {
  return {
    status,
    resultsByUid: status === "ready" ? Object.fromEntries(maps.map(({ uid }) => [uid, solution])) : {},
    completedMaps: status === "ready" ? maps.length : 0,
    totalMaps: maps.length,
    elapsedMs: status === "ready" ? 40 : null,
    retry: jest.fn(),
  };
}

function LocationEcho() {
  const [searchParams] = useSearchParams();
  return <output data-testid="location-query">{searchParams.toString()}</output>;
}

function renderViewer(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RoadPuzzleViewerPage config={config} payment={payment} />
      <LocationEcho />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRoadPuzzleStats.mockReturnValue(mockCalculation("ready"));
});

describe("RoadPuzzleViewerPage", () => {
  it("bounds the start and end glyphs to their station hexes", () => {
    const { container } = renderViewer("/events/10846/road-puzzle?round=1&map=1");

    const mapSvg = container.querySelector('svg[role="img"]');
    expect(mapSvg).not.toBeNull();
    const glyphs = mapSvg!.querySelectorAll('svg[viewBox="0 0 24 24"]');
    expect(glyphs).toHaveLength(2);
    for (const glyph of glyphs) {
      expect(glyph.getAttribute("x")).toBe("0");
      expect(glyph.getAttribute("y")).toBe("0");
      expect(glyph.getAttribute("width")).toBe("7");
      expect(glyph.getAttribute("height")).toBe("7");
      expect((glyph as SVGElement).style.color).toBe("var(--card)");
    }
  });

  it("loads the selected loop map from the deep link and updates URL selection", () => {
    renderViewer("/events/10846/road-puzzle?round=7&map=2");

    expect(screen.getByRole("img", { name: "7회차~ 맵 2, 레일 1개: 직선 1, 큰 곡선 0, 작은 곡선 0" })).toBeTruthy();
    const roundGroup = screen.getByRole("group", { name: "회차" });
    expect(roundGroup.getAttribute("aria-labelledby")).toBe("road-puzzle-round-label");
    expect(screen.getByText("회차").getAttribute("id")).toBe("road-puzzle-round-label");
    expect(within(roundGroup).getByRole("button", { name: "7회차~" }).getAttribute("aria-pressed")).toBe("true");
    const mapGroup = screen.getByRole("group", { name: "맵" });
    expect(mapGroup.getAttribute("aria-labelledby")).toBe("road-puzzle-map-label");
    expect(screen.getByText("맵").getAttribute("id")).toBe("road-puzzle-map-label");
    expect(within(mapGroup).getByRole("button", { name: "2" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(mapGroup).getByRole("button", { name: "5" }));
    expect(screen.getByTestId("location-query").textContent).toBe("round=7&map=5");
    expect(screen.getByRole("img", { name: "7회차~ 맵 5, 레일 1개: 직선 1, 큰 곡선 0, 작은 곡선 0" })).toBeTruthy();
  });

  it("clamps shared links for rounds beyond the loop start to the loop round", () => {
    renderViewer("/events/10846/road-puzzle?round=9&map=3");

    const roundGroup = screen.getByRole("group", { name: "회차" });
    expect(within(roundGroup).getByRole("button", { name: "7회차~" }).getAttribute("aria-pressed")).toBe("true");
    const mapGroup = screen.getByRole("group", { name: "맵" });
    expect(within(mapGroup).getByRole("button", { name: "3" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img", { name: "7회차~ 맵 3, 레일 1개: 직선 1, 큰 곡선 0, 작은 곡선 0" })).toBeTruthy();
  });

  it("only shows the map selector on the loop round and exposes the route summary toggle", () => {
    renderViewer("/events/10846/road-puzzle?round=5&map=2");

    expect(screen.queryByRole("group", { name: "맵" })).toBeNull();
    expect(screen.queryByText("맵", { selector: "span" })).toBeNull();
    expect(screen.getByRole("img", { name: "5회차 맵, 레일 1개: 직선 1, 큰 곡선 0, 작은 곡선 0" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "하이랜더 기념 스티커" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "레일 종류별 경로 수와 덱 수" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "레일 종류" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "직선 레일 강조" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "직선 레일 강조" }));
    expect(screen.getByRole("button", { name: "직선 레일 강조" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("cell", { name: "1" }).length).toBeGreaterThan(0);
  });

  it("keeps terrain visible without a stale route while calculating, then exposes a delayed status chip", () => {
    jest.useFakeTimers();
    mockUseRoadPuzzleStats.mockReturnValue(mockCalculation("pending"));
    const view = renderViewer("/events/10846/road-puzzle?round=1&map=1");

    expect(screen.getByRole("img", { name: "1회차 맵" })).toBeTruthy();
    expect(view.container.querySelectorAll("path.text-primary")).toHaveLength(0);
    expect(screen.queryByText("계산 중")).toBeNull();

    act(() => jest.advanceTimersByTime(300));
    expect(screen.getAllByText("계산 중").length).toBeGreaterThan(0);
    jest.useRealTimers();
  });

  it("keeps terrain and offers retry on failure, and reports maps with no route", () => {
    mockUseRoadPuzzleStats.mockReturnValue(mockCalculation("failed"));
    const failed = renderViewer("/events/10846/road-puzzle?round=1&map=1");
    expect(screen.getAllByText("경로를 계산하지 못했어요").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "1회차 맵" })).toBeTruthy();
    failed.unmount();

    mockUseRoadPuzzleStats.mockReturnValue({ ...mockCalculation("ready"), resultsByUid: {} });
    renderViewer("/events/10846/road-puzzle?round=1&map=1");
    expect(screen.getByText("경로를 찾지 못했어요")).toBeTruthy();
  });
});
