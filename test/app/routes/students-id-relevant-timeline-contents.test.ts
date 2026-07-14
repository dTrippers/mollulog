import { describe, expect, it, jest } from "@jest/globals";
import type { TimelineContent } from "~/models/timeline-content.server";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/components/features/layout", () => ({
  Page: jest.fn(() => null),
  createPageErrorBoundary: jest.fn(() => null),
}));
jest.mock("~/components/features/students", () => ({ StudentInfo: jest.fn(() => null) }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock("~/models/raid", () => ({ getAllRaidSchedules: jest.fn() }));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudentTiers: jest.fn() }));
jest.mock("~/models/student", () => ({
  formatStudentFullName: jest.fn(),
  getAllStudentsMap: jest.fn(),
  getStudentDetail: jest.fn(),
}));
jest.mock("~/models/student-grading", () => ({ getStudentGradingsByStudentWithUsers: jest.fn() }));
jest.mock("~/models/student-grading-tag", () => ({ getTagCountsByStudent: jest.fn() }));

import { getStudentRelevantTimelineContents } from "../../../app/routes/students.$id";

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

describe("getStudentRelevantTimelineContents", () => {
  it("only keeps the event listing the student when a group is shared by two events", () => {
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

    const resultForA = getStudentRelevantTimelineContents([eventA, eventB], ["shared-group"], "a");
    const resultForC = getStudentRelevantTimelineContents([eventA, eventB], ["shared-group"], "c");

    expect(resultForA.map((content) => content.uid)).toEqual(["event-a"]);
    expect(resultForC.map((content) => content.uid)).toEqual(["event-b"]);
  });

  it("keeps every event across the student's distinct recruitment groups", () => {
    const originalEvent = timelineContent({ uid: "event-original", recruitmentGroupUid: "group-1" });
    const rerunEvent = timelineContent({ uid: "event-rerun", recruitmentGroupUid: "group-2" });

    const result = getStudentRelevantTimelineContents(
      [originalEvent, rerunEvent],
      ["group-1", "group-2"],
      "any-student",
    );

    expect(result.map((content) => content.uid)).toEqual(["event-original", "event-rerun"]);
  });

  it("does not duplicate an event that would otherwise match twice", () => {
    const event = timelineContent({ uid: "event-a", recruitmentGroupUid: "group-1" });

    const result = getStudentRelevantTimelineContents([event], ["group-1", "group-1"], "a");

    expect(result.map((content) => content.uid)).toEqual(["event-a"]);
  });
});
