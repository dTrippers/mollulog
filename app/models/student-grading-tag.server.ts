import {
  getPostgresGradingTags,
  getPostgresGradingTagsByUids,
  getPostgresTagCountsByStudent,
  setPostgresGradingTags,
} from "~/db/postgres/community";
import { resolveCommunitySourceMode } from "./community.server";
import {
  ALL_STUDENT_GRADING_TAG_VALUES,
  createGradingTags as createD1GradingTags,
  deleteGradingTags as deleteD1GradingTags,
  getGradingTags as getD1GradingTags,
  getGradingTagsByGradingUids as getD1GradingTagsByGradingUids,
  getTagCountsByStudent as getD1TagCountsByStudent,
  STUDENT_GRADING_TAG_DISPLAY,
  type StudentGradingTag,
  type StudentGradingTagCount,
  type StudentGradingTagValue,
  updateGradingTags as updateD1GradingTags,
} from "./student-grading-tag";

export type {
  StudentGradingTag,
  StudentGradingTagCount,
  StudentGradingTagValue,
} from "./student-grading-tag";
export {
  ALL_STUDENT_GRADING_TAG_VALUES,
  STUDENT_GRADING_TAG_CONSTANTS,
  STUDENT_GRADING_TAG_DISPLAY,
  sortStudentGradingTags,
} from "./student-grading-tag";

function isPostgresCommunityMode(env: Pick<Env, "COMMUNITY_SOURCE_MODE">): boolean {
  return resolveCommunitySourceMode(env.COMMUNITY_SOURCE_MODE) === "hyperdrive";
}

function validateTagValues(tagValues: StudentGradingTagValue[]): void {
  const invalidTags = tagValues.filter((tag) => !ALL_STUDENT_GRADING_TAG_VALUES.includes(tag));
  if (invalidTags.length > 0) {
    throw new Error(`Invalid tags: ${invalidTags.join(", ")}`);
  }
}

export async function getGradingTags(env: Env, gradingUid: string): Promise<StudentGradingTag[]> {
  return isPostgresCommunityMode(env) ? getPostgresGradingTags(env, gradingUid) : getD1GradingTags(env, gradingUid);
}

export async function getGradingTagsByGradingUids(
  env: Env,
  gradingUids: string[],
): Promise<Record<string, StudentGradingTag[]>> {
  return isPostgresCommunityMode(env)
    ? getPostgresGradingTagsByUids(env, gradingUids)
    : getD1GradingTagsByGradingUids(env, gradingUids);
}

export async function createGradingTags(
  env: Env,
  gradingUid: string,
  studentUid: string,
  tagValues: StudentGradingTagValue[],
): Promise<void> {
  validateTagValues(tagValues);
  return isPostgresCommunityMode(env)
    ? setPostgresGradingTags(env, gradingUid, studentUid, tagValues)
    : createD1GradingTags(env, gradingUid, studentUid, tagValues);
}

export async function updateGradingTags(
  env: Env,
  gradingUid: string,
  studentUid: string,
  tagValues: StudentGradingTagValue[],
): Promise<void> {
  validateTagValues(tagValues);
  return isPostgresCommunityMode(env)
    ? setPostgresGradingTags(env, gradingUid, studentUid, tagValues)
    : updateD1GradingTags(env, gradingUid, studentUid, tagValues);
}

export async function deleteGradingTags(env: Env, gradingUid: string): Promise<void> {
  return isPostgresCommunityMode(env)
    ? setPostgresGradingTags(env, gradingUid, "", [])
    : deleteD1GradingTags(env, gradingUid);
}

export async function getTagCountsByStudent(env: Env, studentUid: string): Promise<StudentGradingTagCount[]> {
  if (!isPostgresCommunityMode(env)) {
    return getD1TagCountsByStudent(env, studentUid);
  }
  const counts = await getPostgresTagCountsByStudent(env, studentUid, ALL_STUDENT_GRADING_TAG_VALUES);
  return counts.map((count) => ({ ...count, displayName: STUDENT_GRADING_TAG_DISPLAY[count.tag] }));
}
