import assert from "node:assert/strict";
import { test } from "node:test";
import { generateCommunityPostgresImport } from "../../../db/postgres/scripts/generate-community-postgres-import.mjs";

function snapshot() {
  return {
    communityPosts: [
      {
        id: 1,
        uid: "post-1",
        userId: 10,
        postType: "guide",
        origin: "user",
        visibility: "public",
        pinned: false,
        blocks: '[{"type":"plaintext","text":"guide"}]',
        sourceMetadata: '{"channelKey":"jp"}',
        createdAt: "2026-08-01 12:00:00",
        updatedAt: "2026-08-01T03:00:00.000Z",
      },
      {
        id: 2,
        uid: "result-post",
        userId: 10,
        postType: "recruitment_result",
        origin: "user",
        visibility: "public",
        pinned: false,
        blocks: [{ type: "plaintext", text: "result" }],
        sourceType: "recruitment_result",
        sourceUid: "result-1",
        sourceMetadata: {},
        createdAt: "2026-08-01T04:00:00.000Z",
        updatedAt: "2026-08-01T04:00:00.000Z",
      },
    ],
    communityComments: [
      {
        id: 1,
        uid: "comment-1",
        postUid: "post-1",
        userId: 11,
        parentUid: "post-1",
        body: "first",
        visibility: "public",
        createdAt: "2026-08-01T05:00:00.000Z",
        updatedAt: "2026-08-01T05:00:00.000Z",
      },
      {
        id: 2,
        uid: "comment-2",
        postUid: "post-1",
        userId: 12,
        parentUid: "post-1",
        body: "second",
        visibility: "public",
        createdAt: "2026-08-01T06:00:00.000Z",
        updatedAt: "2026-08-01T06:00:00.000Z",
      },
      {
        id: 3,
        uid: "subcomment-1",
        postUid: "post-1",
        userId: 13,
        parentUid: "comment-1",
        body: "reply",
        visibility: "public",
        createdAt: "2026-08-01T07:00:00.000Z",
        updatedAt: "2026-08-01T07:00:00.000Z",
      },
    ],
    communityPostLikes: [
      { id: 1, uid: "like-1", postUid: "post-1", userId: 20, createdAt: "2026-08-01T08:00:00.000Z" },
    ],
    communityPostTags: [
      {
        id: 1,
        uid: "tag-1",
        postUid: "post-1",
        studentUid: "student-1",
        tagValue: "good",
        createdAt: "2026-08-01T08:00:00.000Z",
      },
    ],
    recruitmentResults: [
      {
        id: 1,
        uid: "result-1",
        userId: 10,
        recruitmentGroupUid: "group-1",
        recruitedStudents: "[]",
        exchangedStudents: [],
        commentPostUid: "result-post",
        createdAt: "2026-08-01T04:00:00.000Z",
        updatedAt: "2026-08-01T04:00:00.000Z",
      },
    ],
  };
}

test("parses D1 text JSON, preserves structured JSON, emits UTC timestamps, and includes typed bidirectional parity", () => {
  const sql = generateCommunityPostgresImport(snapshot());

  assert.match(sql, /'\[\{"type":"plaintext","text":"guide"\}\]'::jsonb/);
  assert.doesNotMatch(sql, /'"\[\{"type":"plaintext"/);
  assert.match(sql, /'2026-08-01 12:00:00'::timestamp AT TIME ZONE 'UTC'/);
  assert.match(sql, /'2026-08-01T03:00:00\.000Z'::timestamptz/);
  assert.match(sql, /WITH expected \(id, uid, user_id/);
  assert.match(sql, /to_jsonb\(actual\) FROM community_posts actual EXCEPT/);
  assert.match(sql, /UNION ALL/);
  assert.match(sql, /invalid recruitment result comment linkage/);
  assert.match(sql, /orphan recruitment result post/);
  assert.ok(sql.indexOf("WITH expected") < sql.indexOf("END $$"));
});

for (const [label, mutate] of [
  ["malformed JSON", (value) => { value.communityPosts[0].blocks = ""; }],
  ["wrong JSON shape", (value) => { value.communityPosts[0].blocks = "{}"; }],
  ["wrong metadata shape", (value) => { value.communityPosts[0].sourceMetadata = "[]"; }],
]) {
  test(`rejects ${label} before generating SQL`, () => {
    const value = snapshot();
    mutate(value);
    assert.throws(() => generateCommunityPostgresImport(value), /community_posts\.(blocks|source_metadata)/);
  });
}

for (const [label, mutate] of [
  ["duplicate UID", (value) => { value.communityComments[1].uid = value.communityComments[0].uid; }],
  ["orphan like", (value) => { value.communityPostLikes[0].postUid = "missing"; }],
  ["orphan parent", (value) => { value.communityComments[0].parentUid = "missing"; }],
  ["deeper parent", (value) => { value.communityComments[2].parentUid = "subcomment-1"; }],
  ["one-way recruitment link", (value) => { value.recruitmentResults[0].commentPostUid = null; }],
]) {
  test(`rejects ${label} references or operational duplicates`, () => {
    const value = snapshot();
    mutate(value);
    assert.throws(() => generateCommunityPostgresImport(value));
  });
}
