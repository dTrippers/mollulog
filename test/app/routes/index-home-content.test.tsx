import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { TimeZoneProvider } from "~/contexts/TimeZoneProvider";
import HomeMainStoryCard from "~/routes/_index._components/HomeMainStoryCard";
import HomeRaidEmptyState from "~/routes/_index._components/HomeRaidEmptyState";
import HomeStatusSummary from "~/routes/_index._components/HomeStatusSummary";
import type { TimelineContent } from "~/models/timeline-content";

afterEach(() => {
  jest.useRealTimers();
});

function mainStory(overrides: Partial<TimelineContent> & Pick<TimelineContent, "uid">): TimelineContent {
  return {
    name: overrides.uid,
    nameI18n: {},
    startAt: "2026-09-15T00:00:00.000Z",
    endAt: null,
    endless: true,
    imageUrl: null,
    videos: [],
    contentType: "main_story",
    runType: "permanent",
    occurrence: null,
    contentUid: null,
    shopContentUid: null,
    recruitmentGroupUid: null,
    recruitmentStudentUids: null,
    confirmed: true,
    isSpoiler: false,
    tags: [],
    earnablePyroxene: null,
    syncedAt: null,
    ...overrides,
  };
}

describe("home content presentation", () => {
  it("renders campaign failure without hiding the joint firing drill summary", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HomeStatusSummary
          campaigns={{ status: "error" }}
          jointFiringDrills={{ status: "success", data: [] }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("캠페인 정보를 불러오지 못했어요");
    expect(markup).toContain("종합전술시험");
    expect(markup).toContain("예정 없음");
    expect(markup).not.toContain("진행중인 캠페인 없음");
    expect(markup).toContain('href="/futures"');
    expect(markup).toContain("<dl");
    expect(markup).toContain("<dt");
    expect(markup).toContain("<dd");
    expect(markup).toContain('class="mt-3 flex flex-col gap-1.5"');
    expect(markup).toContain('class="flex items-baseline gap-3"');
    expect(markup.match(/class="flex items-baseline gap-3"/g)).toHaveLength(2);
    expect(markup).not.toContain("<ul");
    expect(markup).not.toContain("bg-card");
    expect(markup).not.toContain("animate-pulse");
  });

  it("renders a successful empty campaign state separately from a drill source failure", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HomeStatusSummary
          campaigns={{ status: "success", data: [] }}
          jointFiringDrills={{ status: "error" }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("진행중인 캠페인 없음");
    expect(markup).toContain("일정을 불러오지 못했어요");
    expect(markup).not.toContain("캠페인 정보를 불러오지 못했어요");
  });

  it("renders one compact multi-category campaign summary and the upcoming drill wording", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-27T12:00:00.000Z").getTime());
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HomeStatusSummary
          campaigns={{
            status: "success",
            data: [
              {
                uid: "schedule-scrimmage",
                category: ["schedule", "scrimmage"],
                multiplier: 2,
                startAt: "2026-09-25T00:00:00.000Z",
                endAt: "2026-09-29T00:00:00.000Z",
              },
              {
                uid: "schedule-campaign",
                category: ["schedule"],
                multiplier: 3,
                startAt: "2026-09-25T00:00:00.000Z",
                endAt: "2026-09-30T00:00:00.000Z",
              },
            ],
          }}
          jointFiringDrills={{
            status: "success",
            data: [
              {
                season: 52,
                drillType: "shooting",
                schedules: [
                  { region: "gl", startAt: "2026-09-29T00:00:00.000Z", endAt: "2026-10-06T00:00:00.000Z" },
                ],
              },
            ],
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("스케줄 · 학원교류회 보상량 2배");
    expect(markup).toContain("스케줄 보상량 3배");
    expect(markup).toContain('class="flex min-w-0 flex-1 flex-col items-start gap-y-1 text-sm"');
    expect(markup.match(/class="break-keep"/g)).toHaveLength(2);
    expect(markup).toContain("종합전술시험");
    expect(markup).toContain("52차 사격시험");
    expect(markup).toContain("9/29 시작 예정");
    expect(markup).toContain('href="/futures"');
    expect(markup).not.toContain("캠페인 · 일정");
  });

  it("renders an ongoing joint firing drill with the home 시험 suffix and end status", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-27T12:00:00.000Z").getTime());
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HomeStatusSummary
          campaigns={{ status: "success", data: [] }}
          jointFiringDrills={{
            status: "success",
            data: [
              {
                season: 52,
                drillType: "shooting",
                schedules: [
                  { region: "gl", startAt: "2026-09-25T00:00:00.000Z", endAt: "2026-09-29T00:00:00.000Z" },
                ],
              },
            ],
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("52차 사격시험");
    expect(markup).toContain(" 종료");
    expect(markup).not.toContain("시작 예정");
  });

  it("keeps the main story link in its query-failure state and omits its thumbnail", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HomeMainStoryCard source={{ status: "error" }} />
      </MemoryRouter>,
    );

    expect(markup).toContain('href="/mainstory"');
    expect(markup).toContain("메인 스토리 정보를 불러오지 못했어요");
    expect(markup).not.toContain("<img");
  });

  it("renders the unpublished main story message when no story rows are available", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-27T12:00:00.000Z").getTime());
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HomeMainStoryCard source={{ status: "success", data: null }} />
      </MemoryRouter>,
    );

    expect(markup).toContain('href="/mainstory"');
    expect(markup).toContain("공개된 메인 스토리가 없어요");
    expect(markup).not.toContain("<img");
  });

  it("shows the latest published story name, date, image, and link", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-27T12:00:00.000Z").getTime());
    const current = mainStory({
      uid: "published-main-story",
      name: "최근 공개된 챕터",
      startAt: "2026-09-14T16:00:00.000Z",
      endAt: "2026-09-16T12:00:00.000Z",
      imageUrl: "https://assets.example/recent-main-story.webp",
    });
    const markup = renderToStaticMarkup(
      <TimeZoneProvider timeZone="Asia/Seoul">
        <MemoryRouter>
        <HomeMainStoryCard source={{ status: "success", data: current }} />
        </MemoryRouter>
      </TimeZoneProvider>,
    );

    expect(markup).toContain("최근 공개된 챕터");
    expect(markup).toContain("9/15 공개");
    expect(markup).toContain('<img src="https://assets.example/recent-main-story.webp"');
    expect(markup).toContain('href="/mainstory"');
  });

  it("renders a static ratio-sized raid empty state", () => {
    const markup = renderToStaticMarkup(<HomeRaidEmptyState message="예정된 총력전·대결전이 없어요" />);

    expect(markup).toContain("aspect-3/1");
    expect(markup).toContain("예정된 총력전·대결전이 없어요");
    expect(markup).not.toContain("<a");
    expect(markup).not.toContain("border-");
  });
});
