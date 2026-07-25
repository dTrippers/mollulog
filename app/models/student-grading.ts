import { and, desc, eq, type SQLWrapper, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { nanoid } from "nanoid/non-secure";
import { nowUtcIso, type UtcIsoString } from "~/lib/date-time";
import {
  communityPostsTable,
  createPlaintextCommunityPostBlocks,
  deleteCommunityPostByUid,
  getPrimaryPlaintextBlockText,
  normalizeCommunityTimestamp,
  parseCommunityPostBlocks,
  serializeCommunityPostBlocks,
} from "./community";
import { senseiProfileVisibilityFilter, senseisTable } from "./sensei";
import type { StudentGradingTagValue } from "./student-grading-tag";
import {
  getGradingTags,
  getGradingTagsByGradingUids,
  studentGradingTagsTable,
  updateGradingTags,
} from "./student-grading-tag";

export const studentGradingsTable = communityPostsTable;

export type StudentGrading = {
  uid: string;
  studentUid: string;
  comment: string | null;
  createdAt: UtcIsoString;
  updatedAt: UtcIsoString;
  tags?: StudentGradingTagValue[];
};

export type StudentGradingWithUser = StudentGrading & {
  user: {
    username: string;
    profileStudentId: string | null;
  };
};

export type StudentGradingPageWithUser = {
  items: StudentGradingWithUser[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function toModel(grading: typeof communityPostsTable.$inferSelect): StudentGrading {
  return {
    uid: grading.uid,
    studentUid: grading.subjectStudentUid ?? "",
    comment: getPrimaryPlaintextBlockText(parseCommunityPostBlocks(grading.blocks)),
    createdAt: normalizeCommunityTimestamp(grading.createdAt),
    updatedAt: normalizeCommunityTimestamp(grading.updatedAt),
  };
}

function studentReviewWhere(studentUid?: string) {
  return and(
    eq(communityPostsTable.postType, "student_review"),
    studentUid ? eq(communityPostsTable.subjectStudentUid, studentUid) : undefined,
  );
}

function authorProfileVisibilityFilter(viewerUserId?: number): SQLWrapper {
  return senseiProfileVisibilityFilter(viewerUserId, communityPostsTable.userId);
}

export async function getStudentGrading(
  env: Env,
  senseiId: number,
  studentUid: string,
  includeTags = false,
): Promise<StudentGrading | null> {
  const db = drizzle(env.DB);
  const result = await db
    .select()
    .from(communityPostsTable)
    .where(and(studentReviewWhere(studentUid), eq(communityPostsTable.userId, senseiId)))
    .limit(1);

  if (result.length === 0) return null;

  const grading = toModel(result[0]);

  if (includeTags) {
    grading.tags = (await getGradingTags(env, grading.uid)).map((tag) => tag.tagValue);
  }

  return grading;
}

export async function upsertStudentGrading(
  env: Env,
  senseiId: number,
  studentUid: string,
  comment: string | null,
  tags: StudentGradingTagValue[],
): Promise<void> {
  if (comment && comment.length > 100) {
    throw new Error("Comment must be less than 100 characters");
  }

  const db = drizzle(env.DB);
  const existing = await db
    .select({ uid: communityPostsTable.uid })
    .from(communityPostsTable)
    .where(and(studentReviewWhere(studentUid), eq(communityPostsTable.userId, senseiId)))
    .limit(1);

  const blocks = serializeCommunityPostBlocks(createPlaintextCommunityPostBlocks(comment));
  const now = nowUtcIso();
  let gradingUid: string;

  if (existing.length > 0) {
    gradingUid = existing[0].uid;
    await db
      .update(communityPostsTable)
      .set({
        blocks,
        visibility: "public",
        updatedAt: now,
      })
      .where(eq(communityPostsTable.uid, gradingUid));
  } else {
    gradingUid = nanoid(8);
    await db.insert(communityPostsTable).values({
      uid: gradingUid,
      userId: senseiId,
      postType: "student_review",
      subjectStudentUid: studentUid,
      visibility: "public",
      blocks,
      displayAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  await updateGradingTags(env, gradingUid, studentUid, tags);
}

export async function deleteStudentGrading(env: Env, senseiId: number, studentUid: string): Promise<void> {
  const db = drizzle(env.DB);
  const existing = await db
    .select({ uid: communityPostsTable.uid })
    .from(communityPostsTable)
    .where(and(studentReviewWhere(studentUid), eq(communityPostsTable.userId, senseiId)))
    .limit(1);

  if (existing.length === 0) {
    return;
  }

  await deleteCommunityPostByUid(env, existing[0].uid, senseiId);
}

export async function getStudentGradingsByStudentWithUsers(
  env: Env,
  studentUid: string,
  includeTags = false,
  viewerUserId?: number,
): Promise<StudentGradingWithUser[]> {
  const db = drizzle(env.DB);
  const gradings = await db
    .select({
      uid: communityPostsTable.uid,
      subjectStudentUid: communityPostsTable.subjectStudentUid,
      blocks: communityPostsTable.blocks,
      createdAt: communityPostsTable.createdAt,
      updatedAt: communityPostsTable.updatedAt,
      username: senseisTable.username,
      profileStudentId: senseisTable.profileStudentId,
    })
    .from(communityPostsTable)
    .innerJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
    .where(and(studentReviewWhere(studentUid), authorProfileVisibilityFilter(viewerUserId)));

  const result: StudentGradingWithUser[] = gradings.map((grading) => ({
    uid: grading.uid,
    studentUid: grading.subjectStudentUid ?? studentUid,
    comment: getPrimaryPlaintextBlockText(parseCommunityPostBlocks(grading.blocks)),
    createdAt: normalizeCommunityTimestamp(grading.createdAt),
    updatedAt: normalizeCommunityTimestamp(grading.updatedAt),
    user: {
      username: grading.username,
      profileStudentId: grading.profileStudentId,
    },
  }));

  if (includeTags) {
    const gradingUids = result.map((grading) => grading.uid);
    const tagsMap = await getGradingTagsByGradingUids(env, gradingUids);
    for (const grading of result) {
      grading.tags = tagsMap[grading.uid]?.map((tag) => tag.tagValue) || [];
    }
  }

  return result;
}

export async function getStudentGradingsByUser(env: Env, userId: number): Promise<StudentGrading[]> {
  const db = drizzle(env.DB);
  const gradings = await db
    .select({
      uid: communityPostsTable.uid,
      subjectStudentUid: communityPostsTable.subjectStudentUid,
      blocks: communityPostsTable.blocks,
      createdAt: communityPostsTable.createdAt,
      updatedAt: communityPostsTable.updatedAt,
    })
    .from(communityPostsTable)
    .where(and(eq(communityPostsTable.userId, userId), eq(communityPostsTable.postType, "student_review")));

  const result: StudentGrading[] = gradings.map((grading) => ({
    uid: grading.uid,
    studentUid: grading.subjectStudentUid ?? "",
    comment: getPrimaryPlaintextBlockText(parseCommunityPostBlocks(grading.blocks)),
    createdAt: normalizeCommunityTimestamp(grading.createdAt),
    updatedAt: normalizeCommunityTimestamp(grading.updatedAt),
  }));

  const gradingUids = result.map((grading) => grading.uid);
  const tagsMap = await getGradingTagsByGradingUids(env, gradingUids);
  for (const grading of result) {
    grading.tags = tagsMap[grading.uid]?.map((tag) => tag.tagValue) || [];
  }

  return result;
}

export async function getRecentStudentGradingsWithUsers(
  env: Env,
  limit = 3,
  includeTags = false,
  viewerUserId?: number,
): Promise<StudentGradingWithUser[]> {
  const db = drizzle(env.DB);
  const gradings = await db
    .select({
      uid: communityPostsTable.uid,
      subjectStudentUid: communityPostsTable.subjectStudentUid,
      blocks: communityPostsTable.blocks,
      createdAt: communityPostsTable.createdAt,
      updatedAt: communityPostsTable.updatedAt,
      username: senseisTable.username,
      profileStudentId: senseisTable.profileStudentId,
    })
    .from(communityPostsTable)
    .innerJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
    .where(and(eq(communityPostsTable.postType, "student_review"), authorProfileVisibilityFilter(viewerUserId)))
    .orderBy(
      desc(sql`unixepoch(${communityPostsTable.updatedAt})`),
      desc(sql`unixepoch(${communityPostsTable.createdAt})`),
      desc(communityPostsTable.id),
    )
    .limit(limit);

  const result: StudentGradingWithUser[] = gradings.map((grading) => ({
    uid: grading.uid,
    studentUid: grading.subjectStudentUid ?? "",
    comment: getPrimaryPlaintextBlockText(parseCommunityPostBlocks(grading.blocks)),
    createdAt: normalizeCommunityTimestamp(grading.createdAt),
    updatedAt: normalizeCommunityTimestamp(grading.updatedAt),
    user: {
      username: grading.username,
      profileStudentId: grading.profileStudentId,
    },
  }));

  if (includeTags) {
    const gradingUids = result.map((grading) => grading.uid);
    const tagsMap = await getGradingTagsByGradingUids(env, gradingUids);
    for (const grading of result) {
      grading.tags = tagsMap[grading.uid]?.map((tag) => tag.tagValue) || [];
    }
  }

  return result;
}

export async function getRecentStudentGradingsPageWithUsers(
  env: Env,
  page = 1,
  pageSize = 20,
  includeTags = false,
  viewerUserId?: number,
): Promise<StudentGradingPageWithUser> {
  const db = drizzle(env.DB);
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(communityPostsTable)
    .innerJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
    .where(and(eq(communityPostsTable.postType, "student_review"), authorProfileVisibilityFilter(viewerUserId)));

  const totalCount = Number(count);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;

  const gradings = await db
    .select({
      uid: communityPostsTable.uid,
      subjectStudentUid: communityPostsTable.subjectStudentUid,
      blocks: communityPostsTable.blocks,
      createdAt: communityPostsTable.createdAt,
      updatedAt: communityPostsTable.updatedAt,
      username: senseisTable.username,
      profileStudentId: senseisTable.profileStudentId,
    })
    .from(communityPostsTable)
    .innerJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
    .where(and(eq(communityPostsTable.postType, "student_review"), authorProfileVisibilityFilter(viewerUserId)))
    .orderBy(
      desc(sql`unixepoch(${communityPostsTable.updatedAt})`),
      desc(sql`unixepoch(${communityPostsTable.createdAt})`),
      desc(communityPostsTable.id),
    )
    .limit(safePageSize)
    .offset(offset);

  const items: StudentGradingWithUser[] = gradings.map((grading) => ({
    uid: grading.uid,
    studentUid: grading.subjectStudentUid ?? "",
    comment: getPrimaryPlaintextBlockText(parseCommunityPostBlocks(grading.blocks)),
    createdAt: normalizeCommunityTimestamp(grading.createdAt),
    updatedAt: normalizeCommunityTimestamp(grading.updatedAt),
    user: {
      username: grading.username,
      profileStudentId: grading.profileStudentId,
    },
  }));

  if (includeTags) {
    const gradingUids = items.map((grading) => grading.uid);
    const tagsMap = await getGradingTagsByGradingUids(env, gradingUids);
    for (const grading of items) {
      grading.tags = tagsMap[grading.uid]?.map((tag) => tag.tagValue) || [];
    }
  }

  return {
    items,
    page: currentPage,
    pageSize: safePageSize,
    totalCount,
    totalPages,
  };
}
