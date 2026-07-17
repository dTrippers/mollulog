import { getInstantTime, nowUtcIso, type UtcIsoString } from "~/lib/date-time";

export const PARAM_TO_RAID_TYPE: Record<string, string> = {
  "total-assault": "total_assault",
  "grand-assault": "elimination",
};

export const RAID_TYPE_TO_PARAM: Record<string, string> = {
  total_assault: "total-assault",
  elimination: "grand-assault",
};

/** URL path param (e.g. "total-assault") -> internal raidType (e.g. "total_assault") */
export function raidTypeFromParam(param: string): string {
  return PARAM_TO_RAID_TYPE[param] ?? param;
}

/** Internal raidType (e.g. "elimination") -> URL path param (e.g. "grand-assault") */
export function raidTypeToParam(raidType: string): string {
  return RAID_TYPE_TO_PARAM[raidType] ?? raidType;
}

type RaidSchedulePeriod = {
  raidType: string;
  startAt: UtcIsoString | Date | null;
  endAt: UtcIsoString | Date | null;
};

export function findCurrentOrClosestRaidSchedule<T extends RaidSchedulePeriod>(
  schedules: T[],
  raidType: string,
  now: UtcIsoString | Date = nowUtcIso(),
): T | null {
  const nowTime = getInstantTime(now);
  const candidates = schedules
    .filter((schedule) => schedule.raidType === raidType && schedule.startAt !== null)
    .map((schedule) => ({
      schedule,
      startTime: getInstantTime(schedule.startAt as UtcIsoString | Date),
      endTime: schedule.endAt === null ? null : getInstantTime(schedule.endAt),
    }))
    .filter(({ startTime, endTime }) => Number.isFinite(startTime) && (endTime === null || Number.isFinite(endTime)));

  const ongoing = candidates
    .filter(({ startTime, endTime }) => startTime <= nowTime && (endTime === null || nowTime < endTime))
    .sort((a, b) => b.startTime - a.startTime)[0];
  if (ongoing) {
    return ongoing.schedule;
  }

  const upcoming = candidates
    .filter(({ startTime }) => nowTime < startTime)
    .sort((a, b) => a.startTime - b.startTime)[0];
  if (upcoming) {
    return upcoming.schedule;
  }

  return (
    candidates
      .filter(({ startTime, endTime }) => (endTime ?? startTime) <= nowTime)
      .sort((a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime))[0]?.schedule ?? null
  );
}
