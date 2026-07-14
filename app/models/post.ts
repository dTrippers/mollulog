import {
  getPostgresLatestPostTime,
  getPostgresNewsPosts,
  getPostgresPosts,
  type PostgresPostsOptions,
} from "~/db/postgres/posts";

export type { Post, PostPage } from "~/db/postgres/posts";

export function getAllPosts(env: Env, board?: string, options: PostgresPostsOptions = {}) {
  return getPostgresPosts(env, board, options);
}

export function getNewsPosts(env: Env, page = 1, pageSize = 5, options: PostgresPostsOptions = {}) {
  return getPostgresNewsPosts(env, page, pageSize, options);
}

export function getLatestPostTime(env: Env, board: string, options: PostgresPostsOptions = {}) {
  return getPostgresLatestPostTime(env, board, options);
}
