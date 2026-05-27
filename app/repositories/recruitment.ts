import { graphql } from "~/graphql";
import type { RecruitmentGroupsListQuery, RecruitmentPoolStudentsQuery } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "~/models/base";

const RECRUITMENT_GROUPS_CACHE_KEY = "repo::recruitment-groups::all";
const HISTORICAL_RECRUITMENT_GROUPS_CACHE_KEY = "repo::recruitment-groups::all-historical::v1";
const RECRUITMENT_POOL_STUDENTS_CACHE_KEY = "repo::recruitment-pool-students::all::v1";
const RECRUITMENT_GROUPS_CACHE_TTL = 24 * 60 * 60;
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

export class RecruitmentRepository {
  private allPromise: Promise<RecruitmentGroup[]> | null = null;
  private refreshPromise: Promise<RecruitmentGroup[]> | null = null;
  private historicalPromise: Promise<RecruitmentGroup[]> | null = null;
  private historicalRefreshPromise: Promise<RecruitmentGroup[]> | null = null;

  constructor(private env: Env) {}

  private async fetchAll(forceRefresh = false): Promise<RecruitmentGroup[]> {
    return fetchCached(
      this.env,
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
      RECRUITMENT_GROUPS_CACHE_TTL,
      forceRefresh,
    );
  }

  private async fetchAllHistorical(forceRefresh = false): Promise<RecruitmentGroup[]> {
    return fetchCached(
      this.env,
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
      RECRUITMENT_GROUPS_CACHE_TTL,
      forceRefresh,
    );
  }

  private getAllPromise(forceRefresh = false): Promise<RecruitmentGroup[]> {
    if (forceRefresh) {
      if (!this.refreshPromise) {
        this.refreshPromise = this.fetchAll(true)
          .then((groups) => {
            this.allPromise = Promise.resolve(groups);
            return groups;
          })
          .finally(() => {
            this.refreshPromise = null;
          });
      }

      return this.refreshPromise;
    }

    if (!this.allPromise) {
      this.allPromise = this.fetchAll(false).catch((error) => {
        this.allPromise = null;
        throw error;
      });
    }

    return this.allPromise;
  }

  private getAllHistoricalPromise(forceRefresh = false): Promise<RecruitmentGroup[]> {
    if (forceRefresh) {
      if (!this.historicalRefreshPromise) {
        this.historicalRefreshPromise = this.fetchAllHistorical(true)
          .then((groups) => {
            this.historicalPromise = Promise.resolve(groups);
            return groups;
          })
          .finally(() => {
            this.historicalRefreshPromise = null;
          });
      }

      return this.historicalRefreshPromise;
    }

    if (!this.historicalPromise) {
      this.historicalPromise = this.fetchAllHistorical(false).catch((error) => {
        this.historicalPromise = null;
        throw error;
      });
    }

    return this.historicalPromise;
  }

  async getAll(forceRefresh = false): Promise<RecruitmentGroup[]> {
    try {
      return await this.getAllPromise(forceRefresh);
    } catch (error) {
      console.error("[RecruitmentRepository.getAll] Failed", error);
      return [];
    }
  }

  async getAllHistorical(forceRefresh = false): Promise<RecruitmentGroup[]> {
    try {
      return await this.getAllHistoricalPromise(forceRefresh);
    } catch (error) {
      console.error("[RecruitmentRepository.getAllHistorical] Failed", error);
      return [];
    }
  }

  async getByUid(uid: string, forceRefresh = false): Promise<RecruitmentGroup | null> {
    const groups = await this.getAllHistorical(forceRefresh);
    return groups.find((group) => group.uid === uid) ?? null;
  }

  async getActive(now: Date, forceRefresh = false): Promise<RecruitmentGroup[]> {
    const nowTime = now.getTime();
    const groups = await this.getAll(forceRefresh);
    return groups.filter((group) => {
      const startAt = new Date(group.startAt).getTime();
      const endAt = group.endAt ? new Date(group.endAt).getTime() : null;
      return startAt <= nowTime && (endAt === null || endAt >= nowTime);
    });
  }

  async getByUids(uids: string[], forceRefresh = false): Promise<RecruitmentGroup[]> {
    if (uids.length === 0) {
      return [];
    }

    const uidSet = new Set(uids);
    const groups = await this.getAllHistorical(forceRefresh);
    return groups.filter((group) => uidSet.has(group.uid));
  }

  refresh(): Promise<RecruitmentGroup[]> {
    return this.getAllPromise(true);
  }

  async getPoolStudents(forceRefresh = false): Promise<RecruitmentPoolStudent[]> {
    return fetchCached(
      this.env,
      RECRUITMENT_POOL_STUDENTS_CACHE_KEY,
      async () => {
        const { data, error } = await runQuery(recruitmentPoolStudentsQuery, {});

        if (error || !data) {
          throw error ?? new Error("failed to fetch recruitment pool students");
        }

        return data.students;
      },
      RECRUITMENT_GROUPS_CACHE_TTL,
      forceRefresh,
    );
  }
}
