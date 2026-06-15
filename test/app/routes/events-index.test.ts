import { describe, expect, it } from "@jest/globals";
import type { EventListItem, EventListSchedule } from "../../../app/models/event-content";
import { type EventFilterState, filterEventList } from "../../../app/models/event-list-filter";
import type { RunType } from "../../../app/models/timeline-content";

const now = "2026-06-13T00:00:00.000Z";

const defaultFilter: EventFilterState = {
  onlyUpcoming: false,
  search: "",
};

function schedule(runType: RunType, since: string, status: EventListSchedule["status"]): EventListSchedule {
  return {
    runType,
    since,
    until: runType === "permanent" ? null : "2026-06-20T00:00:00.000Z",
    status,
  };
}

function event(uid: string, name: string, schedules: EventListItem["schedules"]): EventListItem {
  return {
    uid,
    name,
    imageUrl: null,
    fallbackImageUrl: null,
    latestTimelineUid: `event-${uid}`,
    schedules,
  };
}

describe("filterEventList", () => {
  it("keeps only current or upcoming schedules while excluding stale permanent events", () => {
    const events = [
      event("past", "지난 이벤트", {
        first: schedule("first", "2026-05-01T00:00:00.000Z", "past"),
      }),
      event("upcoming", "다가오는 이벤트", {
        rerun: schedule("rerun", "2026-06-20T00:00:00.000Z", "upcoming"),
      }),
      event("old-permanent", "오래된 상설 이벤트", {
        permanent: schedule("permanent", "2026-06-01T00:00:00.000Z", "current"),
      }),
    ];

    expect(filterEventList(events, { ...defaultFilter, onlyUpcoming: true }, now).map((item) => item.uid)).toEqual([
      "upcoming",
    ]);
  });

  it("searches event names with Korean consonant matching", () => {
    const events = [
      event("match", "강철대륙 공략전", {
        first: schedule("first", "2026-06-10T00:00:00.000Z", "current"),
      }),
      event("miss", "데카그라마톤 결전", {
        first: schedule("first", "2026-06-10T00:00:00.000Z", "current"),
      }),
    ];

    expect(filterEventList(events, { ...defaultFilter, search: "ㄱㅊㄷㄹ" }, now).map((item) => item.uid)).toEqual([
      "match",
    ]);
  });
});
