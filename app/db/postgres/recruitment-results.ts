import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import {
  pgCommunityCommentsTable,
  pgCommunityPostLikesTable,
  pgCommunityPostsTable,
  pgCommunityPostTagsTable,
  pgRecruitmentResultsTable,
} from "~/db/postgres/schema";
import {
  appendRecruitmentResultStudent,
  normalizeRecruitmentResultStudents,
  removeRecruitmentResultStudent,
  sanitizeRecruitmentResultStudents,
} from "~/domain/recruitment-result";
import { normalizeInstant, nowUtcIso, type UtcIsoString } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import type { CommunityPostBlock } from "~/models/community";
import { upsertRecruitedStudentFromRecruitmentResultInTransaction } from "~/models/recruited-student";
import type {
  AddRecruitedStudentToResultInput,
  RecruitmentResult,
  RecruitmentResultStudent,
  UpsertRecruitmentResultInput,
} from "~/models/recruitment-result";

type RecruitmentDb = NodePgDatabase;
type RecruitmentTransaction = Parameters<Parameters<RecruitmentDb["transaction"]>[0]>[0];
type RecruitmentResultComment = { uid: string; body: string; createdAt: UtcIsoString };

export type PostgresRecruitmentResultOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

function toUtc(value: Date | string | null | undefined): UtcIsoString | null {
  if (value == null) return null;
  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

function requireUtc(value: Date | string | null | undefined, field: string): UtcIsoString {
  const normalized = toUtc(value);
  if (!normalized) throw new Error(`Missing required PostgreSQL timestamp: ${field}`);
  return normalized;
}

function parseStudents(value: unknown): RecruitmentResultStudent[] {
  if (Array.isArray(value)) return sanitizeRecruitmentResultStudents(value as RecruitmentResultStudent[]);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? sanitizeRecruitmentResultStudents(parsed as RecruitmentResultStudent[]) : [];
  } catch {
    return [];
  }
}

function toModel(row: typeof pgRecruitmentResultsTable.$inferSelect): RecruitmentResult {
  return {
    uid: row.uid,
    userId: row.userId,
    recruitmentGroupUid: row.recruitmentGroupUid,
    contentUid: row.contentUid ?? null,
    completedAt: toUtc(row.completedAt),
    recruitedStudents: parseStudents(row.recruitedStudents),
    exchangedStudents: parseStudents(row.exchangedStudents),
    tier3Count: row.tier3Count ?? null,
    trial: row.trial ?? null,
    rawResult: row.rawResult ?? null,
    commentPostUid: row.commentPostUid ?? null,
    createdAt: requireUtc(row.createdAt, "recruitment_results.created_at"),
    updatedAt: requireUtc(row.updatedAt, "recruitment_results.updated_at"),
  };
}

async function withRecruitmentDatabase<T>(
  env: Env,
  name: string,
  operation: (db: RecruitmentDb) => Promise<T>,
  options: PostgresRecruitmentResultOptions = {},
): Promise<T> {
  const { createClient = createPostgresClient, ctx } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const run = () => operation(drizzle(client));
      return ctx ? ctx.tracing.enterSpan(`postgres.recruitment_results.${name}`, run) : run();
    },
    createClient,
    ctx,
  );
}

export async function getPostgresRecruitmentResult(
  env: Env,
  userId: number,
  uid: string,
  options: PostgresRecruitmentResultOptions = {},
): Promise<RecruitmentResult | null> {
  const row = await withRecruitmentDatabase(
    env,
    "get",
    (db) =>
      db
        .select()
        .from(pgRecruitmentResultsTable)
        .where(and(eq(pgRecruitmentResultsTable.userId, userId), eq(pgRecruitmentResultsTable.uid, uid)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    options,
  );
  return row ? toModel(row) : null;
}

export async function getPostgresRecruitmentResults(
  env: Env,
  userId: number,
  options: PostgresRecruitmentResultOptions = {},
): Promise<RecruitmentResult[]> {
  const rows = await withRecruitmentDatabase(
    env,
    "list",
    (db) =>
      db
        .select()
        .from(pgRecruitmentResultsTable)
        .where(eq(pgRecruitmentResultsTable.userId, userId))
        .orderBy(desc(pgRecruitmentResultsTable.updatedAt), desc(pgRecruitmentResultsTable.id)),
    options,
  );
  return rows.map(toModel);
}

export async function getPostgresRecruitmentResultsByRecruitmentGroupUids(
  env: Env,
  userId: number,
  recruitmentGroupUids: string[],
  options: PostgresRecruitmentResultOptions = {},
): Promise<RecruitmentResult[]> {
  const unique = [...new Set(recruitmentGroupUids)].filter(Boolean);
  if (!unique.length) return [];
  const rows = await withRecruitmentDatabase(
    env,
    "list_by_group",
    (db) =>
      db
        .select()
        .from(pgRecruitmentResultsTable)
        .where(
          and(
            eq(pgRecruitmentResultsTable.userId, userId),
            inArray(pgRecruitmentResultsTable.recruitmentGroupUid, unique),
          ),
        ),
    options,
  );
  return rows.map(toModel);
}

export async function getPostgresRecruitmentResultComment(
  env: Env,
  userId: number,
  commentPostUid: string | null | undefined,
  options: PostgresRecruitmentResultOptions = {},
): Promise<string | null> {
  if (!commentPostUid) return null;
  const row = await withRecruitmentDatabase(
    env,
    "comment",
    (db) =>
      db
        .select({ blocks: pgCommunityPostsTable.blocks })
        .from(pgCommunityPostsTable)
        .where(and(eq(pgCommunityPostsTable.uid, commentPostUid), eq(pgCommunityPostsTable.userId, userId)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    options,
  );
  const blocks = Array.isArray(row?.blocks) ? row.blocks : [];
  const block = blocks.find(
    (value) =>
      (value && typeof value === "object" && (value as { type?: string }).type === "plaintext") ||
      (value && typeof value === "object" && (value as { type?: string }).type === "markdown"),
  ) as { text?: string } | undefined;
  return block?.text ?? null;
}

export async function getPostgresRecruitmentResultComments(
  env: Env,
  userId: number,
  commentPostUids: (string | null | undefined)[],
  options: PostgresRecruitmentResultOptions = {},
): Promise<Map<string, RecruitmentResultComment>> {
  const unique = [...new Set(commentPostUids.filter((uid): uid is string => Boolean(uid)))];
  if (!unique.length) return new Map();
  const rows = await withRecruitmentDatabase(
    env,
    "comments",
    (db) =>
      db
        .select({
          uid: pgCommunityPostsTable.uid,
          blocks: pgCommunityPostsTable.blocks,
          createdAt: pgCommunityPostsTable.createdAt,
        })
        .from(pgCommunityPostsTable)
        .where(and(eq(pgCommunityPostsTable.userId, userId), inArray(pgCommunityPostsTable.uid, unique))),
    options,
  );
  return new Map(
    rows.flatMap((row) => {
      const blocks = Array.isArray(row.blocks) ? row.blocks : [];
      const block = blocks.find(
        (value) =>
          value &&
          typeof value === "object" &&
          ["plaintext", "markdown"].includes(String((value as { type?: string }).type)),
      ) as { text?: string } | undefined;
      const body = block?.text?.trim();
      return body
        ? [
            [
              row.uid,
              { uid: row.uid, body, createdAt: requireUtc(row.createdAt, "community_posts.created_at") },
            ] as const,
          ]
        : [];
    }),
  );
}

type ResultState = {
  uid: string;
  existing: RecruitmentResult | null;
  recruitedStudents: RecruitmentResultStudent[];
  exchangedStudents: RecruitmentResultStudent[];
  completedAt: UtcIsoString | null;
  contentUid: string | null;
  tier3Count: number | null;
  trial: number | null;
  rawResult: string | null;
};

function chooseState(
  existing: RecruitmentResult | null,
  input: UpsertRecruitmentResultInput,
  now: UtcIsoString,
): ResultState {
  const recruitedStudents = sanitizeRecruitmentResultStudents(input.recruitedStudents ?? existing?.recruitedStudents);
  const exchangedStudents = sanitizeRecruitmentResultStudents(input.exchangedStudents ?? existing?.exchangedStudents);
  return {
    uid: existing?.uid ?? input.uid ?? nanoid(8),
    existing,
    recruitedStudents,
    exchangedStudents,
    completedAt: input.completedAt !== undefined ? input.completedAt : (existing?.completedAt ?? now),
    contentUid: input.contentUid !== undefined ? (input.contentUid ?? null) : (existing?.contentUid ?? null),
    tier3Count: input.tier3Count !== undefined ? (input.tier3Count ?? null) : (existing?.tier3Count ?? null),
    trial: input.trial !== undefined ? (input.trial ?? null) : (existing?.trial ?? null),
    rawResult: input.rawResult !== undefined ? (input.rawResult ?? null) : (existing?.rawResult ?? null),
  };
}

async function deletePostWithinTransaction(tx: RecruitmentTransaction, postUid: string) {
  await tx.delete(pgCommunityCommentsTable).where(eq(pgCommunityCommentsTable.postUid, postUid));
  await tx.delete(pgCommunityPostLikesTable).where(eq(pgCommunityPostLikesTable.postUid, postUid));
  await tx.delete(pgCommunityPostTagsTable).where(eq(pgCommunityPostTagsTable.postUid, postUid));
  await tx.delete(pgCommunityPostsTable).where(eq(pgCommunityPostsTable.uid, postUid));
}

async function upsertResultAndComment(
  env: Env,
  userId: number,
  input: UpsertRecruitmentResultInput,
  options: PostgresRecruitmentResultOptions,
  projectionOverride?: RecruitmentResultStudent[],
): Promise<{ result: RecruitmentResult; projection: RecruitmentResultStudent[] }> {
  const now = nowUtcIso();
  return withPostgresClient(
    env,
    async (client) => {
      const db = drizzle(client);
      let result!: RecruitmentResult;
      let projection: RecruitmentResultStudent[] = [];
      await db.transaction(async (tx) => {
        const [byUid] = input.uid
          ? await tx
              .select()
              .from(pgRecruitmentResultsTable)
              .where(and(eq(pgRecruitmentResultsTable.userId, userId), eq(pgRecruitmentResultsTable.uid, input.uid)))
              .limit(1)
          : [];
        const [byGroup] = await tx
          .select()
          .from(pgRecruitmentResultsTable)
          .where(
            and(
              eq(pgRecruitmentResultsTable.userId, userId),
              eq(pgRecruitmentResultsTable.recruitmentGroupUid, input.recruitmentGroupUid),
            ),
          )
          .limit(1);
        const existingRow = byUid ?? byGroup;
        const existing = existingRow ? toModel(existingRow) : null;
        const state = chooseState(existing, input, now);
        projection =
          projectionOverride ??
          normalizeRecruitmentResultStudents([...state.recruitedStudents, ...state.exchangedStudents]);
        await tx
          .insert(pgRecruitmentResultsTable)
          .values({
            uid: state.uid,
            userId,
            recruitmentGroupUid: input.recruitmentGroupUid,
            contentUid: state.contentUid,
            completedAt: state.completedAt ? new Date(state.completedAt) : null,
            recruitedStudents: state.recruitedStudents,
            exchangedStudents: state.exchangedStudents,
            tier3Count: state.tier3Count,
            trial: state.trial,
            rawResult: state.rawResult,
            commentPostUid: existing?.commentPostUid ?? null,
            createdAt: existing ? new Date(existing.createdAt) : new Date(now),
            updatedAt: new Date(now),
          })
          .onConflictDoUpdate({
            target: [pgRecruitmentResultsTable.userId, pgRecruitmentResultsTable.recruitmentGroupUid],
            set: {
              contentUid: state.contentUid,
              completedAt: state.completedAt ? new Date(state.completedAt) : null,
              recruitedStudents: state.recruitedStudents,
              exchangedStudents: state.exchangedStudents,
              tier3Count: state.tier3Count,
              trial: state.trial,
              rawResult: state.rawResult,
              updatedAt: new Date(now),
            },
          });

        let commentPostUid = existing?.commentPostUid ?? null;
        const comment = input.comment?.trim();
        if (comment && state.contentUid) {
          const subjectStudentUid =
            input.subjectStudentUid ??
            state.recruitedStudents.find((student) => student.pickup)?.studentUid ??
            state.exchangedStudents.find((student) => student.pickup)?.studentUid ??
            null;
          const blocks: CommunityPostBlock[] = [{ type: "plaintext", text: comment }];
          if (commentPostUid) {
            const [existingPost] = await tx
              .select({ uid: pgCommunityPostsTable.uid })
              .from(pgCommunityPostsTable)
              .where(and(eq(pgCommunityPostsTable.uid, commentPostUid), eq(pgCommunityPostsTable.userId, userId)))
              .limit(1);
            if (existingPost) {
              await tx
                .update(pgCommunityPostsTable)
                .set({
                  postType: "recruitment_result",
                  origin: "user",
                  visibility: "public",
                  subjectStudentUid,
                  subjectContentUid: state.contentUid,
                  blocks,
                  sourceType: "recruitment_result",
                  sourceUid: state.uid,
                  updatedAt: new Date(now),
                })
                .where(eq(pgCommunityPostsTable.uid, commentPostUid));
            } else {
              commentPostUid = null;
            }
          }
          if (!commentPostUid) {
            const generatedUid = nanoid(8);
            const inserted = await tx
              .insert(pgCommunityPostsTable)
              .values({
                uid: generatedUid,
                userId,
                postType: "recruitment_result",
                origin: "user",
                visibility: "public",
                subjectStudentUid,
                subjectContentUid: state.contentUid,
                blocks,
                sourceType: "recruitment_result",
                sourceUid: state.uid,
                displayAt: new Date(now),
                createdAt: new Date(now),
                updatedAt: new Date(now),
              })
              .onConflictDoUpdate({
                target: [pgCommunityPostsTable.sourceType, pgCommunityPostsTable.sourceUid],
                set: { blocks, subjectContentUid: state.contentUid, subjectStudentUid, updatedAt: new Date(now) },
              })
              .returning({ uid: pgCommunityPostsTable.uid });
            commentPostUid = inserted[0]?.uid ?? generatedUid;
          }
        } else if (input.comment !== undefined && commentPostUid) {
          await deletePostWithinTransaction(tx, commentPostUid);
          commentPostUid = null;
        }

        await tx
          .update(pgRecruitmentResultsTable)
          .set({ commentPostUid, updatedAt: new Date(now) })
          .where(and(eq(pgRecruitmentResultsTable.userId, userId), eq(pgRecruitmentResultsTable.uid, state.uid)));
        const [saved] = await tx
          .select()
          .from(pgRecruitmentResultsTable)
          .where(
            and(
              eq(pgRecruitmentResultsTable.userId, userId),
              eq(pgRecruitmentResultsTable.recruitmentGroupUid, input.recruitmentGroupUid),
            ),
          )
          .limit(1);
        if (!saved) throw new Error("Failed to upsert recruitment result");
        result = toModel(saved);
        // Keep the recruited-student projection in the same PostgreSQL
        // transaction. The additive-max tier semantics make retries and
        // concurrent recruitment result writes idempotent.
        for (const student of projection) {
          await upsertRecruitedStudentFromRecruitmentResultInTransaction(tx, userId, student.studentUid, student.tier);
        }
      });
      return { result, projection };
    },
    options.createClient ?? createPostgresClient,
    options.ctx,
  );
}

export async function upsertPostgresRecruitmentResult(
  env: Env,
  userId: number,
  input: UpsertRecruitmentResultInput,
  options: PostgresRecruitmentResultOptions = {},
): Promise<RecruitmentResult> {
  return (await upsertResultAndComment(env, userId, input, options)).result;
}

export async function addPostgresRecruitedStudentToResult(
  env: Env,
  userId: number,
  input: AddRecruitedStudentToResultInput,
  options: PostgresRecruitmentResultOptions = {},
): Promise<RecruitmentResult> {
  const existing =
    (await getPostgresRecruitmentResultsByRecruitmentGroupUids(env, userId, [input.recruitmentGroupUid], options))[0] ??
    null;
  const student = sanitizeRecruitmentResultStudents([
    { studentUid: input.studentUid, tier: input.tier ?? 3, pickup: input.pickup ?? true },
  ])[0];
  if (!student) throw new Error("studentUid is required");
  const result = (
    await upsertResultAndComment(
      env,
      userId,
      {
        uid: existing?.uid,
        recruitmentGroupUid: input.recruitmentGroupUid,
        contentUid: input.contentUid !== undefined ? input.contentUid : existing?.contentUid,
        recruitedStudents: appendRecruitmentResultStudent(existing?.recruitedStudents, student),
        exchangedStudents: existing?.exchangedStudents ?? [],
        tier3Count: existing?.tier3Count,
        trial: existing?.trial,
        rawResult: existing?.rawResult,
      },
      options,
      [student],
    )
  ).result;
  return result;
}

export async function removePostgresRecruitedStudentFromResult(
  env: Env,
  userId: number,
  recruitmentGroupUid: string,
  studentUid: string,
  options: PostgresRecruitmentResultOptions = {},
): Promise<RecruitmentResult | null> {
  const existing =
    (await getPostgresRecruitmentResultsByRecruitmentGroupUids(env, userId, [recruitmentGroupUid], options))[0] ?? null;
  if (!existing) return null;
  const recruitedStudents = removeRecruitmentResultStudent(existing.recruitedStudents, studentUid);
  const completedAt = recruitedStudents.length || existing.exchangedStudents.length ? existing.completedAt : null;
  return (
    await upsertResultAndComment(
      env,
      userId,
      {
        uid: existing.uid,
        recruitmentGroupUid,
        contentUid: existing.contentUid,
        completedAt,
        recruitedStudents,
        exchangedStudents: existing.exchangedStudents,
        tier3Count: existing.tier3Count,
        trial: existing.trial,
        rawResult: existing.rawResult,
      },
      options,
      [],
    )
  ).result;
}

export async function deletePostgresRecruitmentResult(
  env: Env,
  userId: number,
  uid: string,
  options: PostgresRecruitmentResultOptions = {},
): Promise<void> {
  await withPostgresClient(
    env,
    async (client) => {
      const db = drizzle(client);
      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ commentPostUid: pgRecruitmentResultsTable.commentPostUid })
          .from(pgRecruitmentResultsTable)
          .where(and(eq(pgRecruitmentResultsTable.userId, userId), eq(pgRecruitmentResultsTable.uid, uid)))
          .limit(1);
        if (!existing) return;
        if (existing.commentPostUid) await deletePostWithinTransaction(tx, existing.commentPostUid);
        await tx
          .delete(pgRecruitmentResultsTable)
          .where(and(eq(pgRecruitmentResultsTable.userId, userId), eq(pgRecruitmentResultsTable.uid, uid)));
      });
    },
    options.createClient ?? createPostgresClient,
    options.ctx,
  );
}
