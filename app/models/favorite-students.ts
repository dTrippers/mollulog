import {
  favoriteStudentD1,
  getD1FavoritedCounts,
  getD1FavoriteRecord,
  getD1UserFavoritedStudents,
  unfavoriteStudentD1,
} from "~/db/d1/favorite-students";
import {
  applyPostgresFavoriteState,
  getPostgresFavoritedCounts,
  getPostgresUserFavoritedStudents,
  type PostgresFavoriteOptions,
  setPostgresFavoriteState,
} from "~/db/postgres/favorite-students";
import {
  compareFavoritedCounts,
  compareFavoriteStudents,
  type FavoritedCount,
  type FavoriteParity,
  type FavoriteStudent,
} from "~/domain/favorite-student";
import type { ConcurrencyGate } from "~/lib/concurrency";
import { getLogger } from "~/lib/observability.server";

export type { FavoritedCount, FavoriteStudent } from "~/domain/favorite-student";

export const FAVORITE_STUDENT_SOURCE_MODES = ["d1", "compare", "hyperdrive"] as const;
export type FavoriteStudentSourceMode = (typeof FAVORITE_STUDENT_SOURCE_MODES)[number];

type FavoriteReadOptions = PostgresFavoriteOptions;
type FavoriteMutationOptions = PostgresFavoriteOptions;

type Timed<T> = {
  value: T;
  durationMs: number;
};

const MISMATCH_LOG_LIMIT = 20;

export function resolveFavoriteStudentSourceMode(value: string | undefined): FavoriteStudentSourceMode {
  if (value === undefined) return "d1";
  if (FAVORITE_STUDENT_SOURCE_MODES.includes(value as FavoriteStudentSourceMode)) {
    return value as FavoriteStudentSourceMode;
  }
  throw new Error(`invalid FAVORITE_STUDENT_SOURCE_MODE: ${value}`);
}

async function timed<T>(load: () => Promise<T>): Promise<Timed<T>> {
  const startedAt = performance.now();
  const value = await load();
  return { value, durationMs: performance.now() - startedAt };
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

async function observeComparison<T>(
  env: Env,
  queryName: string,
  ctx: ExecutionContext | undefined,
  d1Promise: Promise<Timed<T[]>>,
  postgresPromise: Promise<Timed<T[]>>,
  compare: (source: T[], target: T[]) => FavoriteParity,
): Promise<void> {
  const logger = getLogger(env, ctx, { scope: "favorite_compare", queryName });
  const operation = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
    span?.setAttribute("favorite.source_mode", "compare");
    span?.setAttribute("favorite.query_name", queryName);
    let d1: Timed<T[]>;
    let postgres: Timed<T[]>;
    try {
      [d1, postgres] = await Promise.all([d1Promise, postgresPromise]);
    } catch (error) {
      span?.setAttribute("favorite.error", true);
      const code = errorCode(error);
      if (code) span?.setAttribute("favorite.hyperdrive.error_code", code);
      throw error;
    }

    const parity = compare(d1.value, postgres.value);
    span?.setAttribute("favorite.d1.duration_ms", d1.durationMs);
    span?.setAttribute("favorite.hyperdrive.duration_ms", postgres.durationMs);
    span?.setAttribute("favorite.d1.row_count", parity.sourceCount);
    span?.setAttribute("favorite.hyperdrive.row_count", parity.targetCount);
    span?.setAttribute("favorite.parity.matched", parity.matched);
    span?.setAttribute("favorite.parity.missing_count", parity.missingTargetKeys.length);
    span?.setAttribute("favorite.parity.unexpected_count", parity.unexpectedTargetKeys.length);
    span?.setAttribute("favorite.parity.mismatched_count", parity.mismatchedKeys.length);

    if (!parity.matched) {
      logger.warn("Favorite read parity mismatch", {
        sourceCount: parity.sourceCount,
        targetCount: parity.targetCount,
        missingTargetKeys: parity.missingTargetKeys.slice(0, MISMATCH_LOG_LIMIT),
        unexpectedTargetKeys: parity.unexpectedTargetKeys.slice(0, MISMATCH_LOG_LIMIT),
        mismatchedKeys: parity.mismatchedKeys.slice(0, MISMATCH_LOG_LIMIT),
      });
    }
  };

  const comparison = ctx ? ctx.tracing.enterSpan("favorites.compare", operation) : operation();
  const observed = comparison.catch((error) => {
    logger.error("Favorite read comparison failed", error, { code: errorCode(error) });
  });
  if (ctx) {
    ctx.waitUntil(observed);
    return;
  }
  await observed;
}

export async function getUserFavoritedStudents(
  env: Env,
  userId: number,
  contentId?: string,
  options: FavoriteReadOptions = {},
): Promise<FavoriteStudent[]> {
  const mode = resolveFavoriteStudentSourceMode(env.FAVORITE_STUDENT_SOURCE_MODE);
  if (mode === "d1") return getD1UserFavoritedStudents(env, userId, contentId);
  if (mode === "hyperdrive") return getPostgresUserFavoritedStudents(env, userId, contentId, options);

  const d1Promise = timed(() => getD1UserFavoritedStudents(env, userId, contentId));
  const postgresPromise = timed(() => getPostgresUserFavoritedStudents(env, userId, contentId, options));
  await observeComparison(env, "get_by_user", options.ctx, d1Promise, postgresPromise, compareFavoriteStudents);
  return (await d1Promise).value;
}

export async function getFavoritedCounts(
  env: Env,
  studentIds: string[],
  concurrencyGate?: ConcurrencyGate,
  options: FavoriteReadOptions = {},
): Promise<FavoritedCount[]> {
  const mode = resolveFavoriteStudentSourceMode(env.FAVORITE_STUDENT_SOURCE_MODE);
  if (mode === "d1") return getD1FavoritedCounts(env, studentIds, concurrencyGate);
  if (mode === "hyperdrive") return getPostgresFavoritedCounts(env, studentIds, options);

  const d1Promise = timed(() => getD1FavoritedCounts(env, studentIds, concurrencyGate));
  const postgresPromise = timed(() => getPostgresFavoritedCounts(env, studentIds, options));
  await observeComparison(env, "get_counts", options.ctx, d1Promise, postgresPromise, compareFavoritedCounts);
  return (await d1Promise).value;
}

async function shadowCurrentD1State(
  env: Env,
  key: { userId: number; studentId: string; contentId: string },
  options: FavoriteMutationOptions,
): Promise<void> {
  const { ctx } = options;
  const logger = getLogger(env, ctx, {
    scope: "favorite_shadow_write",
    studentId: key.studentId,
    contentId: key.contentId,
  });
  const operation = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
    const startedAt = performance.now();
    span?.setAttribute("favorite.source_mode", "compare");
    span?.setAttribute("favorite.shadow.desired_state", "current_d1_state");
    try {
      const record = await getD1FavoriteRecord(env, key.userId, key.studentId, key.contentId);
      await applyPostgresFavoriteState(env, key, record, options);
      span?.setAttribute("favorite.shadow.favorited", record !== null);
      span?.setAttribute("favorite.shadow.duration_ms", performance.now() - startedAt);
    } catch (error) {
      span?.setAttribute("favorite.shadow.error", true);
      const code = errorCode(error);
      if (code) span?.setAttribute("favorite.hyperdrive.error_code", code);
      throw error;
    }
  };
  const shadow = ctx ? ctx.tracing.enterSpan("favorites.shadow_write", operation) : operation();
  const observed = shadow.catch((error) => {
    logger.error("Favorite shadow write failed", error, { code: errorCode(error) });
  });
  if (ctx) {
    ctx.waitUntil(observed);
    return;
  }
  await observed;
}

async function mutateFavoriteStudent(
  env: Env,
  userId: number,
  studentId: string,
  contentId: string,
  favorited: boolean,
  options: FavoriteMutationOptions,
): Promise<void> {
  const mode = resolveFavoriteStudentSourceMode(env.FAVORITE_STUDENT_SOURCE_MODE);
  const key = { userId, studentId, contentId };
  if (mode === "hyperdrive") {
    await setPostgresFavoriteState(env, key, favorited, options);
    return;
  }

  if (favorited) await favoriteStudentD1(env, userId, studentId, contentId);
  else await unfavoriteStudentD1(env, userId, studentId, contentId);

  if (mode === "compare") await shadowCurrentD1State(env, key, options);
}

export function favoriteStudent(
  env: Env,
  userId: number,
  studentId: string,
  contentId: string,
  options: FavoriteMutationOptions = {},
): Promise<void> {
  return mutateFavoriteStudent(env, userId, studentId, contentId, true, options);
}

export function unfavoriteStudent(
  env: Env,
  userId: number,
  studentId: string,
  contentId: string,
  options: FavoriteMutationOptions = {},
): Promise<void> {
  return mutateFavoriteStudent(env, userId, studentId, contentId, false, options);
}
