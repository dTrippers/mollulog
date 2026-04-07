import dayjs from "dayjs";
import { getAllRaidSchedules, getRaidSchedule, getUpcomingRaidSchedules } from "~/models/raid";

export type RaidSchedule = NonNullable<Awaited<ReturnType<typeof getRaidSchedule>>>;
export type RaidScheduleListItem = Awaited<ReturnType<typeof getAllRaidSchedules>>[number];

export class RaidRepository {
  constructor(private env: Env) {}

  getAll(forceRefresh = false) {
    return getAllRaidSchedules(this.env, forceRefresh);
  }

  getSchedule(uid: string, forceRefresh = false) {
    return getRaidSchedule(this.env, uid, forceRefresh);
  }

  getUpcoming(forceRefresh = false) {
    return getUpcomingRaidSchedules(this.env, forceRefresh);
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
