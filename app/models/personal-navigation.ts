import {
  getPostgresPersonalNavigationState,
  type PersonalNavigationState,
  type PostgresPersonalNavigationOptions,
} from "~/db/postgres/personal-navigation";

export type { PersonalNavigationState };

export function getPersonalNavigationState(
  env: Env,
  userId: number,
  options: PostgresPersonalNavigationOptions = {},
): Promise<PersonalNavigationState> {
  return getPostgresPersonalNavigationState(env, userId, options);
}
