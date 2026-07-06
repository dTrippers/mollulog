import { graphql } from "~/graphql";
import type { RecruitmentGroupsListQuery, RecruitmentPoolStudentsQuery } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, fetchSourceCached } from "~/lib/cache";

const RECRUITMENT_GROUPS_CACHE_KEY = cacheKey("source", "recruitment-group", 1, "endAfterDays=7");
const HISTORICAL_RECRUITMENT_GROUPS_CACHE_KEY = cacheKey("source", "recruitment-group", 1, "all");
const RECRUITMENT_POOL_STUDENTS_CACHE_KEY = cacheKey("source", "recruitment-pool-student", 1, "all");
const BAQL_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const recruitmentGroupsQuery = graphql(`
  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {
    recruitmentGroups(endAfter: $endAfter, uids: $uids) {
      uid contentType contentUid startAt endAt recruitmentType
      recruitments {
        recruitmentType pickup rerun since until studentName
        student { uid attackType defenseType role name schaleDbId initialTier releaseAt archiveAt }
      }
    }
  }
`);

const recruitmentPoolStudentsQuery = graphql(`
  query RecruitmentPoolStudents {
    students {
      uid name initialTier attackType defenseType role releaseAt archiveAt
      recruitments {
        recruitmentType
      }
    }
  }
`);

export type RecruitmentGroup = NonNullable<RecruitmentGroupsListQuery["recruitmentGroups"][number]>;
export type RecruitmentPoolStudent = RecruitmentPoolStudentsQuery["students"][number];

async function fetchAllRecruitmentGroups(env: Env, forceRefresh = false): Promise<RecruitmentGroup[]> {
  return fetchSourceCached(
    env,
    RECRUITMENT_GROUPS_CACHE_KEY,
    async () => {
      // urql fetchExchange + Date.prototype.toJSON serializes this as an ISO 8601 string.
      const endAfter = new Date(Date.now() - BAQL_HISTORY_WINDOW_MS);
      const { data, error } = await runQuery(recruitmentGroupsQuery, {
        endAfter,
        uids: null,
      });

      if (error || !data) {
        throw error ?? new Error("failed to fetch recruitment groups");
      }

      return data.recruitmentGroups;
    },
    forceRefresh,
  );
}

async function fetchAllHistoricalRecruitmentGroups(env: Env, forceRefresh = false): Promise<RecruitmentGroup[]> {
  return fetchSourceCached(
    env,
    HISTORICAL_RECRUITMENT_GROUPS_CACHE_KEY,
    async () => {
      const { data, error } = await runQuery(recruitmentGroupsQuery, {
        endAfter: null,
        uids: null,
      });

      if (error || !data) {
        throw error ?? new Error("failed to fetch historical recruitment groups");
      }

      return data.recruitmentGroups;
    },
    forceRefresh,
  );
}

export async function getAllRecruitmentGroups(env: Env, forceRefresh = false): Promise<RecruitmentGroup[]> {
  try {
    return await fetchAllRecruitmentGroups(env, forceRefresh);
  } catch (error) {
    console.error("[getAllRecruitmentGroups] Failed", error);
    return [];
  }
}

export async function getAllHistoricalRecruitmentGroups(
  env: Env,
  forceRefresh = false,
): Promise<RecruitmentGroup[]> {
  try {
    return await fetchAllHistoricalRecruitmentGroups(env, forceRefresh);
  } catch (error) {
    console.error("[getAllHistoricalRecruitmentGroups] Failed", error);
    return [];
  }
}

export async function getRecruitmentGroupByUid(
  env: Env,
  uid: string,
  forceRefresh = false,
): Promise<RecruitmentGroup | null> {
  const groups = await getAllHistoricalRecruitmentGroups(env, forceRefresh);
  return groups.find((group) => group.uid === uid) ?? null;
}

export async function getActiveRecruitmentGroups(
  env: Env,
  now: Date,
  forceRefresh = false,
): Promise<RecruitmentGroup[]> {
  const nowTime = now.getTime();
  const groups = await getAllRecruitmentGroups(env, forceRefresh);
  return groups.filter((group) => {
    const startAt = new Date(group.startAt).getTime();
    const endAt = group.endAt ? new Date(group.endAt).getTime() : null;
    return startAt <= nowTime && (endAt === null || endAt >= nowTime);
  });
}

export async function getRecruitmentGroupsByUids(
  env: Env,
  uids: string[],
  forceRefresh = false,
): Promise<RecruitmentGroup[]> {
  if (uids.length === 0) {
    return [];
  }

  const uidSet = new Set(uids);
  const groups = await getAllHistoricalRecruitmentGroups(env, forceRefresh);
  return groups.filter((group) => uidSet.has(group.uid));
}

export async function getRecruitmentPoolStudents(
  env: Env,
  forceRefresh = false,
): Promise<RecruitmentPoolStudent[]> {
  return fetchSourceCached(
    env,
    RECRUITMENT_POOL_STUDENTS_CACHE_KEY,
    async () => {
      const { data, error } = await runQuery(recruitmentPoolStudentsQuery, {});

      if (error || !data) {
        throw error ?? new Error("failed to fetch recruitment pool students");
      }

      return data.students;
    },
    forceRefresh,
  );
}

export async function warmRecruitmentCache(env: Env, forceRefresh = true): Promise<RecruitmentGroup[]> {
  // Use the throwing fetch paths instead of the []-swallowing public wrappers so warming
  // failures surface to cron / [__manage] reporting, matching RecruitmentRepository.refresh().
  const [groups] = await Promise.all([
    fetchAllRecruitmentGroups(env, forceRefresh),
    fetchAllHistoricalRecruitmentGroups(env, forceRefresh),
    getRecruitmentPoolStudents(env, forceRefresh),
  ]);
  return groups;
}
