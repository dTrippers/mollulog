import { describe, expect, test } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { PlannerDayResources, PlannerPeriod } from "~/domain/integrated-planner";
import PlannerCalendar, { getPlannerParentFocusTargetKey } from "~/routes/planner._components/PlannerCalendar";

function renderCalendar(
  forecastStatus: "ready" | "pending" | "input-needed" | "unavailable" = "ready",
  {
    calendarResources = {},
    periods = [],
    hasPreviousCalendarResources = false,
  }: {
    calendarResources?: Record<string, PlannerDayResources>;
    periods?: PlannerPeriod[];
    hasPreviousCalendarResources?: boolean;
  } = {},
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/planner"] },
      createElement(PlannerCalendar, {
        month: "2026-10",
        onMonthChange: () => {},
        todayDateKey: "2026-10-10",
        periods,
        scheduleAvailability: { dateFacts: true, ongoing: true },
        calendarResources,
        raidScheduleFacts: [],
        pyroxeneAssumptions: null,
        forecastStatus,
        statusMessages: [],
        progressMessages: [],
        isSignedIn: false,
        timeZone: "Asia/Seoul",
        oneOffEntries: [],
        guestStorageStatus: "ready",
        recruitmentSavedStates: [],
        recruitmentIsSaving: false,
        recruitmentSaveResult: null,
        onSaveRecruitment: () => {},
        shopPlans: [],
        hasPreviousCalendarResources,
      }),
    ),
  );
}

describe("PlannerCalendar monthly header and initial selection", () => {
  test("returns from action-launched editors to the add-plan trigger without changing existing edit targets", () => {
    for (const action of ["recruitment", "buy", "package", "other"]) {
      expect(getPlannerParentFocusTargetKey(`planner-action-${action}`)).toBe("planner-add-plan");
    }
    expect(getPlannerParentFocusTargetKey("planner-quick-edit-entry-1")).toBe("planner-quick-edit-entry-1");
  });

  test("every action-launched return target exists in the summary footer of the side detail", () => {
    // The sheet renders the same detailFooter, and BottomSheet is not mounted during SSR,
    // so the side detail's summary markup is the static check for both paths.
    const markup = renderCalendar();
    for (const action of ["recruitment", "buy", "package", "other"]) {
      const target = getPlannerParentFocusTargetKey(`planner-action-${action}`);
      expect(markup).toContain(`data-planner-focus-key="${target}"`);
    }
    expect(markup).toContain('<aside');
  });

  test("shows one month, month navigation, today, and an initially selected today beside the detail", () => {
    const markup = renderCalendar();

    expect(markup).toContain("2026년 10월");
    expect(markup).toContain(
      'class="sticky top-0 z-20 space-y-1 bg-background/95 pb-2 backdrop-blur-sm max-sm:-mx-4 max-sm:px-4"',
    );
    expect(markup).toContain("이전 달");
    expect(markup).toContain("다음 달");
    expect(markup).toContain(">오늘</span>");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('id="planner-date-aside-title"');
    expect(markup).toContain("10월 10일 토요일");
    expect(markup).toContain("오늘");
    expect(markup).not.toContain("다음 달 이어보기");
    expect(markup).not.toContain('role="dialog"');
  });

  test("shows the input-needed link in the fixed forecast status row", () => {
    const markup = renderCalendar("input-needed");

    expect(markup).toContain("보유 재화 입력 필요 · 입력하기");
    expect(markup).toContain('href="/utils/pyroxene"');
    expect(markup).toContain('role="status"');
  });

  test("keeps previous detail resource changes visible and busy during recalculation", () => {
    const event: PlannerPeriod = {
      key: "event:test",
      kind: "event",
      eventUid: "test-event",
      name: "예정 이벤트",
      startDate: "2026-10-10",
      endDate: "2026-10-15",
      startAt: "2026-10-09T15:00:00.000Z",
      endAt: "2026-10-15T15:00:00.000Z",
    };
    const resources: PlannerDayResources = {
      dateKey: "2026-10-10",
      changes: [{ key: "pyroxene", quantity: 600 }],
      sources: [
        {
          key: "event-source",
          type: "event",
          label: "예정 이벤트 보상",
          eventUid: "test-event",
          changes: [{ key: "pyroxene", quantity: 600 }],
        },
      ],
    };
    const markup = renderCalendar("pending", {
      calendarResources: { [resources.dateKey]: resources },
      periods: [event],
      hasPreviousCalendarResources: true,
    });

    expect(markup).toContain('class="min-w-0 justify-self-end opacity-40" aria-busy="true"');
    expect(markup).toContain("+600");
  });

  test("renders pending and unavailable forecast status in the header rather than pushing the calendar", () => {
    const pendingMarkup = renderCalendar("pending");
    const unavailableMarkup = renderCalendar("unavailable");

    expect(pendingMarkup).toContain("예상 재화 계산 중");
    expect(unavailableMarkup).toContain("예상 재화 계산 실패");
    expect(unavailableMarkup).toContain("예상 재화 변동을 계산할 수 없어요.");
    expect(unavailableMarkup).not.toContain('role="alert"');
  });
});
