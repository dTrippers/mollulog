import {
  getPostgresFavoritedCounts,
  getPostgresUserFavoritedStudents,
  type PostgresFavoriteOptions,
  setPostgresFavoriteState,
} from "~/db/postgres/favorite-students";

export type { FavoritedCount, FavoriteStudent } from "~/domain/favorite-student";

type FavoriteReadOptions = PostgresFavoriteOptions;
type FavoriteMutationOptions = PostgresFavoriteOptions;

export function getUserFavoritedStudents(
  env: Env,
  userId: number,
  contentId?: string,
  options: FavoriteReadOptions = {},
) {
  return getPostgresUserFavoritedStudents(env, userId, contentId, options);
}

export function getFavoritedCounts(env: Env, studentIds: string[], options: FavoriteReadOptions = {}) {
  return getPostgresFavoritedCounts(env, studentIds, options);
}

export function favoriteStudent(
  env: Env,
  userId: number,
  studentId: string,
  contentId: string,
  options: FavoriteMutationOptions = {},
): Promise<void> {
  return setPostgresFavoriteState(env, { userId, studentId, contentId }, true, options);
}

export function unfavoriteStudent(
  env: Env,
  userId: number,
  studentId: string,
  contentId: string,
  options: FavoriteMutationOptions = {},
): Promise<void> {
  return setPostgresFavoriteState(env, { userId, studentId, contentId }, false, options);
}
