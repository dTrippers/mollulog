import type { UtcIsoString } from "~/lib/date-time";
import { getTimelineContentDatesByContentUids } from "~/models/timeline-content.server";

/** Falls back to timeline_contents when BAQL raid dates are incomplete. */
export async function applyTimelineDateFallback<
  T extends { uid: string; startAt: UtcIsoString | null; endAt: UtcIsoString | null },
>(env: Env, schedules: T[], ctx?: ExecutionContext): Promise<T[]> {
  const nullDateSchedules = schedules.filter((schedule) => !schedule.startAt || !schedule.endAt);
  if (nullDateSchedules.length === 0) return schedules;

  const timelineDatesMap = await getTimelineContentDatesByContentUids(
    env,
    nullDateSchedules.map((schedule) => schedule.uid),
    { ctx },
  );

  return schedules.map((schedule) => {
    if (schedule.startAt && schedule.endAt) return schedule;
    const dates = timelineDatesMap.get(schedule.uid);
    return {
      ...schedule,
      startAt: schedule.startAt ?? dates?.startAt ?? null,
      endAt: schedule.endAt ?? dates?.endAt ?? null,
    };
  });
}
