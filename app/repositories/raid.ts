import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import dayjs from "dayjs";
import { RaidScheduleVideosDocument, type RaidScheduleVideosQueryVariables } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { getAllRaidSchedules, getRaidSchedule, raidTypeFromParam } from "~/models/raid";
import { timelineContentsTable } from "~/models/timeline-content";

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

type RaidLookupContent = {
  contentType: string;
  contentUid: string | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
};

type RaidVideosQueryOptions = Partial<Pick<RaidScheduleVideosQueryVariables, "first" | "after" | "sort">>;

type TimelineRaidRow = {
  uid: string;
  contentType: string;
  contentUid: string | null;
  startAt: Date;
  endAt: Date | null;
};

const LEGACY_RAID_TYPES = new Set(["total_assault", "elimination", "unlimit", "allied"]);
const TIMELINE_RAID_CONTENT_TYPES = ["raid", "total_assault", "elimination", "unlimit", "allied"] as const;

function toTimestamp(value: Date | string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

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

  private findMatchingSchedule(
    schedules: RaidScheduleListItem[],
    content: RaidLookupContent,
  ): RaidScheduleListItem | null {
    const normalizedRaidType = raidTypeFromParam(content.contentType);
    const startAt = toTimestamp(content.startAt);
    const endAt = toTimestamp(content.endAt);
    const candidates = schedules.filter((schedule) => schedule.raidType === normalizedRaidType);

    return (
      candidates.find(
        (schedule) => toTimestamp(schedule.startAt) === startAt && toTimestamp(schedule.endAt) === endAt,
      ) ??
      candidates.find((schedule) => startAt !== null && toTimestamp(schedule.startAt) === startAt) ??
      candidates.find((schedule) => endAt !== null && toTimestamp(schedule.endAt) === endAt) ??
      null
    );
  }

  async findSummaryByContent(content: RaidLookupContent, forceRefresh = false): Promise<RaidScheduleListItem | null> {
    if (content.contentType === "raid") {
      if (!content.contentUid) {
        return null;
      }

      const schedules = await this.getAll(forceRefresh);
      return schedules.find((schedule) => schedule.uid === content.contentUid) ?? null;
    }

    if (!LEGACY_RAID_TYPES.has(content.contentType)) {
      return null;
    }

    if (content.contentUid) {
      const schedules = await this.getAll(forceRefresh);
      const directMatch = schedules.find((schedule) => schedule.uid === content.contentUid);
      if (directMatch) {
        return directMatch;
      }

      return this.findMatchingSchedule(schedules, content);
    }

    const schedules = await this.getAll(forceRefresh);
    return this.findMatchingSchedule(schedules, content);
  }

  async findByContent(content: RaidLookupContent, forceRefresh = false): Promise<RaidSchedule | null> {
    const summary = await this.findSummaryByContent(content, forceRefresh);
    if (!summary) {
      return null;
    }

    return this.getSchedule(summary.uid, forceRefresh);
  }

  private async getTimelineRaidByContentUid(contentUid: string): Promise<TimelineRaidRow | null> {
    const db = drizzle(this.env.DB);
    const row = await db
      .select({
        uid: timelineContentsTable.uid,
        contentType: timelineContentsTable.contentType,
        contentUid: timelineContentsTable.contentUid,
        startAt: timelineContentsTable.startAt,
        endAt: timelineContentsTable.endAt,
      })
      .from(timelineContentsTable)
      .where(
        and(
          eq(timelineContentsTable.contentUid, contentUid),
          inArray(timelineContentsTable.contentType, TIMELINE_RAID_CONTENT_TYPES),
        ),
      )
      .orderBy(desc(timelineContentsTable.startAt))
      .limit(1)
      .get();

    if (!row) {
      return null;
    }

    return {
      uid: row.uid,
      contentType: row.contentType,
      contentUid: row.contentUid,
      startAt: new Date(row.startAt),
      endAt: row.endAt ? new Date(row.endAt) : null,
    };
  }

  async findSummaryByLegacyContentUid(contentUid: string, forceRefresh = false): Promise<RaidScheduleListItem | null> {
    const timelineRaid = await this.getTimelineRaidByContentUid(contentUid);
    if (!timelineRaid) {
      return null;
    }

    return this.findSummaryByContent(timelineRaid, forceRefresh);
  }

  async findByLegacyContentUid(contentUid: string, forceRefresh = false): Promise<RaidSchedule | null> {
    const summary = await this.findSummaryByLegacyContentUid(contentUid, forceRefresh);
    if (!summary) {
      return null;
    }

    return this.getSchedule(summary.uid, forceRefresh);
  }

  async findSummaryByPartyReference(
    reference: { raidType: string | null; seasonIndex: number | null; legacyRaidContentUid?: string | null },
    forceRefresh = false,
  ): Promise<RaidScheduleListItem | null> {
    if (reference.raidType && reference.seasonIndex !== null) {
      return this.findSummaryByTypeAndSeason(reference.raidType, reference.seasonIndex, forceRefresh);
    }

    if (reference.legacyRaidContentUid) {
      return this.findSummaryByLegacyContentUid(reference.legacyRaidContentUid, forceRefresh);
    }

    return null;
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
