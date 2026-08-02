import {
  getPostgresGradingTags,
  getPostgresGradingTagsByUids,
  getPostgresTagCountsByStudent,
  setPostgresGradingTags,
} from "~/db/postgres/community";
import {
  ALL_STUDENT_GRADING_TAG_VALUES,
  STUDENT_GRADING_TAG_DISPLAY,
  type StudentGradingTag,
  type StudentGradingTagCount,
  type StudentGradingTagValue,
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

function validateTagValues(tagValues: StudentGradingTagValue[]): void {
  const invalidTags = tagValues.filter((tag) => !ALL_STUDENT_GRADING_TAG_VALUES.includes(tag));
  if (invalidTags.length > 0) {
    throw new Error(`Invalid tags: ${invalidTags.join(", ")}`);
  }
}

export async function getGradingTags(env: Env, gradingUid: string): Promise<StudentGradingTag[]> {
  return getPostgresGradingTags(env, gradingUid);
}

export async function getGradingTagsByGradingUids(
  env: Env,
  gradingUids: string[],
): Promise<Record<string, StudentGradingTag[]>> {
  return getPostgresGradingTagsByUids(env, gradingUids);
}

export async function createGradingTags(
  env: Env,
  gradingUid: string,
  studentUid: string,
  tagValues: StudentGradingTagValue[],
): Promise<void> {
  validateTagValues(tagValues);
  return setPostgresGradingTags(env, gradingUid, studentUid, tagValues);
}

export async function updateGradingTags(
  env: Env,
  gradingUid: string,
  studentUid: string,
  tagValues: StudentGradingTagValue[],
): Promise<void> {
  validateTagValues(tagValues);
  return setPostgresGradingTags(env, gradingUid, studentUid, tagValues);
}

export async function deleteGradingTags(env: Env, gradingUid: string): Promise<void> {
  return setPostgresGradingTags(env, gradingUid, "", []);
}

export async function getTagCountsByStudent(env: Env, studentUid: string): Promise<StudentGradingTagCount[]> {
  const counts = await getPostgresTagCountsByStudent(env, studentUid, ALL_STUDENT_GRADING_TAG_VALUES);
  return counts.map((count) => ({ ...count, displayName: STUDENT_GRADING_TAG_DISPLAY[count.tag] }));
}
