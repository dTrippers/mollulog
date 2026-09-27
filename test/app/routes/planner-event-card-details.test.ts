import { describe, expect, test } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { PlannerPeriod } from "~/domain/integrated-planner";
import PlannerEventCardDetails from "~/routes/planner._components/PlannerEventCardDetails";

const eventPeriod: PlannerPeriod = {
  key: "event:event-1",
  kind: "event",
  name: "이벤트",
  startDate: "2026-09-15",
  endDate: "2026-09-29",
  href: "/events/event-1",
  eventUid: "event-1",
};

function renderCard(
  recruitmentPeriods: PlannerPeriod[],
  { shopPeriod, shopPlans = [] }: { shopPeriod?: PlannerPeriod; shopPlans?: { timelineUid: string }[] } = {},
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(PlannerEventCardDetails, {
        eventPeriod,
        shopPeriod,
        recruitmentPeriods,
        shopPlans,
        facts: [],
        timeZone: "Asia/Seoul",
        onAddRecruitment: () => {},
        onEditRecruitment: () => {},
      }),
    ),
  );
}

describe("PlannerEventCardDetails", () => {
  test("planned recruitment shows the 관심 학생 수정 label, no 보유 재화 수정 button, and a favorite heart badge", () => {
    const markup = renderCard([
      {
        key: "recruitment:event-1:2026-09-29",
        kind: "recruitment",
        name: "이벤트",
        startDate: "2026-09-15",
        endDate: "2026-09-29",
        eventUid: "event-1",
        startAt: "2026-09-15T02:00:00.000Z",
        endAt: "2026-09-29T02:00:00.000Z",
        hasRecruitmentPlan: true,
        students: [{ uid: "student-uid", imageUid: "student-image-uid", name: "학생 하나" }],
      },
    ]);

    expect(markup).toContain("관심 학생 수정");
    expect(markup).not.toContain("모집 수정");
    expect(markup).not.toContain("보유 재화 수정");
    // Heart badge: solid red circle with the HeartIcon svg, on the portrait group.
    expect(markup).toContain("bg-red-500");
    expect(markup).toMatch(/aria-label="관심 학생 학생 하나/);
  });

  test("unplanned recruitment keeps 모집 계획 추가 and shows no favorite heart badge", () => {
    const markup = renderCard([
      {
        key: "recruitment:event-1:2026-09-29",
        kind: "recruitment",
        name: "이벤트",
        startDate: "2026-09-15",
        endDate: "2026-09-29",
        eventUid: "event-1",
        startAt: "2026-09-15T02:00:00.000Z",
        endAt: "2026-09-29T02:00:00.000Z",
        hasRecruitmentPlan: false,
        students: [{ uid: "student-uid", imageUid: "student-image-uid", name: "학생 하나" }],
      },
    ]);

    expect(markup).toContain("모집 계획 추가");
    expect(markup).not.toContain("bg-red-500");
    expect(markup).not.toMatch(/aria-label="관심 학생/);
  });

  test("shows the AP planner action only when an event shop target source exists", () => {
    const recruitmentOnlyMarkup = renderCard([
      {
        key: "recruitment:event-1:2026-09-29",
        kind: "recruitment",
        name: "이벤트",
        startDate: "2026-09-15",
        endDate: "2026-09-29",
        eventUid: "event-1",
        startAt: "2026-09-15T02:00:00.000Z",
        endAt: "2026-09-29T02:00:00.000Z",
        hasRecruitmentPlan: false,
        students: [],
      },
    ]);
    expect(recruitmentOnlyMarkup).not.toContain(">AP 플래너</a>");

    const shopPeriod: PlannerPeriod = {
      key: "shop:event-1",
      kind: "shop",
      name: "이벤트 상점",
      startDate: "2026-09-15",
      endDate: "2026-10-06",
      href: "/events/event-1/shop",
      eventUid: "event-1",
    };
    const shopMarkup = renderCard([], { shopPeriod });
    expect(shopMarkup).toMatch(/href="\/utils\/ap\?eventUid=event-1"[^>]*>AP 플래너<\/a>/);
  });
});
