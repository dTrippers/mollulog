import { describe, expect, it } from "@jest/globals";
import type { TimelineContent } from "~/domain/timeline-content";
import { compareTimelineContents } from "~/domain/timeline-content-parity";

function content(overrides: Partial<TimelineContent> & { uid: string }): TimelineContent {
  return {
    name: overrides.uid,
    nameI18n: { ko: overrides.uid },
    startAt: "2026-08-01T00:00:00.000Z",
    endAt: "2026-08-08T00:00:00.000Z",
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

describe("timeline content parity", () => {
  it("matches equivalent payloads regardless of row and object-key order", () => {
    const source = [content({ uid: "a", nameI18n: { ko: "에이", ja: "エー" } }), content({ uid: "b" })];
    const target = [content({ uid: "b" }), content({ uid: "a", nameI18n: { ja: "エー", ko: "에이" } })];

    expect(compareTimelineContents(source, target)).toEqual({
      matched: true,
      sourceCount: 2,
      targetCount: 2,
      missingTargetUids: [],
      unexpectedTargetUids: [],
      mismatchedUids: [],
    });
  });

  it("reports missing, unexpected, and payload-mismatched UIDs separately", () => {
    const result = compareTimelineContents(
      [content({ uid: "missing" }), content({ uid: "changed", tags: ["a", "b"] })],
      [content({ uid: "unexpected" }), content({ uid: "changed", tags: ["b", "a"] })],
    );

    expect(result).toEqual({
      matched: false,
      sourceCount: 2,
      targetCount: 2,
      missingTargetUids: ["missing"],
      unexpectedTargetUids: ["unexpected"],
      mismatchedUids: ["changed"],
    });
  });
});
