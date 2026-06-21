import { describe, expect, it } from "@jest/globals";
import { Attack, Defense } from "~/graphql/graphql";
import { buildStudentRaidUsageChartData, getDefaultRaidUsageDefenseFilter } from "./StudentRaidUsageChartModel";

function makeJpSchedule(seasonIndex: number, startAt: string) {
  return { seasonIndex, startAt };
}

const baseRaid = {
  raidBoss: { uid: "binah", name: "비나" },
  seasonIndex: 1,
  raidType: "total_assault",
  startAt: "2025-01-01T00:00:00.000Z",
  endAt: "2025-01-08T00:00:00.000Z",
  jpSchedule: makeJpSchedule(101, "2025-01-01T00:00:00.000Z"),
  defenseTypes: [{ defenseType: Defense.Heavy, difficulty: "torment" }],
};

describe("buildStudentRaidUsageChartData", () => {
  it("builds usage bars from total assault and elimination raids after releaseAt", () => {
    const result = buildStudentRaidUsageChartData({
      releaseAt: "2025-01-01T00:00:00.000Z",
      selectedDefenseType: "all",
      raids: [
        {
          ...baseRaid,
          seasonIndex: 0,
          startAt: "2024-12-25T00:00:00.000Z",
          jpSchedule: makeJpSchedule(100, "2024-12-25T00:00:00.000Z"),
        },
        baseRaid,
        {
          ...baseRaid,
          seasonIndex: 2,
          raidType: "elimination",
          startAt: "2025-01-15T00:00:00.000Z",
          jpSchedule: makeJpSchedule(102, "2025-01-15T00:00:00.000Z"),
          defenseTypes: [
            { defenseType: Defense.Light, difficulty: "torment" },
            { defenseType: Defense.Heavy, difficulty: "torment" },
            { defenseType: Defense.Special, difficulty: "torment" },
          ],
        },
        {
          ...baseRaid,
          seasonIndex: 3,
          raidType: "unlimit",
          startAt: "2025-01-22T00:00:00.000Z",
          jpSchedule: makeJpSchedule(103, "2025-01-22T00:00:00.000Z"),
        },
      ],
      statistics: [
        {
          raid: { raidType: "total_assault", season: 101, defenseType: Defense.Heavy },
          studentUid: "10085",
          slotsCount: 10,
          slotsByTier: [{ tier: 8, count: 7 }],
          assistsCount: 5,
          assistsByTier: [
            { tier: 8, count: 2 },
            { tier: 7, count: 3 },
          ],
        },
        {
          raid: { raidType: "elimination", season: 102, defenseType: Defense.Light },
          studentUid: "10085",
          slotsCount: 3,
          slotsByTier: [{ tier: 7, count: 3 }],
          assistsCount: 1,
          assistsByTier: [{ tier: 7, count: 1 }],
        },
      ],
    });

    expect(result.rows.map((row) => `${row.raidType}:${row.seasonIndex}:${row.defenseType}`)).toEqual([
      "total_assault:1:heavy",
      "elimination:2:light",
      "elimination:2:heavy",
      "elimination:2:special",
    ]);
    expect(result.rows[0]).toMatchObject({
      totalCount: 15,
      tier8: 9,
      tier7: 3,
    });
    expect(result.rows[1]).toMatchObject({
      totalCount: 4,
      tier7: 4,
    });
    expect(result.rows[2]?.totalCount).toBe(0);
    expect(result.yAxisMax).toBe(20000);
  });

  it("filters both total assault and elimination bars by defense type and keeps y axis at least 20000", () => {
    const result = buildStudentRaidUsageChartData({
      releaseAt: "2025-01-01T00:00:00.000Z",
      selectedDefenseType: Defense.Heavy,
      raids: [
        baseRaid,
        {
          ...baseRaid,
          seasonIndex: 2,
          raidType: "elimination",
          startAt: "2025-01-15T00:00:00.000Z",
          jpSchedule: makeJpSchedule(102, "2025-01-15T00:00:00.000Z"),
          defenseTypes: [
            { defenseType: Defense.Light, difficulty: "torment" },
            { defenseType: Defense.Heavy, difficulty: "torment" },
          ],
        },
      ],
      statistics: [
        {
          raid: { raidType: "total_assault", season: 101, defenseType: Defense.Heavy },
          studentUid: "10085",
          slotsCount: 25000,
          slotsByTier: [{ tier: 8, count: 25000 }],
          assistsCount: 0,
          assistsByTier: [],
        },
        {
          raid: { raidType: "elimination", season: 102, defenseType: Defense.Light },
          studentUid: "10085",
          slotsCount: 10,
          slotsByTier: [{ tier: 8, count: 10 }],
          assistsCount: 0,
          assistsByTier: [],
        },
      ],
    });

    expect(result.rows.map((row) => `${row.raidType}:${row.seasonIndex}:${row.defenseType}`)).toEqual([
      "total_assault:1:heavy",
      "elimination:2:heavy",
    ]);
    expect(result.rows[0]?.totalCount).toBe(25000);
    expect(result.rows[1]?.totalCount).toBe(0);
    expect(result.yAxisMax).toBe(25000);
  });

  it("uses the student's attack type to pick the default defense filter", () => {
    expect(getDefaultRaidUsageDefenseFilter(Attack.Explosive)).toBe(Defense.Light);
    expect(getDefaultRaidUsageDefenseFilter(Attack.Piercing)).toBe(Defense.Heavy);
    expect(getDefaultRaidUsageDefenseFilter(Attack.Mystic)).toBe(Defense.Special);
    expect(getDefaultRaidUsageDefenseFilter(Attack.Sonic)).toBe(Defense.Elastic);
    expect(getDefaultRaidUsageDefenseFilter(Attack.Normal)).toBe("all");
  });

  it("labels the x axis only when the year changes and keeps boss names for tooltip", () => {
    const result = buildStudentRaidUsageChartData({
      releaseAt: "2025-01-01T00:00:00.000Z",
      selectedDefenseType: Defense.Heavy,
      raids: [
        {
          ...baseRaid,
          seasonIndex: 1,
          startAt: "2025-01-01T00:00:00.000Z",
          raidBoss: { uid: "binah", name: "비나" },
          jpSchedule: makeJpSchedule(101, "2025-01-01T00:00:00.000Z"),
        },
        {
          ...baseRaid,
          seasonIndex: 2,
          startAt: "2025-03-01T00:00:00.000Z",
          raidBoss: { uid: "chesed", name: "헤세드" },
          jpSchedule: makeJpSchedule(102, "2025-03-01T00:00:00.000Z"),
        },
        {
          ...baseRaid,
          seasonIndex: 3,
          startAt: "2026-01-01T00:00:00.000Z",
          raidBoss: { uid: "hod", name: "호드" },
          jpSchedule: makeJpSchedule(103, "2026-01-01T00:00:00.000Z"),
        },
      ],
      statistics: [],
    });

    expect(result.rows.map((row) => row.xAxisLabel)).toEqual(["2025", "", "2026"]);
    expect(result.rows.map((row) => row.bossName)).toEqual(["비나", "헤세드", "호드"]);
  });

  it("omits raid rows before the ranks statistics availability window", () => {
    const result = buildStudentRaidUsageChartData({
      releaseAt: "2024-01-01T00:00:00.000Z",
      selectedDefenseType: Defense.Heavy,
      raids: [
        {
          ...baseRaid,
          seasonIndex: 1,
          startAt: "2024-03-10T00:00:00.000Z",
          jpSchedule: makeJpSchedule(101, "2024-02-29T00:00:00.000Z"),
        },
        {
          ...baseRaid,
          seasonIndex: 2,
          startAt: "2024-03-12T00:00:00.000Z",
          jpSchedule: makeJpSchedule(102, "2024-03-01T00:00:00.000Z"),
        },
      ],
      statistics: [
        {
          raid: { raidType: "total_assault", season: 101, defenseType: Defense.Heavy },
          studentUid: "10085",
          slotsCount: 10,
          slotsByTier: [{ tier: 8, count: 10 }],
          assistsCount: 0,
          assistsByTier: [],
        },
        {
          raid: { raidType: "total_assault", season: 102, defenseType: Defense.Heavy },
          studentUid: "10085",
          slotsCount: 20,
          slotsByTier: [{ tier: 8, count: 20 }],
          assistsCount: 0,
          assistsByTier: [],
        },
      ],
    });

    expect(result.rows.map((row) => row.seasonIndex)).toEqual([2]);
    expect(result.rows.map((row) => row.totalCount)).toEqual([20]);
  });

  it("prints a year label only once when one raid has multiple defense bars", () => {
    const result = buildStudentRaidUsageChartData({
      releaseAt: "2025-01-01T00:00:00.000Z",
      selectedDefenseType: "all",
      raids: [
        {
          ...baseRaid,
          seasonIndex: 1,
          raidType: "elimination",
          startAt: "2025-01-01T00:00:00.000Z",
          jpSchedule: makeJpSchedule(101, "2025-01-01T00:00:00.000Z"),
          defenseTypes: [
            { defenseType: Defense.Light, difficulty: "torment" },
            { defenseType: Defense.Heavy, difficulty: "torment" },
            { defenseType: Defense.Special, difficulty: "torment" },
          ],
        },
      ],
      statistics: [],
    });

    expect(result.rows.map((row) => row.xAxisLabel)).toEqual(["2025", "", ""]);
  });

  it("keeps future raid rows when statistics already exist for them", () => {
    const result = buildStudentRaidUsageChartData({
      releaseAt: "2025-01-01T00:00:00.000Z",
      selectedDefenseType: Defense.Light,
      raids: [
        {
          ...baseRaid,
          seasonIndex: 4,
          raidType: "total_assault",
          startAt: "2026-09-08T00:00:00.000Z",
          jpSchedule: makeJpSchedule(104, "2026-09-08T00:00:00.000Z"),
          defenseTypes: [{ defenseType: Defense.Light, difficulty: "torment" }],
        },
      ],
      statistics: [
        {
          raid: { raidType: "total_assault", season: 104, defenseType: Defense.Light },
          studentUid: "10085",
          slotsCount: 1015,
          slotsByTier: [{ tier: 6, count: 1015 }],
          assistsCount: 1,
          assistsByTier: [{ tier: 8, count: 1 }],
        },
      ],
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      totalCount: 1016,
      slotCount: 1015,
      assistCount: 1,
    });
  });
});
