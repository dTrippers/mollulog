import {
  deletePostgresCommunityPostByUid,
  getPostgresRecentStudentGradingsPage,
  getPostgresStudentGrading,
  getPostgresStudentGradingsByStudent,
  getPostgresStudentGradingsByUser,
  upsertPostgresStudentGrading,
} from "~/db/postgres/community";
import { createPlaintextCommunityPostBlocks } from "./community";
import { resolveCommunitySourceMode } from "./community.server";
import {
  deleteStudentGrading as deleteD1StudentGrading,
  getRecentStudentGradingsPageWithUsers as getD1RecentStudentGradingsPageWithUsers,
  getRecentStudentGradingsWithUsers as getD1RecentStudentGradingsWithUsers,
  getStudentGrading as getD1StudentGrading,
  getStudentGradingsByStudentWithUsers as getD1StudentGradingsByStudentWithUsers,
  getStudentGradingsByUser as getD1StudentGradingsByUser,
  type StudentGrading,
  type StudentGradingPageWithUser,
  type StudentGradingWithUser,
  upsertStudentGrading as upsertD1StudentGrading,
} from "./student-grading";
import type { StudentGradingTagValue } from "./student-grading-tag";
import { getGradingTags, updateGradingTags } from "./student-grading-tag.server";

export type { StudentGrading, StudentGradingPageWithUser, StudentGradingWithUser } from "./student-grading";

function isPostgresCommunityMode(env: Pick<Env, "COMMUNITY_SOURCE_MODE">): boolean {
  return resolveCommunitySourceMode(env.COMMUNITY_SOURCE_MODE) === "hyperdrive";
}

export async function getStudentGrading(
  env: Env,
  senseiId: number,
  studentUid: string,
  includeTags = false,
): Promise<StudentGrading | null> {
  if (!isPostgresCommunityMode(env)) {
    return getD1StudentGrading(env, senseiId, studentUid, includeTags);
  }
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
  if (!isPostgresCommunityMode(env)) {
    return upsertD1StudentGrading(env, senseiId, studentUid, comment, tags);
  }
  await upsertPostgresStudentGrading(env, senseiId, studentUid, createPlaintextCommunityPostBlocks(comment));
  const existing = await getPostgresStudentGrading(env, senseiId, studentUid);
  if (existing) await updateGradingTags(env, existing.uid, studentUid, tags);
}

export async function deleteStudentGrading(env: Env, senseiId: number, studentUid: string): Promise<void> {
  if (!isPostgresCommunityMode(env)) {
    return deleteD1StudentGrading(env, senseiId, studentUid);
  }
  const existing = await getPostgresStudentGrading(env, senseiId, studentUid);
  if (existing) await deletePostgresCommunityPostByUid(env, existing.uid, senseiId);
}

export async function getStudentGradingsByStudentWithUsers(
  env: Env,
  studentUid: string,
  includeTags = false,
  viewerUserId?: number,
): Promise<StudentGradingWithUser[]> {
  return isPostgresCommunityMode(env)
    ? getPostgresStudentGradingsByStudent(env, studentUid, viewerUserId, includeTags)
    : getD1StudentGradingsByStudentWithUsers(env, studentUid, includeTags, viewerUserId);
}

export async function getStudentGradingsByUser(env: Env, userId: number): Promise<StudentGrading[]> {
  return isPostgresCommunityMode(env)
    ? getPostgresStudentGradingsByUser(env, userId, true)
    : getD1StudentGradingsByUser(env, userId);
}

export async function getRecentStudentGradingsWithUsers(
  env: Env,
  limit = 3,
  includeTags = false,
  viewerUserId?: number,
): Promise<StudentGradingWithUser[]> {
  if (!isPostgresCommunityMode(env)) {
    return getD1RecentStudentGradingsWithUsers(env, limit, includeTags, viewerUserId);
  }
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
  return isPostgresCommunityMode(env)
    ? getPostgresRecentStudentGradingsPage(env, page, pageSize, includeTags, viewerUserId)
    : getD1RecentStudentGradingsPageWithUsers(env, page, pageSize, includeTags, viewerUserId);
}
