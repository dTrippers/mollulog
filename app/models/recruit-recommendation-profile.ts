import {
  getPostgresRecruitGoal,
  type PostgresRecruitRecommendationProfileOptions,
  setPostgresRecruitGoal,
} from "~/db/postgres/recruit-recommendation-profiles";
import type { RecruitGoal } from "~/domain/recruit-recommendation";

export function getRecruitGoal(
  env: Env,
  userId: number,
  options: PostgresRecruitRecommendationProfileOptions = {},
): Promise<RecruitGoal | null> {
  return getPostgresRecruitGoal(env, userId, options);
}

export function setRecruitGoal(
  env: Env,
  userId: number,
  goal: RecruitGoal,
  options: PostgresRecruitRecommendationProfileOptions = {},
): Promise<void> {
  return setPostgresRecruitGoal(env, userId, goal, options);
}
