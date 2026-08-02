import {
  deletePostgresCommunityPostByUid,
  getPostgresRecentStudentGradingsPage,
  getPostgresStudentGrading,
  getPostgresStudentGradingsByStudent,
  getPostgresStudentGradingsByUser,
  upsertPostgresStudentGrading,
} from "~/db/postgres/community";
import { createPlaintextCommunityPostBlocks } from "./community";
import type { StudentGrading, StudentGradingPageWithUser, StudentGradingWithUser } from "./student-grading";
import type { StudentGradingTagValue } from "./student-grading-tag";
import { getGradingTags, updateGradingTags } from "./student-grading-tag.server";

export type { StudentGrading, StudentGradingPageWithUser, StudentGradingWithUser } from "./student-grading";

export async function getStudentGrading(
  env: Env,
  senseiId: number,
  studentUid: string,
  includeTags = false,
): Promise<StudentGrading | null> {
  const grading = await getPostgresStudentGrading(env, senseiId, studentUid);
  if (grading && includeTags) grading.tags = (await getGradingTags(env, grading.uid)).map((tag) => tag.tagValue);
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
  await upsertPostgresStudentGrading(env, senseiId, studentUid, createPlaintextCommunityPostBlocks(comment));
  const existing = await getPostgresStudentGrading(env, senseiId, studentUid);
  if (existing) await updateGradingTags(env, existing.uid, studentUid, tags);
}

export async function deleteStudentGrading(env: Env, senseiId: number, studentUid: string): Promise<void> {
  const existing = await getPostgresStudentGrading(env, senseiId, studentUid);
  if (existing) await deletePostgresCommunityPostByUid(env, existing.uid, senseiId);
}

export async function getStudentGradingsByStudentWithUsers(
  env: Env,
  studentUid: string,
  includeTags = false,
  viewerUserId?: number,
): Promise<StudentGradingWithUser[]> {
  return getPostgresStudentGradingsByStudent(env, studentUid, viewerUserId, includeTags);
}

export async function getStudentGradingsByUser(env: Env, userId: number): Promise<StudentGrading[]> {
  return getPostgresStudentGradingsByUser(env, userId, true);
}

export async function getRecentStudentGradingsWithUsers(
  env: Env,
  limit = 3,
  includeTags = false,
  viewerUserId?: number,
): Promise<StudentGradingWithUser[]> {
  const page = await getPostgresRecentStudentGradingsPage(env, 1, Math.max(1, limit), includeTags, viewerUserId);
  return page.items;
}

export async function getRecentStudentGradingsPageWithUsers(
  env: Env,
  page = 1,
  pageSize = 20,
  includeTags = false,
  viewerUserId?: number,
): Promise<StudentGradingPageWithUser> {
  return getPostgresRecentStudentGradingsPage(env, page, pageSize, includeTags, viewerUserId);
}
