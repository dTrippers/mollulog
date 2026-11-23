import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Defense } from "~/graphql/graphql";
import type { ClearTimeDistribution } from "~/lib/ranks/clear-time-distribution";
import { fetchRangeStats } from "~/lib/ranks/range-stats";
import {
  buildClearTimeChartData,
  distributionToSelectedRange,
  fetchSelectedRangeStats,
  getRangeStatsCacheKey,
  getReselectedBandRange,
  isSameSelectedRange,
  rowsToSelection,
  type SelectedRange,
} from "~/routes/raids.$raidType.$seasonIndex._components/RaidScoreHistogram";

jest.mock("~/lib/ranks/range-stats", () => ({
  fetchRangeStats: jest.fn(),
}));

const fetchRangeStatsMock = fetchRangeStats as jest.MockedFunction<typeof fetchRangeStats>;

const SEASON = { raidType: "total_assault" as const, season: 85, defenseType: Defense.Heavy };

// Two bands on a 0–6s axis: lunatic clears in 0–3s, torment in 3–6s.
const distribution: ClearTimeDistribution = {
  axis: { minSec: 0, maxSec: 6, binWidthSec: 1, binCount: 6 },
  bands: [
    {
      difficulty: "lunatic",
      scorePerSecond: 100,
      floorScore: 10_000,
      minSec: 0,
      maxSec: 3,
      minScore: 10_301,
      maxScore: 10_601,
      sampleCount: 6,
    },
    {
      difficulty: "torment",
      scorePerSecond: 100,
      floorScore: 5_000,
      minSec: 3,
      maxSec: 6,
      minScore: 5_001,
      maxScore: 5_301,
      sampleCount: 15,
    },
  ],
  series: [
    { difficulty: "lunatic", counts: [1, 2, 3, 0, 0, 0] },
    { difficulty: "torment", counts: [0, 0, 0, 4, 5, 6] },
  ],
  totalCount: 21,
  timeBudgetSec: 6,
};

function bandSelection(band: string): SelectedRange {
  const range = distributionToSelectedRange(distribution, band);
  if (!range) {
    throw new Error(`no selection for ${band}`);
  }
  return range;
}

function wholeBandDrag(band: string): SelectedRange {
  const range = rowsToSelection(buildClearTimeChartData(distribution, band).rows);
  if (!range) {
    throw new Error(`no drag for ${band}`);
  }
  return range;
}

describe("RaidScoreHistogram range selection", () => {
  it("marks a band picked from the rail with its difficulty", () => {
    expect(bandSelection("lunatic").difficulty).toBe("lunatic");
  });

  it("keeps a drag across the whole band apart from the band selection", () => {
    const drag = wholeBandDrag("lunatic");

    expect(drag.difficulty).toBeUndefined();
    expect(drag.scoreRanges).toEqual(bandSelection("lunatic").scoreRanges);
    expect(isSameSelectedRange(drag, bandSelection("lunatic"))).toBe(false);
    expect(getRangeStatsCacheKey({ ...SEASON, range: drag })).not.toBe(
      getRangeStatsCacheKey({ ...SEASON, range: bandSelection("lunatic") }),
    );
  });

  it("gives the whole season, a band, and a score range separate cache keys", () => {
    const keys = [
      getRangeStatsCacheKey({ ...SEASON, range: null }),
      getRangeStatsCacheKey({ ...SEASON, range: bandSelection("lunatic") }),
      getRangeStatsCacheKey({ ...SEASON, range: bandSelection("torment") }),
      getRangeStatsCacheKey({ ...SEASON, range: wholeBandDrag("lunatic") }),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("fetchSelectedRangeStats", () => {
  beforeEach(() => {
    fetchRangeStatsMock.mockReset();
    fetchRangeStatsMock.mockResolvedValue({
      sampleSize: 0,
      partyCounts: [],
      studentUsage: [],
      oftenUsedParties: [],
    } as unknown as Awaited<ReturnType<typeof fetchRangeStats>>);
  });

  it("requests the whole season without difficulty or score bounds", async () => {
    await fetchSelectedRangeStats({ ...SEASON, range: null });

    expect(fetchRangeStatsMock).toHaveBeenCalledTimes(1);
    expect(fetchRangeStatsMock.mock.calls[0][0]).toEqual({ ...SEASON, topParties: 5 });
  });

  it("requests a band by difficulty without score bounds", async () => {
    await fetchSelectedRangeStats({ ...SEASON, range: bandSelection("lunatic") });

    expect(fetchRangeStatsMock).toHaveBeenCalledTimes(1);
    expect(fetchRangeStatsMock.mock.calls[0][0]).toEqual({ ...SEASON, difficulty: "lunatic", topParties: 5 });
  });

  it("requests a dragged range by score bounds without difficulty", async () => {
    const drag = wholeBandDrag("lunatic");
    await fetchSelectedRangeStats({ ...SEASON, range: drag });

    expect(fetchRangeStatsMock).toHaveBeenCalledTimes(drag.scoreRanges.length);
    for (const [params] of fetchRangeStatsMock.mock.calls) {
      expect(params).not.toHaveProperty("difficulty");
      expect(params.scoreGte).toEqual(expect.any(Number));
    }
  });
});

describe("getReselectedBandRange", () => {
  it("restores the band selection when the active band is pressed after a drag", () => {
    const reselected = getReselectedBandRange({
      bandKey: "lunatic",
      selectedRange: wholeBandDrag("lunatic"),
      chartDistribution: distribution,
    });

    expect(reselected).toEqual(bandSelection("lunatic"));
  });

  it("restores the whole season when 전체 is pressed after a drag", () => {
    const reselected = getReselectedBandRange({
      bandKey: "all",
      selectedRange: wholeBandDrag("lunatic"),
      chartDistribution: distribution,
    });

    expect(reselected).toBeNull();
  });

  it("leaves the selection alone when nothing was dragged or the band is still loading", () => {
    expect(
      getReselectedBandRange({
        bandKey: "lunatic",
        selectedRange: bandSelection("lunatic"),
        chartDistribution: distribution,
      }),
    ).toBeUndefined();
    expect(
      getReselectedBandRange({ bandKey: "all", selectedRange: null, chartDistribution: distribution }),
    ).toBeUndefined();
    expect(
      getReselectedBandRange({ bandKey: "lunatic", selectedRange: wholeBandDrag("lunatic"), chartDistribution: null }),
    ).toBeUndefined();
  });
});
