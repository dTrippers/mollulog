import { describe, expect, it } from "@jest/globals";
import { nestComments } from "~/models/content";
import type { ContentCommentWithSensei } from "~/models/content-comment";

const flatComments: ContentCommentWithSensei[] = [
  {
    id: 1,
    uid: "parent",
    contentId: "content-1",
    body: "parent comment",
    visibility: "public",
    parentCommentId: null,
    pinned: false,
    createdAt: "2026-10-09T00:00:00.000Z",
    sensei: { username: "mollulog", profileStudentId: null, labels: ["official"] },
  },
  {
    id: 2,
    uid: "child",
    contentId: "content-1",
    body: "child comment",
    visibility: "public",
    parentCommentId: 1,
    pinned: false,
    createdAt: "2026-10-09T00:01:00.000Z",
    sensei: { username: "teacher", profileStudentId: null, labels: [] },
  },
];

describe("nestComments", () => {
  it("preserves account labels for parent and child comments", () => {
    const [parent] = nestComments(flatComments, null);

    expect(parent?.sensei.labels).toEqual(["official"]);
    expect(parent?.subcomments?.[0]?.sensei.labels).toEqual([]);
  });
});
