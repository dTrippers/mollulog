import { describe, expect, it } from "@jest/globals";
import type { CommunityFeedPostItem } from "~/components/features/community/CommunityFeed";
import {
  getCommunityPostTimestampMeta,
  getPickupStudentSummary,
} from "~/components/features/community/community-feed-presentation";

function createPost(overrides: Partial<CommunityFeedPostItem> = {}): CommunityFeedPostItem {
  return {
    uid: "post-1",
    postType: "student_review",
    origin: "user",
    title: null,
    visibility: "public",
    pinned: false,
    subjectStudentUid: "student-1",
    subjectContentUid: null,
    subjectRaidType: null,
    subjectSeasonIndex: null,
    blocks: [],
    sourceName: null,
    sourceUrl: null,
    sourceMetadata: {},
    displayAt: "2026-05-01T00:00:00.000Z",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    author: {
      id: 1,
      username: "sensei",
      profileStudentId: null,
    },
    liked: false,
    likeCount: 0,
    comments: [],
    subjectStudentName: "학생",
    subjectContentName: null,
    tags: [],
    pickupStudents: [],
    recruitmentStats: null,
    likeTarget: null,
    ...overrides,
  };
}

describe("CommunityFeed timestamp meta", () => {
  it("shows user-authored post displayAt even when the post was edited later", () => {
    const timestamp = getCommunityPostTimestampMeta(
      createPost({
        displayAt: "2026-05-01T00:00:00.000Z",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
      }),
      "UTC",
    );

    expect(timestamp).toEqual({
      dateTime: "2026-05-01T00:00:00.000Z",
      text: "2026.05.01",
      edited: true,
    });
  });

  it("keeps curated posts on displayAt without an edited label", () => {
    const timestamp = getCommunityPostTimestampMeta(
      createPost({
        origin: "curated",
        author: null,
        displayAt: "2026-05-10T00:00:00.000Z",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
      }),
      "UTC",
    );

    expect(timestamp).toEqual({
      dateTime: "2026-05-10T00:00:00.000Z",
      text: "2026.05.10",
      edited: false,
    });
  });
});

describe("CommunityFeed pickup student summary", () => {
  it("keeps all pickup students visible up to 7 students", () => {
    const students = Array.from({ length: 7 }, (_, index) => `student-${index + 1}`);

    expect(getPickupStudentSummary(students)).toEqual({
      visibleStudents: students,
      remainingCount: 0,
    });
  });

  it("shows the first 5 pickup students and summarizes the rest over 7 students", () => {
    const students = Array.from({ length: 8 }, (_, index) => `student-${index + 1}`);

    expect(getPickupStudentSummary(students)).toEqual({
      visibleStudents: students.slice(0, 5),
      remainingCount: 3,
    });
  });
});
