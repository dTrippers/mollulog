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

// Two bands on a 1–6s axis, shaped like the ranks service: a bin labelled n holds the clear
// times above n - 1 seconds up to n, so lunatic clears in 0–3s and torment in 3–6s.
const distribution: ClearTimeDistribution = {
  axis: { minSec: 1, maxSec: 7, binWidthSec: 1, binCount: 6 },
  bands: [
    {
      difficulty: "lunatic",
      scorePerSecond: 100,
      floorScore: 10_000,
      minSec: 1,
      maxSec: 3,
      minScore: 10_300,
      maxScore: 10_599,
      sampleCount: 6,
    },
    {
      difficulty: "torment",
      scorePerSecond: 100,
      floorScore: 5_000,
      minSec: 4,
      maxSec: 6,
      minScore: 5_000,
      maxScore: 5_299,
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

// 대결전 JP season 36 탄력장갑 as the ranks service returned it. Counting each one-second score
// range with range stats gave the same counts, so each row must name that score range.
const elasticSeason36: ClearTimeDistribution = {
  axis: { minSec: 26, maxSec: 146, binWidthSec: 1, binCount: 120 },
  bands: [
    {
      difficulty: "insane",
      scorePerSecond: 1_920,
      floorScore: 19_249_600,
      minSec: 26,
      maxSec: 36,
      minScore: 26_093_952,
      maxScore: 26_112_832,
      sampleCount: 20_000,
    },
  ],
  series: [
    {
      difficulty: "insane",
      counts: [69, 1_126, 502, 20, 12, 15, 4_958, 423, 1_664, 3_125, 8_086, ...Array<number>(109).fill(0)],
    },
  ],
  totalCount: 20_000,
  timeBudgetSec: 3_600,
};

// 총력전 JP season 84 탄력장갑 torment, with 17-second bins whose second bin runs past the band.
const elasticSeason84Torment: ClearTimeDistribution = {
  axis: { minSec: 105, maxSec: 156, binWidthSec: 17, binCount: 3 },
  bands: [
    {
      difficulty: "torment",
      scorePerSecond: 2_400,
      floorScore: 31_708_000,
      minSec: 105,
      maxSec: 137,
      minScore: 40_020_001,
      maxScore: 40_098_241,
      sampleCount: 15_386,
    },
  ],
  series: [{ difficulty: "torment", counts: [524, 14_862, 0] }],
  totalCount: 15_386,
  timeBudgetSec: 3_600,
};

function rowSummaries(data: ClearTimeDistribution, bandKey: string) {
  return buildClearTimeChartData(data, bandKey).rows.map((row) => ({
    timeStartSec: row.timeStartSec,
    timeEndSec: row.timeEndSec,
    count: row.count,
    scoreRange: row.scoreRange,
  }));
}

describe("buildClearTimeChartData bins", () => {
  it("keeps the slowest bin of a band", () => {
    for (const bandKey of ["all", "insane"]) {
      const rows = buildClearTimeChartData(elasticSeason36, bandKey).rows;

      expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(20_000);
      expect(rows[0]).toMatchObject({ timeStartSec: 35, timeEndSec: 36, count: 8_086 });
    }
  });

  it("names the score range each bin counts", () => {
    const rows = rowSummaries(elasticSeason36, "insane");

    expect(rows[0]).toEqual({
      timeStartSec: 35,
      timeEndSec: 36,
      count: 8_086,
      scoreRange: { gte: 26_092_480, lt: 26_094_400 },
    });
    expect(rows.at(-1)).toEqual({
      timeStartSec: 25,
      timeEndSec: 26,
      count: 69,
      scoreRange: { gte: 26_111_680, lt: 26_113_600 },
    });
  });

  it("puts the band's lowest and highest scores inside its slowest and fastest rows", () => {
    const rows = rowSummaries(elasticSeason36, "insane");
    const [band] = elasticSeason36.bands;
    const slowest = rows[0].scoreRange;
    const fastest = rows.at(-1)?.scoreRange;

    expect(band.minScore).toBeGreaterThanOrEqual(slowest?.gte ?? Number.NaN);
    expect(band.minScore).toBeLessThan(slowest?.lt ?? Number.NaN);
    expect(band.maxScore).toBeGreaterThanOrEqual(fastest?.gte ?? Number.NaN);
    expect(band.maxScore).toBeLessThan(fastest?.lt ?? Number.NaN);
  });

  it("clips wide bins to the band", () => {
    expect(rowSummaries(elasticSeason84Torment, "torment")).toEqual([
      {
        timeStartSec: 121,
        timeEndSec: 137,
        count: 14_862,
        scoreRange: { gte: 40_019_200, lt: 40_057_600 },
      },
      {
        timeStartSec: 104,
        timeEndSec: 121,
        count: 524,
        scoreRange: { gte: 40_057_600, lt: 40_098_400 },
      },
    ]);
  });

  it("gives adjoining bins of two bands score ranges without gaps or overlaps", () => {
    const rows = rowSummaries(distribution, "all");

    expect(rows.map((row) => row.scoreRange)).toEqual([
      { gte: 10_300, lt: 10_400 },
      { gte: 10_400, lt: 10_500 },
      { gte: 10_500, lt: 10_600 },
      { gte: 5_000, lt: 5_100 },
      { gte: 5_100, lt: 5_200 },
      { gte: 5_200, lt: 5_300 },
    ]);
  });
});
