import dayjs from "dayjs";
import { RaidScheduleVideosDocument, type RaidScheduleVideosQueryVariables } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { getAllRaidSchedules, getRaidSchedule, raidTypeFromParam } from "~/models/raid";

export type RaidSchedule = NonNullable<Awaited<ReturnType<typeof getRaidSchedule>>>;
export type RaidScheduleListItem = Awaited<ReturnType<typeof getAllRaidSchedules>>[number];
export type RaidVideoItem = {
  id: string;
  title: string;
  score: number;
  youtubeId: string;
  thumbnailUrl: string;
  publishedAt: string;
};
export type RaidVideosData = {
  videos: RaidVideoItem[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
} | null;

type RaidVideosQueryOptions = Partial<Pick<RaidScheduleVideosQueryVariables, "first" | "after" | "sort">>;

export class RaidRepository {
  private allPromise: Promise<RaidScheduleListItem[]> | null = null;
  private refreshPromise: Promise<RaidScheduleListItem[]> | null = null;

  constructor(private env: Env) {}

  private async fetchAll(forceRefresh = false) {
    return getAllRaidSchedules(this.env, forceRefresh);
  }

  private getAllPromise(forceRefresh = false): Promise<RaidScheduleListItem[]> {
    if (forceRefresh) {
      if (!this.refreshPromise) {
        this.refreshPromise = this.fetchAll(true)
          .then((schedules) => {
            this.allPromise = Promise.resolve(schedules);
            return schedules;
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

  getAll(forceRefresh = false) {
    return this.getAllPromise(forceRefresh);
  }

  getSchedule(uid: string, forceRefresh = false) {
    return getRaidSchedule(this.env, uid, forceRefresh);
  }

  async findSummaryByTypeAndSeason(raidType: string, seasonIndex: number | string, forceRefresh = false) {
    const parsedSeasonIndex =
      typeof seasonIndex === "number" ? seasonIndex : Number.parseInt(String(seasonIndex), 10);
    if (Number.isNaN(parsedSeasonIndex)) {
      return null;
    }

    const normalizedRaidType = raidTypeFromParam(raidType);
    const schedules = await this.getAll(forceRefresh);

    return (
      schedules.find(
        (schedule) => schedule.raidType === normalizedRaidType && schedule.seasonIndex === parsedSeasonIndex,
      ) ?? null
    );
  }

  async getUpcoming(forceRefresh = false) {
    const now = dayjs();
    const schedules = await this.getAll(forceRefresh);

    return schedules
      .filter((schedule) => schedule.endAt && dayjs(schedule.endAt).isAfter(now))
      .sort((a, b) => new Date(a.startAt as Date).getTime() - new Date(b.startAt as Date).getTime());
  }

  async getByTypeAndSeason(raidType: string, seasonIndex: number | string, forceRefresh = false) {
    const summary = await this.findSummaryByTypeAndSeason(raidType, seasonIndex, forceRefresh);
    if (!summary) {
      return null;
    }

    return this.getSchedule(summary.uid, forceRefresh);
  }

  async findByTypeAndJpSeason(raidType: string, jpSeasonIndex: number, forceRefresh = false) {
    const normalizedRaidType = raidTypeFromParam(raidType);
    const schedules = await this.getAll(forceRefresh);

    return (
      schedules.find(
        (schedule) => schedule.raidType === normalizedRaidType && schedule.jpSchedule?.seasonIndex === jpSeasonIndex,
      ) ?? null
    );
  }

  async getVideos(uid: string, { first, after, sort }: RaidVideosQueryOptions = {}): Promise<RaidVideosData> {
    const { data, error } = await runQuery(RaidScheduleVideosDocument, { uid, first, after, sort });
    if (error || !data) {
      throw error ?? new Error("failed to fetch raid videos");
    }

    const videosConnection = data.raidSchedule?.videos;
    if (!videosConnection) {
      return null;
    }

    return {
      videos: videosConnection.edges.flatMap((edge) => {
        const node = edge.node;
        if (!node) {
          return [];
        }

        return {
          id: node.id ?? "",
          title: node.title ?? "",
          score: node.score ?? 0,
          youtubeId: node.youtubeId ?? "",
          thumbnailUrl: node.thumbnailUrl ?? "",
          publishedAt: node.publishedAt instanceof Date ? node.publishedAt.toISOString() : String(node.publishedAt ?? ""),
        } satisfies RaidVideoItem;
      }),
      pageInfo: videosConnection.pageInfo,
    };
  }

  async refresh() {
    const now = dayjs();
    const schedules = await this.getAll(true);

    await Promise.all(
      schedules
        .filter((schedule) => schedule.endAt && dayjs(schedule.endAt).isAfter(now))
        .map((schedule) => this.getSchedule(schedule.uid, true)),
    );

    return schedules;
  }
}
