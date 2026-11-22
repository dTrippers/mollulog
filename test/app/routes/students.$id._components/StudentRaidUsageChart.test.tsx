/** @jest-environment jsdom */
import "../../components/v2/layout/layout-test-polyfills";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "@jest/globals";
import { MemoryRouter } from "react-router";
import { Defense } from "~/graphql/graphql";
import type { RaidScheduleListItem } from "~/models/raid";
import StudentRaidUsageChart from "~/routes/students.$id._components/StudentRaidUsageChart";

function makeRaid(seasonIndex: number, startAt: string) {
  return {
    raidBoss: { uid: "binah", name: "비나" },
    seasonIndex,
    raidType: "total_assault",
    startAt,
    endAt: startAt,
    jpSchedule: { seasonIndex: seasonIndex + 100, startAt },
    defenseTypes: [{ defenseType: Defense.Heavy, difficulty: "torment" }],
  } as unknown as RaidScheduleListItem;
}

describe("StudentRaidUsageChart", () => {
  it("lists every tier, including ones without records, when only some seasons have low tiers", () => {
    render(
      <MemoryRouter>
        <StudentRaidUsageChart
          releaseAt="2025-01-01T00:00:00.000Z"
          raids={[makeRaid(1, "2025-01-01T00:00:00.000Z"), makeRaid(2, "2025-02-01T00:00:00.000Z")]}
          statistics={[
            {
              raid: { raidType: "total_assault", season: 101, defenseType: Defense.Heavy },
              studentUid: "16014",
              formUsage: [],
              slotsCount: 10,
              slotsByTier: [{ tier: 2, count: 4 }, { tier: 8, count: 6 }],
              assistsCount: 0,
              assistsByTier: [],
            },
            {
              raid: { raidType: "total_assault", season: 102, defenseType: Defense.Heavy },
              studentUid: "16014",
              formUsage: [],
              slotsCount: 5,
              slotsByTier: [{ tier: 8, count: 5 }],
              assistsCount: 0,
              assistsByTier: [],
            },
          ]}
        />
      </MemoryRouter>,
    );

    const tierLabels = ["9", "8", "7", "6", "5", "4", "3", "2"];
    const legend = screen.getByRole("list", { name: "성급 범례" });
    expect(within(legend).getAllByRole("listitem")).toHaveLength(tierLabels.length);

    const table = screen.getByRole("table");
    const headerCells = within(table).getAllByRole("columnheader");
    expect(headerCells).toHaveLength(4 + tierLabels.length);

    const [, secondSeason] = within(table).getAllByRole("row").slice(1);
    const cells = within(secondSeason!).getAllByRole("cell").map((cell) => cell.textContent);
    // 전체, 모집, 조력, then tiers 9..2: the season without 2★ records shows 0 instead of crashing.
    expect(cells).toEqual(["5", "5", "0", "0", "5", "0", "0", "0", "0", "0", "0"]);
  });
});
