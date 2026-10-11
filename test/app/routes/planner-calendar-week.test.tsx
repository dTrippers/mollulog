import { describe, expect, test } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildPlannerMonthDays,
  buildPlannerWeekLayout,
  type PlannerDayResources,
  type PlannerPeriod,
} from "~/domain/integrated-planner";
import PlannerCalendarWeek from "~/routes/planner._components/PlannerCalendarWeek";

function getWeek() {
  const week = buildPlannerMonthDays("2026-10").find((days) => days[0].dateKey === "2026-10-05");
  if (!week) throw new Error("test week missing");
  return week;
}

function renderWeek({
  forecastStatus = "ready",
  calendarResources = {},
  hasPreviousCalendarResources = false,
  periods = [],
}: {
  forecastStatus?: "ready" | "pending" | "input-needed" | "unavailable";
  calendarResources?: Record<string, PlannerDayResources>;
  hasPreviousCalendarResources?: boolean;
  periods?: PlannerPeriod[];
} = {}) {
  const week = getWeek();
  const weekLayout = buildPlannerWeekLayout(periods, week, "Asia/Seoul");
  return renderToStaticMarkup(
    createElement(PlannerCalendarWeek, {
      week,
      periods,
      calendarResources,
      forecastStatus,
      hasPreviousCalendarResources,
      weekLayout,
      raidScheduleFacts: [],
      timeZone: "Asia/Seoul",
      todayDateKey: "2026-10-10",
      selectedDate: "2026-10-10",
      isFirstWeek: false,
      isLastWeek: false,
      onSelectDate: () => {},
      onSelectPeriod: () => {},
      onTodayCellRef: () => {},
      shopPlannedEventUids: new Set<string>(),
    }),
  );
}

function resourceDay(dateKey: string, quantity: number): PlannerDayResources {
  return {
    dateKey,
    changes: [{ key: "pyroxene", quantity }],
    sources: [],
  };
}

describe("PlannerCalendarWeek rendering", () => {
  test("keeps seven fixed-height resource slots in pending and ready states", () => {
    const week = getWeek();
    const resources = Object.fromEntries(week.map(({ dateKey }) => [dateKey, resourceDay(dateKey, 600)]));
    const readyMarkup = renderWeek({ calendarResources: resources });
    const pendingMarkup = renderWeek({
      forecastStatus: "pending",
      calendarResources: resources,
      hasPreviousCalendarResources: true,
    });
    const emptyPendingMarkup = renderWeek({ forecastStatus: "pending" });
    const slots = (markup: string) => [...markup.matchAll(/<div data-planner-resource-slot="true"([^>]*)>(.*?)<\/div>/g)];

    expect(slots(readyMarkup)).toHaveLength(7);
    expect(slots(pendingMarkup)).toHaveLength(7);
    expect(slots(emptyPendingMarkup)).toHaveLength(7);
    const heightClass = (match: RegExpMatchArray) => match[1].match(/class="([^"]+)"/)?.[1];
    expect(new Set(slots(readyMarkup).map(heightClass)).size).toBe(1);
    expect(new Set(slots(pendingMarkup).map(heightClass)).size).toBe(1);
    expect(new Set(slots(emptyPendingMarkup).map(heightClass)).size).toBe(1);
    expect(slots(readyMarkup)[0][1]).not.toContain('aria-busy="true"');
    expect(slots(pendingMarkup)[0][1]).toContain('aria-busy="true"');
    expect(slots(pendingMarkup)[0][1]).toContain("opacity-40");
    expect(slots(emptyPendingMarkup)[0][1]).not.toContain('aria-busy="true"');
    expect(pendingMarkup).toContain("계산 중");
  });

  test("renders every event lane without collapsing schedules into a count", () => {
    const periods: PlannerPeriod[] = Array.from({ length: 6 }, (_, index) => ({
      key: `event:${index}`,
      kind: "event",
      eventUid: `event-${index}`,
      name: `겹치는 일정 ${index + 1}`,
      startDate: "2026-10-05",
      endDate: "2026-10-09",
      startAt: "2026-10-04T15:00:00.000Z",
      endAt: "2026-10-09T15:00:00.000Z",
    }));
    const markup = renderWeek({ periods });

    expect((markup.match(/<button[^>]*title=/g) ?? []).length).toBe(6);
    for (const period of periods) expect(markup).toContain(period.name);
    expect(markup).toContain("repeat(6, 28px)");
    expect(markup).not.toContain("+N");
  });

  test("keeps a short-strip title visible while its accessible name retains the full name and range", () => {
    const period: PlannerPeriod = {
      key: "event:short",
      kind: "event",
      eventUid: "short",
      name: "짧은 일정 전체 이름",
      startDate: "2026-10-05",
      endDate: "2026-10-06",
      startAt: "2026-10-04T15:00:00.000Z",
      endAt: "2026-10-05T15:00:00.000Z",
    };
    const markup = renderWeek({ periods: [period] });

    expect(markup).toContain('aria-label="짧은 일정 전체 이름');
    expect(markup).toContain('class="min-w-[2.5em] flex-[0_1_auto] truncate">짧은 일정 전체 이름</span>');
    expect(markup).not.toContain(`max-sm:hidden">짧은 일정 전체 이름</span>`);
    expect(markup).toContain("10/5 00:00 ~ 10/6 00:00");
  });

  test("hides student avatars and end markers on short strips at every width, keeping the name", () => {
    const students = [
      { uid: "student-1", imageUid: null, name: "학생 하나" },
      { uid: "student-2", imageUid: null, name: "학생 둘" },
    ];
    const shortPeriod: PlannerPeriod = {
      key: "event:short-students",
      kind: "event",
      eventUid: "short-students",
      name: "짧은 모집 일정",
      startDate: "2026-10-05",
      endDate: "2026-10-06",
      startAt: "2026-10-04T15:00:00.000Z",
      endAt: "2026-10-05T15:00:00.000Z",
      hasRecruitmentPlan: true,
      students,
    };
    const shortMarkup = renderWeek({ periods: [shortPeriod] });

    expect(shortMarkup).toContain('class="min-w-[2.5em] flex-[0_1_auto] truncate">짧은 모집 일정</span>');
    // 짧은 띠는 아바타와 종료 점을 렌더링하지 않아, display 클래스가 충돌하지 않습니다.
    expect(shortMarkup).not.toContain('alt="학생 하나"');
    expect(shortMarkup).not.toContain('alt="학생 둘"');
    expect(shortMarkup).not.toContain("bg-current");
    expect(shortMarkup).not.toContain("text-[10px] font-normal opacity-75");
    expect(shortMarkup).not.toContain('max-sm:hidden">짧은 모집 일정');
    expect(shortMarkup).toContain('aria-label="짧은 모집 일정');

    const longPeriod: PlannerPeriod = {
      ...shortPeriod,
      key: "event:long-students",
      eventUid: "long-students",
      name: "긴 모집 일정",
      endDate: "2026-10-11",
      endAt: "2026-10-12T14:59:59.000Z",
    };
    const longMarkup = renderWeek({ periods: [longPeriod] });

    expect(longMarkup).toContain('alt="학생 하나"');
    expect(longMarkup).toContain('alt="학생 둘"');
    expect(longMarkup).toContain("bg-current");
  });

  test("renders a zero total with its resource icon and quantity", () => {
    const markup = renderWeek({
      calendarResources: { "2026-10-05": resourceDay("2026-10-05", 0) },
    });
    const dayButton = markup.match(/<button[^>]*aria-label="2026년 10월 5일[^>]*>(.*?)<\/button>/)?.[1] ?? "";

    expect(dayButton).toContain('alt="청휘석"');
    expect(dayButton).toContain(">0</span>");
  });
});
