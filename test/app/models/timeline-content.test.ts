import { describe, expect, it } from "@jest/globals";
import {
  findEventsForRecruitmentStudent,
  groupTimelineContentsByRecruitmentGroupUid,
  type TimelineContent,
} from "~/models/timeline-content.server";

function timelineContent(overrides: Partial<TimelineContent> & { uid: string }): TimelineContent {
  return {
    name: overrides.uid,
    nameI18n: {},
    startAt: "2026-11-10T02:00:00.000Z",
    endAt: "2026-11-24T02:00:00.000Z",
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

describe("groupTimelineContentsByRecruitmentGroupUid", () => {
  it("keeps every event sharing a recruitment group, not just the last one", () => {
    const eventA = timelineContent({ uid: "event-a", recruitmentGroupUid: "shared-group" });
    const eventB = timelineContent({ uid: "event-b", recruitmentGroupUid: "shared-group" });
    const eventC = timelineContent({ uid: "event-c", recruitmentGroupUid: "other-group" });

    const map = groupTimelineContentsByRecruitmentGroupUid([eventA, eventB, eventC]);

    expect(map.get("shared-group")?.map((content) => content.uid)).toEqual(["event-a", "event-b"]);
    expect(map.get("other-group")?.map((content) => content.uid)).toEqual(["event-c"]);
  });

  it("skips events with no recruitment group", () => {
    const map = groupTimelineContentsByRecruitmentGroupUid([timelineContent({ uid: "no-group" })]);
    expect(map.size).toBe(0);
  });
});

describe("findEventsForRecruitmentStudent", () => {
  const eventA = timelineContent({
    uid: "event-a",
    recruitmentGroupUid: "shared-group",
    recruitmentStudentUids: ["a", "b"],
  });
  const eventB = timelineContent({
    uid: "event-b",
    recruitmentGroupUid: "shared-group",
    recruitmentStudentUids: ["c", "d"],
  });

  it("returns the event whose allowlist includes the student", () => {
    expect(findEventsForRecruitmentStudent([eventA, eventB], "a").map((e) => e.uid)).toEqual(["event-a"]);
    expect(findEventsForRecruitmentStudent([eventA, eventB], "c").map((e) => e.uid)).toEqual(["event-b"]);
  });

  it("matches every event with no allowlist, since null means show-all", () => {
    const unfiltered = timelineContent({ uid: "event-c", recruitmentGroupUid: "shared-group" });
    expect(findEventsForRecruitmentStudent([unfiltered], "anyone").map((e) => e.uid)).toEqual(["event-c"]);
  });

  it("falls back to every candidate event when no allowlist matches", () => {
    expect(findEventsForRecruitmentStudent([eventA, eventB], "unlisted").map((e) => e.uid)).toEqual([
      "event-a",
      "event-b",
    ]);
  });

  it("returns an empty list when there are no candidate events", () => {
    expect(findEventsForRecruitmentStudent([], "a")).toEqual([]);
  });
});
