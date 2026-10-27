/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { TextDecoder, TextEncoder } from "node:util";
import type {
  MinigamePayment,
  RewardItem,
  RoadPuzzleConfig,
  RoadPuzzleCoordinate,
  RoadPuzzleMap,
} from "~/domain/event-shop";
import type { RailCounts, RoadPuzzleInteractiveAnalysis, RoadPuzzleSolution } from "~/domain/road-puzzle/solver";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { RoadPuzzleStatsCalculation } from "~/components/features/events/shop/hooks/useRoadPuzzleStats";
import type { RoadPuzzleMapAnalysis } from "~/components/features/events/road-puzzle/useRoadPuzzleMapAnalysis";
import { roadPuzzleLocale } from "~/locales/ko";

Object.defineProperty(globalThis, "TextEncoder", { configurable: true, value: TextEncoder });
Object.defineProperty(globalThis, "TextDecoder", { configurable: true, value: TextDecoder });
const { MemoryRouter, Route, Routes, useSearchParams } = require("react-router") as typeof import("react-router");
const { RoadPuzzleViewerPage } = require("~/components/features/events/road-puzzle/RoadPuzzleViewerPage") as typeof import("~/components/features/events/road-puzzle/RoadPuzzleViewerPage");

type RoadPuzzleMapAnalysisHook = (
  map: RoadPuzzleMap,
  marks: readonly RoadPuzzleCoordinate[],
  remaining: RailCounts | null,
  enabled: boolean,
) => RoadPuzzleMapAnalysis;

const mockUseRoadPuzzleStats = jest.fn();
const mockUseRoadPuzzleMapAnalysis = jest.fn<RoadPuzzleMapAnalysisHook>();
jest.mock("~/components/features/events/shop/hooks/useRoadPuzzleStats", () => ({
  useRoadPuzzleStats: (...args: unknown[]) => mockUseRoadPuzzleStats(...args),
}));
jest.mock("~/components/features/events/road-puzzle/useRoadPuzzleMapAnalysis", () => ({
  useRoadPuzzleMapAnalysis: (...args: Parameters<RoadPuzzleMapAnalysisHook>) => mockUseRoadPuzzleMapAnalysis(...args),
}));

let forceNoRouteForMarks = false;
let forceCompletable = false;

const maps: RoadPuzzleMap[] = Array.from({ length: 11 }, (_, index) => ({
  uid: `viewer-map-${index + 1}`,
  name: `Map ${index + 1}`,
  deck: { straight: 1, longCurve: 2, shortCurve: 3 },
  tiles: [
    { x: 0, y: 0, z: 0, type: 1, rotation: 0 },
    { x: 1, y: -1, z: 0, type: 5, rotation: 0 },
    { x: 2, y: -2, z: 0, type: 2, rotation: 0 },
    { x: 3, y: -3, z: 0, type: 5, rotation: 0 },
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

function reward(resourceName: string, resourceUid: string, quantity: number): RewardItem {
  return { resourceType: ResourceTypeEnum.Item, resourceUid, resourceName, quantity };
}

const rewardConfig: RoadPuzzleConfig = {
  ...config,
  rounds: config.rounds.map((round) => ({
    ...round,
    rewards: [
      reward(`크레딧 ${round.round}`, `credit-${round.round}`, 1),
      reward(`엘레프 ${round.round}`, `eleph-${round.round}`, 2),
      reward(`파이프 렌치 ${round.round}`, `wrench-${round.round}`, 3),
    ],
    additionalRewards: [
      reward(`경로 A ${round.round}`, `path-a-${round.round}`, 4),
      reward(`경로 B ${round.round}`, `path-b-${round.round}`, 5),
    ],
  })),
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

function renderViewer(initialEntry: string, viewerConfig = config) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/events/:uid/road-puzzle"
          element={<RoadPuzzleViewerPage config={viewerConfig} payment={payment} />}
        />
      </Routes>
      <LocationEcho />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  forceNoRouteForMarks = false;
  forceCompletable = false;
  mockUseRoadPuzzleStats.mockReturnValue(mockCalculation("ready"));
  mockUseRoadPuzzleMapAnalysis.mockImplementation(
    (map: RoadPuzzleMap, marks: readonly RoadPuzzleCoordinate[], remaining: RailCounts | null, enabled: boolean) => {
      if (!enabled) return { status: "idle", analysis: null, analysisMapUid: null, retry: jest.fn() };
      const analysis: RoadPuzzleInteractiveAnalysis = forceNoRouteForMarks && marks.length > 0
        ? {
            status: "no-route",
            witness: null,
            requiredVector: null,
            drawnVector: null,
            minimumStickers: null,
            expectedStickers: null,
            maximumStickers: null,
            delta: null,
          }
        : {
            status: remaining
              ? forceCompletable && Object.values(remaining).every((count) => count === 0)
                ? "completable"
                : "incomplete"
              : "planned",
            witness: solution.witness,
            requiredVector: solution.minimumVector,
            drawnVector: remaining
              ? {
                  straight: map.deck.straight - remaining.straight,
                  longCurve: map.deck.longCurve - remaining.longCurve,
                  shortCurve: map.deck.shortCurve - remaining.shortCurve,
                }
              : null,
            minimumStickers: remaining ? 150 : solution.minimumStickers,
            expectedStickers: remaining ? 300 : solution.expectedStickers,
            maximumStickers: remaining ? 450 : solution.maximumStickers,
            delta: marks.length > 0 ? { minimumStickers: 0, expectedStickers: 0 } : null,
          };
      return { status: "ready", analysis, analysisMapUid: map.uid, retry: jest.fn() };
    },
  );
});

describe("RoadPuzzleViewerPage", () => {
  it("bounds the start and end glyphs to their station hexes", () => {
    const { container } = renderViewer("/events/10846/road-puzzle?round=1&map=1");

    const mapSvg = container.querySelector('svg[role="group"][aria-labelledby]');
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

    expect(screen.getByRole("group", { name: "7회차~ 맵 2, 레일 1개: 직선 1, 큰 곡선 0, 작은 곡선 0" })).toBeTruthy();
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
    expect(screen.getByRole("group", { name: "7회차~ 맵 5, 레일 1개: 직선 1, 큰 곡선 0, 작은 곡선 0" })).toBeTruthy();
  });

  it("clamps shared links for rounds beyond the loop start to the loop round", () => {
    renderViewer("/events/10846/road-puzzle?round=9&map=3");

    const roundGroup = screen.getByRole("group", { name: "회차" });
    expect(within(roundGroup).getByRole("button", { name: "7회차~" }).getAttribute("aria-pressed")).toBe("true");
    const mapGroup = screen.getByRole("group", { name: "맵" });
    expect(within(mapGroup).getByRole("button", { name: "3" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("group", { name: "7회차~ 맵 3, 레일 1개: 직선 1, 큰 곡선 0, 작은 곡선 0" })).toBeTruthy();
  });

  it("only shows the map selector on the loop round and exposes the route summary toggle", () => {
    renderViewer("/events/10846/road-puzzle?round=5&map=2");

    expect(screen.queryByRole("group", { name: "맵" })).toBeNull();
    expect(screen.queryByText("맵", { selector: "span" })).toBeNull();
    expect(screen.getByRole("group", { name: "5회차 맵, 레일 1개: 직선 1, 큰 곡선 0, 작은 곡선 0" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "하이랜더 기념 스티커" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "레일 종류별 필요 수와 남은 수" })).toBeTruthy();
    expect(screen.getByText(roadPuzzleLocale.viewerGuide)).toBeTruthy();
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

    expect(screen.getByRole("group", { name: "1회차 맵" })).toBeTruthy();
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
    expect(screen.getByRole("group", { name: "1회차 맵" })).toBeTruthy();
    failed.unmount();

    mockUseRoadPuzzleStats.mockReturnValue({ ...mockCalculation("ready"), resultsByUid: {} });
    renderViewer("/events/10846/road-puzzle?round=1&map=1");
    expect(screen.getByText("경로를 찾지 못했어요")).toBeTruthy();
  });

  it("marks only empty cells and supports a single roving keyboard tab stop", () => {
    const { container } = renderViewer("/events/10846/road-puzzle?round=1&map=1");
    const cell = container.querySelector('polygon[role="button"]') as SVGPolygonElement;
    const cells = container.querySelectorAll('polygon[role="button"]');

    expect(cell.getAttribute("aria-label")).toBe("1행 2열, 경로가 지나는 칸");
    expect(cell.classList.contains("outline-none")).toBe(true);
    expect(cell.classList.contains("focus-visible:stroke-foreground")).toBe(true);
    expect(cell.classList.contains("focus-visible:stroke-[1.8]")).toBe(true);
    expect(container.querySelectorAll('polygon[role="button"][tabindex="0"]')).toHaveLength(1);
    expect(cells).toHaveLength(2);
    fireEvent.keyDown(cell, { key: "ArrowRight" });
    expect(cells[0]?.getAttribute("tabindex")).toBe("-1");
    expect(cells[1]?.getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(cells[1]);
    fireEvent.keyDown(cells[1]!, { key: "ArrowLeft" });
    expect(cells[0]?.getAttribute("tabindex")).toBe("0");

    expect(cell.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(cell);

    expect(cell.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("최단 경로보다 약 0개 더 필요해요")).toBeTruthy();
    expect(container.querySelectorAll('svg[width="9"][height="9"]')).toHaveLength(1);
    expect(
      screen.getByRole("group", {
        name: "1회차 맵, 레일 1개: 직선 1, 큰 곡선 0, 작은 곡선 0, 보상 칸 1개",
      }),
    ).toBeTruthy();

    fireEvent.keyDown(cell, { key: " " });
    expect(cell.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelectorAll('polygon[role="button"][tabindex="0"]')).toHaveLength(1);
  });

  it("uses bounded remaining-rail inputs and resets the selected map", () => {
    renderViewer("/events/10846/road-puzzle?round=1&map=1");
    const table = screen.getByRole("table", { name: "레일 종류별 필요 수와 남은 수" });
    expect(table.classList.contains("text-sm")).toBe(true);
    const planHeader = screen.getByRole("columnheader", { name: "필요 수" });
    const shortCurveLabel = screen.getByRole("button", { name: "작은 곡선 레일 강조" }).querySelector("span");
    expect(planHeader.classList.contains("whitespace-nowrap")).toBe(true);
    expect(planHeader.classList.contains("w-[1%]")).toBe(true);
    expect(shortCurveLabel?.classList.contains("whitespace-nowrap")).toBe(true);
    expect(shortCurveLabel?.parentElement?.classList.contains("gap-1")).toBe(true);
    expect(within(table).getAllByRole("cell").every((cell) => cell.classList.contains("whitespace-nowrap"))).toBe(true);
    const input = screen.getByRole("textbox", { name: "직선 남은 수" });
    expect((input as HTMLInputElement).value).toBe("1");
    const cells = within(input.closest("tr") as HTMLElement).getAllByRole("cell");
    expect(cells[0]?.classList.contains("pr-1.5")).toBe(true);
    expect(cells[1]?.classList.contains("w-16")).toBe(true);
    expect(cells[1]?.classList.contains("pl-1.5")).toBe(true);

    const summary = table.closest("div.rounded-md") as HTMLElement;
    expect(within(summary).getByText(roadPuzzleLocale.viewerRequiredResources)).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "하이랜더 기념 스티커" })
        .closest(".group")
        ?.parentElement?.classList.contains("top-0.5"),
    ).toBe(true);
    expect(roadPuzzleLocale.viewerCostHelp).toBe(
      "기대값은 남은 레일이 무작위 순서로 등장하고, 경로가 완성되면 멈출 때 평균적으로 필요한 재화예요.",
    );
    expect(roadPuzzleLocale.progressCostHelp).toBe(
      "배치한 레일은 빼고 계산해요. 기대값은 남은 레일이 무작위 순서로 등장하고, 경로가 완성되면 멈출 때 평균적으로 필요한 재화예요.",
    );
    expect(within(summary).getByText(roadPuzzleLocale.viewerCostHelp).classList.contains("text-xs")).toBe(true);
    expect(within(summary).getByText("150")).toBeTruthy();
    expect(within(summary).getByText("≈375")).toBeTruthy();
    expect(within(summary).getByText("900")).toBeTruthy();
    expect(summary.querySelector("svg.size-4.text-muted-foreground")).toBeNull();

    fireEvent.change(input, { target: { value: "0" } });

    const progressTable = screen.getByRole("table", { name: roadPuzzleLocale.progressTableCaption });
    expect(progressTable).toBeTruthy();
    const progressHeader = screen.getByRole("columnheader", { name: "배치/필요" });
    expect(progressHeader).toBeTruthy();
    expect(progressHeader.classList.contains("whitespace-nowrap")).toBe(true);
    expect(progressHeader.classList.contains("w-[1%]")).toBe(true);
    expect(screen.getByText(roadPuzzleLocale.viewerAdditionalRequiredResources)).toBeTruthy();
    expect(screen.getByText(roadPuzzleLocale.progressCostHelp)).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "하이랜더 기념 스티커" })
        .closest(".group")
        ?.parentElement?.classList.contains("top-0.5"),
    ).toBe(true);
    expect(screen.getByText("필요 1개, 1개 배치")).toBeTruthy();
    expect(screen.getByText(roadPuzzleLocale.progressExpectationLive(300))).toBeTruthy();
    expect(within(summary).getByText("150")).toBeTruthy();
    expect(within(summary).getByText("≈300")).toBeTruthy();
    expect(within(summary).getByText("450")).toBeTruthy();
    expect(summary.querySelector("svg.size-4.text-muted-foreground")).toBeNull();
    expect(screen.getByRole("button", { name: "초기화" })).toBeTruthy();
    const row = screen.getByRole("button", { name: "직선 레일 강조" }).closest("tr")!;
    expect(within(row).getByRole("button", { name: "감소" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "증가" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));

    expect(screen.getByRole("columnheader", { name: "필요 수" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "직선 남은 수" }) as HTMLInputElement).value).toBe("1");
    expect(screen.queryByRole("button", { name: "초기화" })).toBeNull();
  });

  it("uses board-placement wording when the remaining rails complete the route", () => {
    forceCompletable = true;
    renderViewer("/events/10846/road-puzzle?round=1&map=1");

    expect(roadPuzzleLocale.drawnRequired).toBe("배치/필요");
    expect(roadPuzzleLocale.progressTableCaption).toBe("레일 종류별 배치한 수와 필요한 수, 남은 수");
    expect(roadPuzzleLocale.drawnRequiredLabel(3, 2)).toBe("필요 3개, 2개 배치");

    fireEvent.change(screen.getByRole("textbox", { name: "직선 남은 수" }), { target: { value: "0" } });
    fireEvent.change(screen.getByRole("textbox", { name: "큰 곡선 남은 수" }), { target: { value: "0" } });
    fireEvent.change(screen.getByRole("textbox", { name: "작은 곡선 남은 수" }), { target: { value: "0" } });

    expect(roadPuzzleLocale.canCompleteNow).toBe("지금 배치한 레일로 완성할 수 있어요");
    expect(screen.getByText(roadPuzzleLocale.canCompleteNow, { selector: "span" })).toBeTruthy();
  });

  it("shows ordered rewards for seven rounds, omits loop path rewards, and remembers collapse", async () => {
    const path = "/events/10846/road-puzzle?round=1&map=1";
    const view = renderViewer(path, rewardConfig);
    const section = screen.getByRole("button", { name: "회차별 보상" });

    expect(section.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByText("획득 보상")).toHaveLength(7);
    expect(screen.getAllByText("경로 보상")).toHaveLength(6);

    const roundRows = view.container.querySelectorAll<HTMLElement>(".rounded-md.bg-muted.p-2");
    expect(roundRows).toHaveLength(7);
    const firstRound = roundRows[0] as HTMLElement;
    const alignedRewardRows = firstRound.querySelectorAll("div.grid");
    expect(alignedRewardRows).toHaveLength(2);
    expect(
      Array.from(alignedRewardRows).every((row) =>
        row.classList.contains("sm:grid-cols-[max-content_minmax(0,1fr)]"),
      ),
    ).toBe(true);
    const firstRoundImages = within(firstRound).getAllByRole("img");
    expect(firstRoundImages.map((image) => image.getAttribute("alt"))).toEqual([
      "파이프 렌치 1",
      "엘레프 1",
      "크레딧 1",
      "경로 A 1",
      "경로 B 1",
    ]);

    const loopRound = roundRows[6] as HTMLElement;
    expect(within(loopRound).getByText("7회차~")).toBeTruthy();
    expect(within(loopRound).getAllByRole("img")).toHaveLength(3);
    expect(within(loopRound).queryByText("경로 보상")).toBeNull();

    fireEvent.click(section);
    expect(section.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(window.localStorage.getItem("panel::event-road-puzzle-section::round-rewards")).toBe("false"));
    view.unmount();

    renderViewer(path, rewardConfig);
    expect(screen.getByRole("button", { name: "회차별 보상" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("shows an explicit message when round reward data is missing", () => {
    renderViewer("/events/10846/road-puzzle?round=1&map=1", config);

    expect(screen.getByText(roadPuzzleLocale.rewardDataMissing)).toBeTruthy();
  });

  it("shows the no-route callout and undo restores the last mark", () => {
    forceNoRouteForMarks = true;
    const { container } = renderViewer("/events/10846/road-puzzle?round=1&map=1");
    const cell = container.querySelector('polygon[role="button"]') as SVGPolygonElement;
    fireEvent.click(cell);

    expect(screen.getByRole("alert").textContent).toContain(
      "표시한 칸을 모두 지나는 경로가 없어요. 회차와 맵이 맞는지 확인해보세요",
    );
    expect(container.querySelector('svg[role="group"][aria-labelledby]')?.querySelectorAll("path.text-primary")).toHaveLength(0);
    expect(
      screen.getByRole("group", { name: "1회차 맵, 보상 칸 1개: 경로 없음" }),
    ).toBeTruthy();
    expect(screen.getAllByText("–")).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(cell.getAttribute("aria-pressed")).toBe("false");
  });

  it("restores marked cells and remaining counts after a reload", async () => {
    const path = "/events/10846/road-puzzle?round=7&map=2";
    const view = renderViewer(path);
    const cell = view.container.querySelector('polygon[role="button"]') as SVGPolygonElement;
    fireEvent.click(cell);
    fireEvent.change(screen.getByRole("textbox", { name: "직선 남은 수" }), { target: { value: "0" } });
    const key = "road-puzzle-viewer::v1::10846::r7::m2";
    await waitFor(() => expect(window.localStorage.getItem(key)).toContain('"straight":0'));
    view.unmount();

    const restored = renderViewer(path);

    expect((restored.container.querySelector('polygon[role="button"]') as SVGPolygonElement).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect((screen.getByRole("textbox", { name: "직선 남은 수" }) as HTMLInputElement).value).toBe("0");
  });
});
