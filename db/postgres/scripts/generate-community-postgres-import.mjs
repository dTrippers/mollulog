#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const TABLES = [
  "community_posts",
  "community_comments",
  "community_post_likes",
  "community_post_tags",
  "recruitment_results",
];

const columns = {
  community_posts: [
    "id",
    "uid",
    "user_id",
    "post_type",
    "origin",
    "title",
    "visibility",
    "pinned",
    "subject_student_uid",
    "subject_content_uid",
    "subject_raid_type",
    "subject_season_index",
    "blocks",
    "source_type",
    "source_uid",
    "source_id",
    "source_name",
    "source_url",
    "source_metadata",
    "migrated_at",
    "display_at",
    "created_at",
    "updated_at",
  ],
  community_comments: [
    "id",
    "uid",
    "post_uid",
    "user_id",
    "parent_uid",
    "body",
    "visibility",
    "source_type",
    "source_uid",
    "source_id",
    "migrated_at",
    "created_at",
    "updated_at",
  ],
  community_post_likes: ["id", "uid", "post_uid", "user_id", "created_at"],
  community_post_tags: ["id", "uid", "post_uid", "student_uid", "tag_value", "created_at"],
  recruitment_results: [
    "id",
    "uid",
    "user_id",
    "recruitment_group_uid",
    "content_uid",
    "completed_at",
    "recruited_students",
    "exchanged_students",
    "tier3_count",
    "trial",
    "raw_result",
    "comment_post_uid",
    "created_at",
    "updated_at",
  ],
};

const sourceKeys = {
  community_posts: "communityPosts",
  community_comments: "communityComments",
  community_post_likes: "communityPostLikes",
  community_post_tags: "communityPostTags",
  recruitment_results: "recruitmentResults",
};

const structuredColumns = {
  blocks: "array",
  recruited_students: "array",
  exchanged_students: "array",
  source_metadata: "object",
};

const integerColumns = new Set(["id", "user_id", "source_id", "subject_season_index", "tier3_count", "trial"]);
const textColumns = new Set([
  "uid",
  "post_uid",
  "post_type",
  "origin",
  "title",
  "visibility",
  "subject_student_uid",
  "subject_content_uid",
  "subject_raid_type",
  "source_type",
  "source_uid",
  "source_name",
  "source_url",
  "body",
  "student_uid",
  "tag_value",
  "recruitment_group_uid",
  "content_uid",
  "raw_result",
  "comment_post_uid",
  "parent_uid",
]);

function quote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseStructuredJson(value, table, column) {
  const expected = structuredColumns[column];
  const fallback = expected === "object" ? {} : [];
  if (value === null || value === undefined) return fallback;
  if (value === "") throw new Error(`${table}.${column} must contain valid JSON`);

  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error(`${table}.${column} must contain valid JSON`, { cause: error });
    }
  }

  const valid =
    expected === "array" ? Array.isArray(parsed) : parsed && typeof parsed === "object" && !Array.isArray(parsed);
  if (!valid) {
    throw new Error(`${table}.${column} must be a JSON ${expected}`);
  }
  return parsed;
}

function json(value, table, column) {
  return `${quote(JSON.stringify(parseStructuredJson(value, table, column)))}::jsonb`;
}

function timestamp(value) {
  if (value === null || value === undefined) return "NULL";
  const text = String(value);
  // D1's SQLite export has no timezone. Make UTC explicit rather than relying
  // on the PostgreSQL session timezone. ISO values carrying Z/an offset are
  // already instants and should keep their original offset semantics.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) {
    return `${quote(text)}::timestamp AT TIME ZONE 'UTC'`;
  }
  return `${quote(value)}::timestamptz`;
}

function valueFor(table, column, row) {
  const camel = column.replace(/_([a-z])/g, (_, character) => character.toUpperCase());
  const value = row[camel] ?? row[column];
  if (Object.hasOwn(structuredColumns, column)) return json(value, table, column);
  if (["migrated_at", "display_at", "created_at", "updated_at", "completed_at"].includes(column)) {
    return timestamp(value);
  }
  if (column === "pinned") return value ? "TRUE" : "FALSE";
  if (integerColumns.has(column)) {
    return value === undefined || value === null ? "NULL::integer" : `${quote(value)}::integer`;
  }
  if (textColumns.has(column)) {
    return value === undefined || value === null ? "NULL::text" : `${quote(value)}::text`;
  }
  return value === undefined ? "NULL" : quote(value);
}

function assertRows(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("snapshot must be an object");
  }
  for (const table of TABLES) {
    const key = sourceKeys[table];
    if (!Array.isArray(snapshot[key])) {
      throw new Error(`snapshot.${key} must be an array`);
    }
  }
}

function assertUnique(rows, key, label, { allowNull = false } = {}) {
  const seen = new Map();
  for (const [index, row] of rows.entries()) {
    const value = key(row);
    const isNullish = Array.isArray(value)
      ? value.every((item) => item === null || item === undefined || item === "")
      : value === null || value === undefined || value === "";
    if (isNullish) {
      if (allowNull) continue;
      throw new Error(`${label} is required at row ${index + 1}`);
    }
    const serialized = JSON.stringify(value);
    const previous = seen.get(serialized);
    if (previous !== undefined) {
      throw new Error(`${label} duplicate at rows ${previous + 1} and ${index + 1}`);
    }
    seen.set(serialized, index);
  }
}

function uniquePair(row, first, second) {
  const toCamel = (column) => column.replace(/_([a-z])/g, (_, character) => character.toUpperCase());
  const values = [row[first] ?? row[toCamel(first)], row[second] ?? row[toCamel(second)]];
  return values.some((value) => value === null || value === undefined || value === "") ? null : values;
}

function validateSnapshot(snapshot) {
  assertRows(snapshot);
  const posts = snapshot.communityPosts;
  const comments = snapshot.communityComments;
  const likes = snapshot.communityPostLikes;
  const tags = snapshot.communityPostTags;
  const results = snapshot.recruitmentResults;
  const postByUid = new Map(posts.map((row) => [row.uid, row]));
  const commentByUid = new Map(comments.map((row) => [row.uid, row]));
  const resultByUid = new Map(results.map((row) => [row.uid, row]));

  for (const table of TABLES) {
    const rows = snapshot[sourceKeys[table]];
    assertUnique(rows, (row) => row.id ?? row["id"], `${table}.id`);
    assertUnique(rows, (row) => row.uid, `${table}.uid`);
  }
  assertUnique(posts, (row) => uniquePair(row, "source_type", "source_uid"), "community_posts.source_type/source_uid", {
    allowNull: true,
  });
  assertUnique(
    posts,
    (row) =>
      (row.postType ?? row.post_type) === "student_review" ? uniquePair(row, "user_id", "subject_student_uid") : null,
    "community_posts.student_review owner/student",
    { allowNull: true },
  );
  assertUnique(
    comments,
    (row) => uniquePair(row, "source_type", "source_uid"),
    "community_comments.source_type/source_uid",
    { allowNull: true },
  );
  assertUnique(
    likes,
    (row) => [row.postUid ?? row.post_uid, row.userId ?? row.user_id],
    "community_post_likes.post_uid/user_id",
  );
  assertUnique(
    results,
    (row) => [row.userId ?? row.user_id, row.recruitmentGroupUid ?? row.recruitment_group_uid],
    "recruitment_results.user_id/recruitment_group_uid",
  );

  for (const [index, comment] of comments.entries()) {
    const postUid = comment.postUid ?? comment.post_uid;
    const parentUid = comment.parentUid ?? comment.parent_uid;
    const post = postByUid.get(postUid);
    if (!post) throw new Error(`community_comments row ${index + 1} references missing post ${postUid}`);
    if (!parentUid) throw new Error(`community_comments row ${index + 1} is missing parent_uid`);
    if (parentUid === postUid) continue;
    const parent = commentByUid.get(parentUid);
    if (!parent || (parent.postUid ?? parent.post_uid) !== postUid) {
      throw new Error(`community_comments row ${index + 1} has an orphan parent ${parentUid}`);
    }
    if ((parent.parentUid ?? parent.parent_uid) !== postUid) {
      throw new Error(`community_comments row ${index + 1} cannot reply to a subcomment`);
    }
  }
  for (const [index, like] of likes.entries()) {
    const postUid = like.postUid ?? like.post_uid;
    if (!postByUid.has(postUid)) throw new Error(`community_post_likes row ${index + 1} references missing post ${postUid}`);
  }
  for (const [index, tag] of tags.entries()) {
    const postUid = tag.postUid ?? tag.post_uid;
    if (!postByUid.has(postUid)) throw new Error(`community_post_tags row ${index + 1} references missing post ${postUid}`);
  }

  for (const [index, result] of results.entries()) {
    const commentPostUid = result.commentPostUid ?? result.comment_post_uid;
    if (commentPostUid === null || commentPostUid === undefined || commentPostUid === "") continue;
    const post = postByUid.get(commentPostUid);
    const userId = result.userId ?? result.user_id;
    if (
      !post ||
      (post.postType ?? post.post_type) !== "recruitment_result" ||
      (post.sourceType ?? post.source_type) !== "recruitment_result" ||
      (post.sourceUid ?? post.source_uid) !== result.uid ||
      (post.userId ?? post.user_id) !== userId
    ) {
      throw new Error(`recruitment_results row ${index + 1} has an invalid comment_post_uid linkage`);
    }
  }
  for (const [index, post] of posts.entries()) {
    if ((post.postType ?? post.post_type) !== "recruitment_result") continue;
    const uid = post.sourceUid ?? post.source_uid;
    const result = resultByUid.get(uid);
    if (
      !result ||
      (post.sourceType ?? post.source_type) !== "recruitment_result" ||
      (post.userId ?? post.user_id) !== (result.userId ?? result.user_id) ||
      (result.commentPostUid ?? result.comment_post_uid) !== post.uid
    ) {
      throw new Error(`community_posts row ${index + 1} has an invalid recruitment_result linkage`);
    }
  }

  // Parse all JSONB values up-front so malformed or wrong-shaped text cannot
  // make it into a generated SQL file.
  for (const table of TABLES) {
    for (const row of snapshot[sourceKeys[table]]) {
      for (const column of Object.keys(structuredColumns)) {
        if (columns[table].includes(column)) {
          const camel = column.replace(/_([a-z])/g, (_, character) => character.toUpperCase());
          parseStructuredJson(row[camel] ?? row[column], table, column);
        }
      }
    }
  }
}

function insertRows(table, rows) {
  if (!rows.length) return `-- ${table}: no rows`;
  const tableColumns = columns[table];
  const values = rows
    .map((row) => `(${tableColumns.map((column) => valueFor(table, column, row)).join(", ")})`)
    .join(",\n  ");
  return `INSERT INTO ${table} (${tableColumns.join(", ")}) VALUES\n  ${values};`;
}

function sequenceRepair(table) {
  return `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${table};`;
}

function paritySql(table, rows) {
  const tableColumns = columns[table];
  if (!rows.length) {
    return `  IF EXISTS (SELECT 1 FROM ${table}) THEN RAISE EXCEPTION '${table} parity check failed'; END IF;`;
  }
  const expected = `WITH expected (${tableColumns.join(", ")}) AS (\n      VALUES\n${rows
    .map((row) => `        (${tableColumns.map((column) => valueFor(table, column, row)).join(", ")})`)
    .join(",\n")}`;
  return `  IF EXISTS (\n    ${expected}\n    )\n    (SELECT to_jsonb(actual) FROM ${table} actual EXCEPT SELECT to_jsonb(expected) FROM expected)\n    UNION ALL\n    (SELECT to_jsonb(expected) FROM expected EXCEPT SELECT to_jsonb(actual) FROM ${table} actual)\n  ) THEN RAISE EXCEPTION '${table} parity check failed'; END IF;`;
}

/**
 * Generates the controlled D1 snapshot import used for the community cutover.
 * The input is a JSON object with one array per target table using either
 * camelCase or snake_case column names. No application fallback is involved.
 */
export function generateCommunityPostgresImport(snapshot) {
  validateSnapshot(snapshot);
  const sections = [
    "\\set ON_ERROR_STOP on",
    "-- Generated by generate-community-postgres-import.mjs. Review the snapshot before execution.",
    "BEGIN;",
    ...TABLES.map((table) => `LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;`),
    "TRUNCATE community_comments, community_post_likes, community_post_tags, recruitment_results, community_posts RESTART IDENTITY;",
    ...TABLES.map((table) => insertRows(table, snapshot[sourceKeys[table]])),
    ...TABLES.map(sequenceRepair),
    "DO $$",
    "BEGIN",
    ...TABLES.map((table) => paritySql(table, snapshot[sourceKeys[table]])),
    "  IF EXISTS (SELECT 1 FROM community_comments c LEFT JOIN community_posts p ON p.uid = c.post_uid WHERE p.uid IS NULL) THEN RAISE EXCEPTION 'orphan community comment'; END IF;",
    "  IF EXISTS (SELECT 1 FROM community_comments c LEFT JOIN community_posts p ON p.uid = c.post_uid WHERE p.uid IS NOT NULL AND c.parent_uid <> c.post_uid AND NOT EXISTS (SELECT 1 FROM community_comments parent WHERE parent.uid = c.parent_uid AND parent.post_uid = c.post_uid AND parent.parent_uid = c.post_uid)) THEN RAISE EXCEPTION 'invalid community comment parent'; END IF;",
    "  IF EXISTS (SELECT 1 FROM community_post_likes l LEFT JOIN community_posts p ON p.uid = l.post_uid WHERE p.uid IS NULL) THEN RAISE EXCEPTION 'orphan community like'; END IF;",
    "  IF EXISTS (SELECT 1 FROM community_post_tags t LEFT JOIN community_posts p ON p.uid = t.post_uid WHERE p.uid IS NULL) THEN RAISE EXCEPTION 'orphan community tag'; END IF;",
    "  IF EXISTS (SELECT 1 FROM recruitment_results r WHERE r.comment_post_uid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM community_posts p WHERE p.uid = r.comment_post_uid AND p.post_type = 'recruitment_result' AND p.source_type = 'recruitment_result' AND p.source_uid = r.uid AND p.user_id = r.user_id)) THEN RAISE EXCEPTION 'invalid recruitment result comment linkage'; END IF;",
    "  IF EXISTS (SELECT 1 FROM community_posts p WHERE p.post_type = 'recruitment_result' AND NOT EXISTS (SELECT 1 FROM recruitment_results r WHERE r.uid = p.source_uid AND r.comment_post_uid = p.uid AND r.user_id = p.user_id AND p.source_type = 'recruitment_result')) THEN RAISE EXCEPTION 'orphan recruitment result post'; END IF;",
    "END $$;",
    "COMMIT;",
    "",
  ];
  return sections.join("\n");
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath || inputPath === "--help") {
    console.error("Usage: node generate-community-postgres-import.mjs <snapshot.json> [output.sql]");
    process.exitCode = inputPath === "--help" ? 0 : 1;
    return;
  }
  const snapshot = JSON.parse(await readFile(inputPath, "utf8"));
  const output = generateCommunityPostgresImport(snapshot);
  if (process.argv[3]) {
    await writeFile(process.argv[3], output, { encoding: "utf8", flag: "wx" });
    process.stdout.write(
      `${JSON.stringify({
        outputPath: process.argv[3],
        counts: Object.fromEntries(TABLES.map((table) => [table, snapshot[sourceKeys[table]].length])),
      })}\n`,
    );
    return;
  }
  process.stdout.write(output);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
