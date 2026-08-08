import { describe, expect, it } from "@jest/globals";
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { TimeZoneProvider } from "~/contexts/TimeZoneProvider";
import { Defense, Terrain } from "~/graphql/graphql";
import type { RaidScheduleListItem } from "~/models/raid";
import RaidPortalScreen, { getNearestUpcomingRaid } from "~/routes/raids._components/RaidPortalScreen";
import type { RaidPortalData, RaidPortalUpcomingRaid } from "~/views/raid-portal";

function raid({
  uid,
  raidType = "total_assault",
  seasonIndex,
  name,
  startAt,
  endAt = "2026-08-20T00:00:00.000Z",
}: {
  uid: string;
  raidType?: string;
  seasonIndex: number;
  name: string;
  startAt: string;
  endAt?: string | null;
}): RaidScheduleListItem {
  return {
    uid,
    raidType,
    seasonIndex,
    region: "gl",
    terrain: Terrain.Street,
    startAt,
    endAt,
    attackType: null,
    raidBoss: { uid: `boss-${uid}`, name },
    defenseTypeSets: [
      {
        difficulty: null,
        defenseTypes: [Defense.Heavy],
        primaryDefenseType: Defense.Heavy,
        secondaryDefenseTypes: [],
      },
    ],
    defenseTypes: [
      {
        defenseType: Defense.Heavy,
        difficulty: null,
        primary: true,
        setIndex: 0,
      },
    ],
    jpSchedule: null,
  };
}

function upcoming(raidItem: RaidScheduleListItem): RaidPortalUpcomingRaid {
  return { raid: raidItem };
}

function renderScreen(data: Partial<RaidPortalData> = {}) {
  const props: RaidPortalData = {
    currentRaids: [],
    upcomingRaids: [],
    recurringStudents: [],
    recurringStudentsStatus: "unavailable",
    ...data,
  };

  return renderToStaticMarkup(
    createElement(
      TimeZoneProvider,
      { timeZone: "Asia/Seoul" } as ComponentProps<typeof TimeZoneProvider>,
      createElement(MemoryRouter, null, createElement(RaidPortalScreen, props)),
    ),
  );
}

describe("RaidPortalScreen upcoming presentation", () => {
  it("selects the nearest upcoming schedule across raid types", () => {
    const grandAssault = raid({
      uid: "grand-assault-40",
      raidType: "elimination",
      seasonIndex: 40,
      name: "먼 미래 보스",
      startAt: "2026-08-30T00:00:00.000Z",
    });
    const totalAssault = raid({
      uid: "total-assault-90",
      seasonIndex: 90,
      name: "가장 가까운 보스",
      startAt: "2026-08-12T00:00:00.000Z",
    });

    expect(getNearestUpcomingRaid([upcoming(grandAssault), upcoming(totalAssault)])?.raid.uid).toBe(totalAssault.uid);

    const markup = renderScreen({
      upcomingRaids: [upcoming(grandAssault), upcoming(totalAssault)],
    });

    expect(markup).toContain("예정");
    expect(markup).toContain("가장 가까운 보스");
    expect(markup.match(/가장 가까운 보스/g)).toHaveLength(1);
    expect(markup.match(/먼 미래 보스/g)).toHaveLength(2);
    expect(markup).toContain("2026.08.12");
    expect(markup).toContain("08.20");
    expect(markup).toContain("중장갑");
    expect(markup).toContain('href="/raids/total-assault/90"');
    expect(markup).toContain('href="/raids/total-assault/90/ranks"');
    expect(markup).toContain('href="/raids/total-assault/90/videos"');
    expect(markup).toContain(
      'href="/timelines?bossUid=boss-total-assault-90&amp;terrain=street&amp;defenseType=heavy"',
    );
  });

  it("includes the end year for a cross-year featured upcoming raid", () => {
    const crossYear = raid({
      uid: "total-assault-cross-year",
      seasonIndex: 91,
      name: "연말 보스",
      startAt: "2026-12-28T00:00:00.000Z",
      endAt: "2027-01-06T00:00:00.000Z",
    });

    const markup = renderScreen({
      upcomingRaids: [upcoming(crossYear)],
    });

    expect(markup).toContain("2026.12.28 ~ 2027.01.06");
  });

  it("omits the promoted item from the lower season section but keeps it in student usage", () => {
    const promoted = raid({
      uid: "total-assault-90",
      seasonIndex: 90,
      name: "승격 보스",
      startAt: "2026-08-12T00:00:00.000Z",
    });

    const markup = renderScreen({
      upcomingRaids: [upcoming(promoted)],
      recurringStudents: [
        {
          studentUid: "student-1",
          name: "학생",
          totalCount: 10,
          raidKeys: ["total_assault:90"],
          raidUsages: [{ raidKey: "total_assault:90", count: 10, usageRate: 1 }],
        },
      ],
      recurringStudentsStatus: "ready",
    });

    expect(markup).not.toContain("다가오는 시즌");
    expect(markup).toContain("앞으로의 학생 출전률");
    expect(markup).toContain("총력전 #90");
    expect(markup.match(/승격 보스/g)).toHaveLength(2);
  });

  it("keeps current raid strategy-video presentation and uses one empty state only with no schedules", () => {
    const current = raid({
      uid: "current-raid",
      seasonIndex: 89,
      name: "현재 보스",
      startAt: "2026-08-01T00:00:00.000Z",
      endAt: "2026-08-19T00:00:00.000Z",
    });

    const currentMarkup = renderScreen({
      currentRaids: [
        {
          raid: current,
          videos: [],
          videoStatus: "ready",
          partyStudents: {},
        },
      ],
    });

    expect(currentMarkup).toContain("공략 영상");
    expect(currentMarkup).not.toContain("예정");

    const emptyMarkup = renderScreen();
    expect(emptyMarkup).toContain("현재 진행 중이거나 예정된 총력전/대결전이 없어요");
    expect(emptyMarkup).not.toContain("다가오는 시즌");
    expect(emptyMarkup).not.toContain("앞으로의 학생 출전률");
  });
});
