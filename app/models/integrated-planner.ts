import { savePostgresIntegratedRecruitmentPlan } from "~/db/postgres/integrated-planner";

export function saveIntegratedPlannerRecruitmentPlan(
  env: Env,
  userId: number,
  eventUid: string,
  studentUids: readonly string[],
  ctx?: ExecutionContext,
): Promise<void> {
  return savePostgresIntegratedRecruitmentPlan(env, userId, eventUid, studentUids, { ctx });
}
