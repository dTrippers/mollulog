import { describe, expect, it } from "@jest/globals";
import type { TimelineContent } from "~/domain/timeline-content";
import { selectHomeMainEvent } from "~/views/home";

const now = "2026-08-18T05:00:00.000Z";

function content(overrides: Partial<TimelineContent> & { uid: string }): TimelineContent {
  return {
    name: overrides.uid,
    nameI18n: {},
    startAt: "2026-08-18T02:00:00.000Z",
    endAt: "2026-09-22T02:00:00.000Z",
    endless: false,
    imageUrl: null,
    videos: [],
    contentType: "event",
    runType: "first",
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

describe("selectHomeMainEvent", () => {
  it("prefers an ongoing event over a main story", () => {
    const event = content({ uid: "event", contentType: "event" });
    const mainStory = content({ uid: "main-story", contentType: "main_story" });

    expect(selectHomeMainEvent([mainStory, event], now)?.uid).toBe("event");
  });

  it("falls back to an ongoing main story when there is no ongoing event", () => {
    const mainStory = content({ uid: "main-story", contentType: "main_story" });
    const upcomingEvent = content({
      uid: "upcoming-event",
      contentType: "event",
      startAt: "2026-09-01T02:00:00.000Z",
      endAt: "2026-09-15T02:00:00.000Z",
    });

    expect(selectHomeMainEvent([upcomingEvent, mainStory], now)?.uid).toBe("main-story");
  });

  it("prefers a main story with recruitment information", () => {
    const mainStoryWithoutRecruitment = content({
      uid: "main-story-without-recruitment",
      contentType: "main_story",
    });
    const mainStoryWithRecruitment = content({
      uid: "main-story-with-recruitment",
      contentType: "main_story",
      recruitmentGroupUid: "recruitment-group",
    });

    expect(selectHomeMainEvent([mainStoryWithoutRecruitment, mainStoryWithRecruitment], now)?.uid).toBe(
      "main-story-with-recruitment",
    );
  });

  it("keeps the upcoming event fallback when no event or main story is ongoing", () => {
    const upcomingEvent = content({
      uid: "upcoming-event",
      contentType: "event",
      startAt: "2026-09-01T02:00:00.000Z",
      endAt: "2026-09-15T02:00:00.000Z",
    });
    const futureMainStory = content({
      uid: "future-main-story",
      contentType: "main_story",
      startAt: "2026-10-01T02:00:00.000Z",
    });

    expect(selectHomeMainEvent([futureMainStory, upcomingEvent], now)?.uid).toBe("upcoming-event");
  });
});
