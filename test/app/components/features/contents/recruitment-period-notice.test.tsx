import { describe, expect, it } from "@jest/globals";
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import ContentTimeline from "~/components/features/contents/ContentTimeline";
import ContentTimelineCompact from "~/components/features/contents/ContentTimelineCompact";
import { ContentTimelineItem, type ContentTimelineItemProps } from "~/components/features/contents/ContentTimelineItem";
import { StudentCardPopupProvider } from "~/contexts/StudentCardPopupProvider";
import { TimeZoneProvider } from "~/contexts/TimeZoneProvider";
import type { RecruitmentPeriod } from "~/domain/recruitment-period-notice";

const recruitmentPeriod: RecruitmentPeriod = {
  startAt: "2030-01-11T00:00:00.000Z",
  endAt: "2030-01-21T00:00:00.000Z",
};

const contentDates = {
  since: "2030-01-10T00:00:00.000Z",
  until: "2030-01-20T00:00:00.000Z",
};

function itemProps(overrides: Partial<ContentTimelineItemProps> = {}): ContentTimelineItemProps {
  return {
    uid: "future-event",
    name: "미래 이벤트",
    contentType: "event",
    runType: "first",
    endless: false,
    ...contentDates,
    link: "/events/future-event",
    tags: [],
    recruitmentGroupUid: "group-a",
    recruitmentPeriod,
    signedIn: false,
    ...overrides,
  };
}

function renderItem(overrides: Partial<ContentTimelineItemProps> = {}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        TimeZoneProvider,
        { timeZone: "UTC" } as ComponentProps<typeof TimeZoneProvider>,
        createElement(StudentCardPopupProvider, null, createElement(ContentTimelineItem, itemProps(overrides))),
      ),
    ),
  );
}

function compactContent(overrides: Record<string, unknown> = {}) {
  return {
    uid: "future-event",
    name: "미래 이벤트",
    since: contentDates.since,
    until: contentDates.until,
    startAt: contentDates.since,
    endAt: contentDates.until,
    endless: false,
    runType: "first" as const,
    recruitmentGroupUid: "group-a",
    recruitmentPeriod,
    link: "/events/future-event",
    contentType: "event" as const,
    isSpoiler: false,
    tags: [],
    recruitments: [],
    ...overrides,
  };
}

describe("recruitment period notices in timeline views", () => {
  it("renders the period warning before existing feature banners without a dismiss action", () => {
    const markup = renderItem({ showStudentAnalysisFeatureBanner: true });

    const periodNoticeIndex = markup.indexOf("이벤트 기간과 모집 개최 기간이 달라요");
    const featureBannerIndex = markup.indexOf("학생부에서 통계 분석을 보고 모집 여부를 판단해보세요");

    expect(periodNoticeIndex).toBeGreaterThanOrEqual(0);
    expect(featureBannerIndex).toBeGreaterThan(periodNoticeIndex);
    expect(markup).toContain("from-amber-50");
    expect(markup).toContain("from-green-50");
    expect(markup).not.toContain("배너 닫기");
  });

  it("renders a compact warning below the title when the filtered student list is empty", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          TimeZoneProvider,
          { timeZone: "UTC" } as ComponentProps<typeof TimeZoneProvider>,
          createElement(
            StudentCardPopupProvider,
            null,
            createElement(ContentTimelineCompact, {
              contents: [compactContent()],
              favoritedCounts: [],
            }),
          ),
        ),
      ),
    );

    const titleIndex = markup.indexOf("미래 이벤트");
    const noticeIndex = markup.indexOf("이벤트 기간과 모집 개최 기간이 달라요");

    expect(noticeIndex).toBeGreaterThan(titleIndex);
    expect(markup).toContain("text-amber-600");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('role="alert"');
  });

  it("omits the warning when ContentTimeline is used for the table view", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          TimeZoneProvider,
          { timeZone: "UTC" } as ComponentProps<typeof TimeZoneProvider>,
          createElement(
            StudentCardPopupProvider,
            null,
            createElement(ContentTimeline, {
              contents: [compactContent()],
              favoritedCounts: [],
              signedIn: false,
              showRecruitmentPeriodNotice: false,
            }),
          ),
        ),
      ),
    );

    expect(markup).not.toContain("이벤트 기간과 모집 개최 기간이 달라요");
  });
});
