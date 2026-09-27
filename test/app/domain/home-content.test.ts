import { describe, expect, it } from "@jest/globals";
import {
  type HomeCampaign,
  type HomeJointFiringDrill,
  selectHomeCampaigns,
  selectHomeJointFiringDrill,
  selectHomeMainStory,
} from "~/domain/home-content";
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

  it("does not use an ongoing main story when no event is available", () => {
    const mainStory = content({ uid: "main-story", contentType: "main_story" });
    expect(selectHomeMainEvent([mainStory], now)).toBeNull();
  });

  it("chooses the closest upcoming event instead of a main story", () => {
    const fartherEvent = content({
      uid: "farther-event",
      contentType: "event",
      startAt: "2026-09-10T02:00:00.000Z",
      endAt: "2026-09-22T02:00:00.000Z",
    });
    const nearestEvent = content({
      uid: "nearest-event",
      contentType: "event",
      startAt: "2026-09-01T02:00:00.000Z",
      endAt: "2026-09-15T02:00:00.000Z",
    });
    const futureMainStory = content({
      uid: "future-main-story",
      contentType: "main_story",
      startAt: "2026-08-20T02:00:00.000Z",
    });

    expect(selectHomeMainEvent([fartherEvent, futureMainStory, nearestEvent], now)?.uid).toBe("nearest-event");
  });
});

function campaign(overrides: Partial<HomeCampaign> & Pick<HomeCampaign, "uid">): HomeCampaign {
  return {
    category: ["schedule"],
    multiplier: 2,
    startAt: "2026-08-17T00:00:00.000Z",
    endAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("selectHomeCampaigns", () => {
  it("keeps ongoing campaigns, joins category labels, and sorts by end time", () => {
    const result = selectHomeCampaigns(
      [
        campaign({ uid: "later-ending", endAt: "2026-08-22T00:00:00.000Z" }),
        campaign({ uid: "ended", endAt: "2026-08-18T04:59:59.000Z" }),
        campaign({ uid: "upcoming", startAt: "2026-08-18T05:00:01.000Z" }),
        campaign({ uid: "multi-category", category: ["schedule", "scrimmage"], endAt: "2026-08-19T00:00:00.000Z" }),
      ],
      now,
    );

    expect(result).toEqual({
      status: "success",
      campaigns: [
        {
          uid: "multi-category",
          categoryLabel: "스케줄 · 학원교류회",
          multiplier: 2,
          endAt: "2026-08-19T00:00:00.000Z",
        },
        { uid: "later-ending", categoryLabel: "스케줄", multiplier: 2, endAt: "2026-08-22T00:00:00.000Z" },
      ],
    });
  });

  it("returns an error for an ongoing campaign with an unmapped category", () => {
    expect(selectHomeCampaigns([campaign({ uid: "unknown", category: ["future_category"] })], now)).toEqual({
      status: "error",
    });
  });
});

function drill(overrides: Partial<HomeJointFiringDrill> = {}): HomeJointFiringDrill {
  return {
    season: 52,
    drillType: "shooting",
    schedules: [
      {
        region: "gl",
        startAt: "2026-08-20T00:00:00.000Z",
        endAt: "2026-08-23T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("selectHomeJointFiringDrill", () => {
  it("prefers an ongoing GL schedule over a closer upcoming schedule", () => {
    expect(
      selectHomeJointFiringDrill(
        [
          drill({
            season: 51,
            schedules: [{ region: "gl", startAt: "2026-08-10T00:00:00.000Z", endAt: "2026-08-19T00:00:00.000Z" }],
          }),
          drill(),
          drill({
            season: 99,
            schedules: [{ region: "jp", startAt: "2026-08-18T00:00:00.000Z", endAt: "2026-08-20T00:00:00.000Z" }],
          }),
        ],
        now,
      ),
    ).toEqual({
      kind: "ongoing",
      season: 51,
      drillTypeLabel: "사격",
      endAt: "2026-08-19T00:00:00.000Z",
    });
  });

  it("selects the closest upcoming GL schedule and distinguishes no schedule", () => {
    const closest = drill({
      season: 53,
      schedules: [{ region: "gl", startAt: "2026-08-19T00:00:00.000Z", endAt: null }],
    });
    const farther = drill({
      season: 54,
      schedules: [{ region: "gl", startAt: "2026-08-25T00:00:00.000Z", endAt: null }],
    });

    expect(selectHomeJointFiringDrill([farther, closest], now)).toEqual({
      kind: "upcoming",
      season: 53,
      drillTypeLabel: "사격",
      startAt: "2026-08-19T00:00:00.000Z",
    });
    expect(selectHomeJointFiringDrill([drill({ schedules: [] })], now)).toEqual({ kind: "none" });
  });

  it("treats an active schedule without an end or a type label as an error", () => {
    expect(
      selectHomeJointFiringDrill(
        [drill({ schedules: [{ region: "gl", startAt: "2026-08-18T00:00:00.000Z", endAt: null }] })],
        now,
      ),
    ).toEqual({ kind: "error" });
    expect(selectHomeJointFiringDrill([drill({ drillType: "future_type" })], now)).toEqual({ kind: "error" });
  });
});

describe("selectHomeMainStory", () => {
  it("keeps an ended published story eligible and rejects a not-yet-published row", () => {
    const ended = content({
      uid: "ended",
      contentType: "main_story",
      startAt: "2026-08-17T05:00:00.000Z",
      endAt: "2026-08-18T04:59:59.000Z",
    });
    const future = content({ uid: "future", contentType: "main_story", startAt: "2026-08-21T05:00:00.000Z" });
    const startsNow = content({ uid: "now", contentType: "main_story", startAt: now });

    expect(selectHomeMainStory(ended, now)).toBe(ended);
    expect(selectHomeMainStory(startsNow, now)).toBe(startsNow);
    expect(selectHomeMainStory(future, now)).toBeNull();
    expect(selectHomeMainStory(null, now)).toBeNull();
  });
});
