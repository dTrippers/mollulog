import {
  addPostgresRecruitedStudentToResult,
  deletePostgresRecruitmentResult,
  getPostgresRecruitmentResult,
  getPostgresRecruitmentResultComment,
  getPostgresRecruitmentResultComments,
  getPostgresRecruitmentResults,
  getPostgresRecruitmentResultsByRecruitmentGroupUids,
  removePostgresRecruitedStudentFromResult,
  upsertPostgresRecruitmentResult,
} from "~/db/postgres/recruitment-results";
import type { ConcurrencyGate } from "~/lib/concurrency";
import { nowUtcIso } from "~/lib/date-time";
import type {
  AddRecruitedStudentToResultInput,
  RecruitmentResult,
  UpsertRecruitmentResultInput,
} from "./recruitment-result";

export type {
  AddRecruitedStudentToResultInput,
  RecruitmentCompletionMeta,
  RecruitmentResult,
  RecruitmentResultStudent,
  UpsertRecruitmentResultInput,
} from "./recruitment-result";

export async function getRecruitmentResult(env: Env, userId: number, uid: string): Promise<RecruitmentResult | null> {
  return getPostgresRecruitmentResult(env, userId, uid);
}

export async function getRecruitmentResults(env: Env, userId: number): Promise<RecruitmentResult[]> {
  return getPostgresRecruitmentResults(env, userId);
}

export async function getRecruitmentResultsByRecruitmentGroupUids(
  env: Env,
  userId: number,
  recruitmentGroupUids: string[],
  _concurrencyGate?: ConcurrencyGate,
): Promise<RecruitmentResult[]> {
  return getPostgresRecruitmentResultsByRecruitmentGroupUids(env, userId, recruitmentGroupUids);
}

export async function getRecruitmentResultComment(
  env: Env,
  userId: number,
  commentPostUid: string | null | undefined,
): Promise<string | null> {
  return getPostgresRecruitmentResultComment(env, userId, commentPostUid);
}

export async function getRecruitmentResultComments(
  env: Env,
  userId: number,
  commentPostUids: (string | null | undefined)[],
): Promise<Map<string, { uid: string; body: string; createdAt: string }>> {
  return getPostgresRecruitmentResultComments(env, userId, commentPostUids);
}

export async function upsertRecruitmentResult(
  env: Env,
  userId: number,
  input: UpsertRecruitmentResultInput,
): Promise<RecruitmentResult> {
  return upsertPostgresRecruitmentResult(env, userId, input);
}

export async function addRecruitedStudentToResult(
  env: Env,
  userId: number,
  input: AddRecruitedStudentToResultInput,
): Promise<RecruitmentResult> {
  return addPostgresRecruitedStudentToResult(env, userId, input);
}

export async function removeRecruitedStudentFromResult(
  env: Env,
  userId: number,
  recruitmentGroupUid: string,
  studentUid: string,
): Promise<RecruitmentResult | null> {
  return removePostgresRecruitedStudentFromResult(env, userId, recruitmentGroupUid, studentUid);
}

export async function setRecruitmentResultCompletion(
  env: Env,
  userId: number,
  recruitmentGroupUid: string,
  completed: boolean,
  options: Omit<UpsertRecruitmentResultInput, "recruitmentGroupUid" | "completedAt"> = {},
): Promise<RecruitmentResult> {
  return upsertPostgresRecruitmentResult(env, userId, {
    ...options,
    recruitmentGroupUid,
    completedAt: completed ? nowUtcIso() : null,
  });
}

export async function deleteRecruitmentResult(env: Env, userId: number, uid: string): Promise<void> {
  return deletePostgresRecruitmentResult(env, userId, uid);
}
