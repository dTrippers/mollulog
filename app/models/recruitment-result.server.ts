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
import { resolveCommunitySourceMode } from "./community.server";
import {
  type AddRecruitedStudentToResultInput,
  addRecruitedStudentToResult as addD1RecruitedStudentToResult,
  deleteRecruitmentResult as deleteD1RecruitmentResult,
  getRecruitmentResult as getD1RecruitmentResult,
  getRecruitmentResultComment as getD1RecruitmentResultComment,
  getRecruitmentResultComments as getD1RecruitmentResultComments,
  getRecruitmentResults as getD1RecruitmentResults,
  getRecruitmentResultsByRecruitmentGroupUids as getD1RecruitmentResultsByRecruitmentGroupUids,
  type RecruitmentResult,
  removeRecruitedStudentFromResult as removeD1RecruitedStudentFromResult,
  setRecruitmentResultCompletion as setD1RecruitmentResultCompletion,
  type UpsertRecruitmentResultInput,
  upsertRecruitmentResult as upsertD1RecruitmentResult,
} from "./recruitment-result";

export type {
  AddRecruitedStudentToResultInput,
  RecruitmentCompletionMeta,
  RecruitmentResult,
  RecruitmentResultStudent,
  UpsertRecruitmentResultInput,
} from "./recruitment-result";

function isPostgresCommunityMode(env: Pick<Env, "COMMUNITY_SOURCE_MODE">): boolean {
  return resolveCommunitySourceMode(env.COMMUNITY_SOURCE_MODE) === "hyperdrive";
}

export async function getRecruitmentResult(env: Env, userId: number, uid: string): Promise<RecruitmentResult | null> {
  return isPostgresCommunityMode(env)
    ? getPostgresRecruitmentResult(env, userId, uid)
    : getD1RecruitmentResult(env, userId, uid);
}

export async function getRecruitmentResults(env: Env, userId: number): Promise<RecruitmentResult[]> {
  return isPostgresCommunityMode(env)
    ? getPostgresRecruitmentResults(env, userId)
    : getD1RecruitmentResults(env, userId);
}

export async function getRecruitmentResultsByRecruitmentGroupUids(
  env: Env,
  userId: number,
  recruitmentGroupUids: string[],
  concurrencyGate?: ConcurrencyGate,
): Promise<RecruitmentResult[]> {
  return isPostgresCommunityMode(env)
    ? getPostgresRecruitmentResultsByRecruitmentGroupUids(env, userId, recruitmentGroupUids)
    : getD1RecruitmentResultsByRecruitmentGroupUids(env, userId, recruitmentGroupUids, concurrencyGate);
}

export async function getRecruitmentResultComment(
  env: Env,
  userId: number,
  commentPostUid: string | null | undefined,
): Promise<string | null> {
  return isPostgresCommunityMode(env)
    ? getPostgresRecruitmentResultComment(env, userId, commentPostUid)
    : getD1RecruitmentResultComment(env, userId, commentPostUid);
}

export async function getRecruitmentResultComments(
  env: Env,
  userId: number,
  commentPostUids: (string | null | undefined)[],
): Promise<Map<string, { uid: string; body: string; createdAt: string }>> {
  return isPostgresCommunityMode(env)
    ? getPostgresRecruitmentResultComments(env, userId, commentPostUids)
    : getD1RecruitmentResultComments(env, userId, commentPostUids);
}

export async function upsertRecruitmentResult(
  env: Env,
  userId: number,
  input: UpsertRecruitmentResultInput,
): Promise<RecruitmentResult> {
  return isPostgresCommunityMode(env)
    ? upsertPostgresRecruitmentResult(env, userId, input)
    : upsertD1RecruitmentResult(env, userId, input);
}

export async function addRecruitedStudentToResult(
  env: Env,
  userId: number,
  input: AddRecruitedStudentToResultInput,
): Promise<RecruitmentResult> {
  return isPostgresCommunityMode(env)
    ? addPostgresRecruitedStudentToResult(env, userId, input)
    : addD1RecruitedStudentToResult(env, userId, input);
}

export async function removeRecruitedStudentFromResult(
  env: Env,
  userId: number,
  recruitmentGroupUid: string,
  studentUid: string,
): Promise<RecruitmentResult | null> {
  return isPostgresCommunityMode(env)
    ? removePostgresRecruitedStudentFromResult(env, userId, recruitmentGroupUid, studentUid)
    : removeD1RecruitedStudentFromResult(env, userId, recruitmentGroupUid, studentUid);
}

export async function setRecruitmentResultCompletion(
  env: Env,
  userId: number,
  recruitmentGroupUid: string,
  completed: boolean,
  options: Omit<UpsertRecruitmentResultInput, "recruitmentGroupUid" | "completedAt"> = {},
): Promise<RecruitmentResult> {
  if (!isPostgresCommunityMode(env)) {
    return setD1RecruitmentResultCompletion(env, userId, recruitmentGroupUid, completed, options);
  }
  return upsertPostgresRecruitmentResult(env, userId, {
    ...options,
    recruitmentGroupUid,
    completedAt: completed ? nowUtcIso() : null,
  });
}

export async function deleteRecruitmentResult(env: Env, userId: number, uid: string): Promise<void> {
  return isPostgresCommunityMode(env)
    ? deletePostgresRecruitmentResult(env, userId, uid)
    : deleteD1RecruitmentResult(env, userId, uid);
}
