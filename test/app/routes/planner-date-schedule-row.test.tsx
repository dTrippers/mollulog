import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { PlannerDateScheduleItem, PlannerPeriod } from "~/domain/integrated-planner";
import PlannerDateScheduleRow from "~/routes/planner._components/PlannerDateScheduleRow";

const eventPeriod: PlannerPeriod = {
  key: "event:event-1",
  kind: "event",
  name: "이벤트 하나",
  startDate: "2026-09-15",
  endDate: "2026-09-29",
  startAt: "2026-09-15T02:00:00.000Z",
  endAt: "2026-09-29T02:00:00.000Z",
  href: "/events/event-1",
  eventUid: "event-1",
  isApPlanned: true,
};

const shopPeriod: PlannerPeriod = {
  key: "shop:event-1",
  kind: "shop",
  name: "이벤트 하나 상점",
  startDate: "2026-09-15",
  endDate: "2026-10-06",
  href: "/events/event-1/shop",
  eventUid: "event-1",
};

describe("PlannerDateScheduleRow accessible name", () => {
  it("includes the AP plan when the related event has an AP plan", () => {
    const item: PlannerDateScheduleItem = {
      key: eventPeriod.key,
      period: eventPeriod,
      eventPeriod,
      shopPeriod,
      facts: [],
    };
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(PlannerDateScheduleRow, {
          item,
          allPeriods: [eventPeriod, shopPeriod],
          timeZone: "Asia/Seoul",
          shopPlans: [],
          shopPlannedEventUids: new Set<string>(),
          showResourceChanges: false,
          highlighted: false,
          focusOnMount: false,
          onHighlightedFocusComplete: () => {},
          onAddRecruitment: () => {},
          onEditRecruitment: () => {},
        }),
      ),
    );

    expect(markup).toMatch(/<article aria-label="이벤트 하나, AP 모으기 계획,/);
  });
});
