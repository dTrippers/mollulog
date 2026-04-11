import dayjs from "dayjs";
import { getAllRaidSchedules, getRaidSchedule, getRaidScheduleBySeasonIndex, raidTypeFromParam } from "~/models/raid";

export type RaidSchedule = NonNullable<Awaited<ReturnType<typeof getRaidSchedule>>>;
export type RaidScheduleListItem = Awaited<ReturnType<typeof getAllRaidSchedules>>[number];

type RaidLookupContent = {
  contentType: string;
  contentUid: string | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
};

type TimelineRaidRow = {
  uid: string;
  contentType: string;
  contentUid: string | null;
  startAt: Date;
  endAt: Date | null;
};

const LEGACY_RAID_TYPES = new Set(["total_assault", "elimination", "unlimit", "allied"]);

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

  async getUpcoming(forceRefresh = false) {
    const now = dayjs();
    const schedules = await this.getAll(forceRefresh);

    return schedules
      .filter((schedule) => schedule.endAt && dayjs(schedule.endAt).isAfter(now))
      .sort((a, b) => new Date(a.startAt as Date).getTime() - new Date(b.startAt as Date).getTime());
  }

  async getByTypeAndSeason(raidType: string, seasonIndex: number | string, forceRefresh = false) {
    const parsedSeasonIndex =
      typeof seasonIndex === "number" ? seasonIndex : Number.parseInt(String(seasonIndex), 10);
    if (Number.isNaN(parsedSeasonIndex)) {
      return null;
    }

    const schedule = await getRaidScheduleBySeasonIndex(this.env, "gl", parsedSeasonIndex, forceRefresh);
    if (!schedule) {
      return null;
    }

    return schedule.raidType === raidTypeFromParam(raidType) ? schedule : null;
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
    const row = await this.env.DB.prepare(
      `
        SELECT
          uid,
          content_type AS contentType,
          content_uid AS contentUid,
          start_at AS startAt,
          end_at AS endAt
        FROM timeline_contents
        WHERE content_uid = ?1
          AND content_type IN ('raid', 'total_assault', 'elimination', 'unlimit', 'allied')
        ORDER BY start_at DESC
        LIMIT 1
      `,
    )
      .bind(contentUid)
      .first<{ uid: string; contentType: string; contentUid: string | null; startAt: string; endAt: string | null }>();

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

  async findByLegacyContentUid(contentUid: string, forceRefresh = false): Promise<RaidSchedule | null> {
    const timelineRaid = await this.getTimelineRaidByContentUid(contentUid);
    if (!timelineRaid) {
      return null;
    }

    return this.findByContent(timelineRaid, forceRefresh);
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
