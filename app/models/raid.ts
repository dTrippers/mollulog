import { graphql } from "~/graphql";
import type { Defense, Difficulty as GraphqlDifficulty } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, cacheQuery, fetchSourceCached } from "~/lib/cache";
import { type UtcIsoString, compareInstantAsc, isInstantAfter, nowUtcIso, toUtcIso } from "~/lib/date-time";
import { getTimelineContentDatesByContentUids } from "./timeline-content";

const ALL_RAID_SCHEDULES_CACHE_KEY = cacheKey("source", "raid-schedule", 1, cacheQuery({ region: "gl" }));

type RawRaidSchedule = NonNullable<Awaited<ReturnType<typeof runRaidScheduleDetailQuery>>>;
type RawRaidJpSchedule = NonNullable<RawRaidSchedule["jpSchedule"]>;
type NormalizedRaidJpSchedule = Omit<RawRaidJpSchedule, "startAt"> & {
  startAt: UtcIsoString | null;
};

export type RaidDefenseTypeSet = {
  difficulty: GraphqlDifficulty | null;
  defenseTypes: Defense[];
  primaryDefenseType: Defense;
  secondaryDefenseTypes: Defense[];
};

export type RaidDefenseType = {
  defenseType: Defense;
  difficulty: GraphqlDifficulty | null;
  primary: boolean;
  setIndex: number;
};

export function getRaidDefenseTypeSetKey(defenseTypeSet: {
  difficulty: string | null;
  defenseTypes: readonly Defense[];
}) {
  return `${defenseTypeSet.difficulty ?? "none"}:${defenseTypeSet.defenseTypes.join(",")}`;
}

export type NormalizedRaidSchedule = Omit<RawRaidSchedule, "startAt" | "endAt" | "jpSchedule" | "defenseTypeSets"> & {
  startAt: UtcIsoString | null;
  endAt: UtcIsoString | null;
  jpSchedule: NormalizedRaidJpSchedule | null;
  defenseTypeSets: RaidDefenseTypeSet[];
  defenseTypes: RaidDefenseType[];
};

function normalizeDefenseTypeSets(
  defenseTypeSets: { difficulty: GraphqlDifficulty | null; defenseTypes: readonly Defense[] }[],
): RaidDefenseTypeSet[] {
  return defenseTypeSets.flatMap(({ difficulty, defenseTypes }) => {
    const [primaryDefenseType, ...secondaryDefenseTypes] = defenseTypes;
    if (!primaryDefenseType) {
      return [];
    }
    return [
      {
        difficulty,
        defenseTypes: [...defenseTypes],
        primaryDefenseType,
        secondaryDefenseTypes,
      },
    ];
  });
}

function flattenDefenseTypeSets(defenseTypeSets: RaidDefenseTypeSet[]): RaidDefenseType[] {
  return defenseTypeSets.flatMap(({ difficulty, defenseTypes }, setIndex) =>
    defenseTypes.map((defenseType, defenseTypeIndex) => ({
      defenseType,
      difficulty,
      primary: defenseTypeIndex === 0,
      setIndex,
    })),
  );
}

function normalizeRaidSchedule<
  T extends {
    startAt: Date | string | null;
    endAt: Date | string | null;
    jpSchedule: ({ startAt: Date | string | null } & RawRaidJpSchedule) | null;
    defenseTypeSets: { difficulty: GraphqlDifficulty | null; defenseTypes: Defense[] }[];
  },
>(
  schedule: T,
): Omit<T, "startAt" | "endAt" | "jpSchedule" | "defenseTypeSets"> & {
  startAt: UtcIsoString | null;
  endAt: UtcIsoString | null;
  jpSchedule: NormalizedRaidJpSchedule | null;
  defenseTypeSets: RaidDefenseTypeSet[];
  defenseTypes: RaidDefenseType[];
} {
  const defenseTypeSets = normalizeDefenseTypeSets(schedule.defenseTypeSets);
  return {
    ...schedule,
    startAt: schedule.startAt ? toUtcIso(schedule.startAt) : null,
    endAt: schedule.endAt ? toUtcIso(schedule.endAt) : null,
    jpSchedule: schedule.jpSchedule
      ? {
          ...schedule.jpSchedule,
          startAt: schedule.jpSchedule.startAt ? toUtcIso(schedule.jpSchedule.startAt) : null,
        }
      : null,
    defenseTypeSets,
    defenseTypes: flattenDefenseTypeSets(defenseTypeSets),
  };
}

async function runRaidScheduleDetailQuery(env: Env, uid: string) {
  const { data, error } = await runQuery(raidScheduleDetailQuery, { uid });
  if (error) {
    throw "failed to fetch raid schedule";
  }
  return data?.raidSchedule ?? null;
}

// ============================================================
// RaidSchedule (new API)
// ============================================================

const raidScheduleDetailQuery = graphql(`
  query RaidScheduleDetail($uid: String!) {
    raidSchedule(uid: $uid) {
      uid raidType seasonIndex region terrain startAt endAt attackType
      raidBoss { uid name }
      defenseTypeSets { difficulty defenseTypes }
      jpSchedule { uid seasonIndex startAt }
    }
  }
`);

export function getRaidSchedule(env: Env, uid: string, forceRefresh = false) {
  return fetchSourceCached(
    env,
    cacheKey("source", "raid-schedule", 1, cacheQuery({ uid })),
    async () => {
      const schedule = await runRaidScheduleDetailQuery(env, uid);
      return schedule ? normalizeRaidSchedule(schedule) : null;
    },
    forceRefresh,
  );
}

const allRaidSchedulesQuery = graphql(`
  query AllRaidSchedules($region: String!, $endAfter: ISO8601DateTime, $raidType: String) {
    raidSchedules(region: $region, endAfter: $endAfter, raidType: $raidType) {
      nodes {
        uid raidType seasonIndex region terrain startAt endAt attackType
        raidBoss { uid name }
        defenseTypeSets { difficulty defenseTypes }
        jpSchedule { uid seasonIndex startAt }
      }
    }
  }
`);

function allRaidSchedulesCacheKey(raidType: string | null) {
  if (!raidType) {
    return ALL_RAID_SCHEDULES_CACHE_KEY;
  }

  return cacheKey("source", "raid-schedule", 1, cacheQuery({ region: "gl", raidType }));
}

export function getAllRaidSchedules(
  env: Env,
  forceRefresh = false,
  { raidType = null }: { raidType?: string | null } = {},
) {
  return fetchSourceCached(
    env,
    allRaidSchedulesCacheKey(raidType),
    async () => {
      const { data, error } = await runQuery(allRaidSchedulesQuery, { region: "gl", endAfter: null, raidType });
      if (error || !data) {
        throw error ?? "failed to fetch raid schedules";
      }
      return data.raidSchedules.nodes.map(normalizeRaidSchedule);
    },
    forceRefresh,
  );
}

export type RaidSchedule = NonNullable<Awaited<ReturnType<typeof getRaidSchedule>>>;
export type RaidScheduleListItem = Awaited<ReturnType<typeof getAllRaidSchedules>>[number];

export async function getUpcomingRaidSchedules(env: Env, forceRefresh = false) {
  const now = nowUtcIso();
  const schedules = await getAllRaidSchedules(env, forceRefresh);
  return schedules
    .filter((schedule) => schedule.endAt && isInstantAfter(schedule.endAt, now))
    .sort((a, b) => compareInstantAsc(a.startAt ?? now, b.startAt ?? now));
}

export async function findRaidScheduleSummaryByTypeAndSeason(
  env: Env,
  raidType: string,
  seasonIndex: number | string,
  forceRefresh = false,
) {
  const parsedSeasonIndex = typeof seasonIndex === "number" ? seasonIndex : Number.parseInt(String(seasonIndex), 10);
  if (Number.isNaN(parsedSeasonIndex)) {
    return null;
  }

  const schedules = await getAllRaidSchedules(env, forceRefresh);
  return (
    schedules.find((schedule) => schedule.raidType === raidType && schedule.seasonIndex === parsedSeasonIndex) ?? null
  );
}

export async function getRaidScheduleByTypeAndSeason(
  env: Env,
  raidType: string,
  seasonIndex: number | string,
  forceRefresh = false,
) {
  const summary = await findRaidScheduleSummaryByTypeAndSeason(env, raidType, seasonIndex, forceRefresh);
  if (!summary) {
    return null;
  }

  return getRaidSchedule(env, summary.uid, forceRefresh);
}

export async function findRaidScheduleSummaryByTypeAndJpSeason(
  env: Env,
  raidType: string,
  jpSeasonIndex: number,
  forceRefresh = false,
) {
  const schedules = await getAllRaidSchedules(env, forceRefresh);
  return (
    schedules.find(
      (schedule) => schedule.raidType === raidType && schedule.jpSchedule?.seasonIndex === jpSeasonIndex,
    ) ?? null
  );
}

export async function warmRaidCache(env: Env, forceRefresh = true) {
  const now = nowUtcIso();
  const schedules = await getAllRaidSchedules(env, forceRefresh);

  await Promise.all(
    schedules
      .filter((schedule) => schedule.endAt && isInstantAfter(schedule.endAt, now))
      .map((schedule) => getRaidSchedule(env, schedule.uid, forceRefresh)),
  );

  return schedules;
}

// ============================================================
// Timeline date fallback
// ============================================================

/**
 * Falls back to dates from timeline_contents when RaidSchedule startAt/endAt is null.
 */
export async function applyTimelineDateFallback<
  T extends { uid: string; startAt: UtcIsoString | null; endAt: UtcIsoString | null },
>(env: Env, schedules: T[]): Promise<T[]> {
  const nullDateSchedules = schedules.filter((s) => !s.startAt || !s.endAt);
  if (nullDateSchedules.length === 0) return schedules;

  const timelineDatesMap = await getTimelineContentDatesByContentUids(
    env,
    nullDateSchedules.map((s) => s.uid),
  );

  return schedules.map((s) => {
    if (s.startAt && s.endAt) return s;
    const dates = timelineDatesMap.get(s.uid);
    return {
      ...s,
      startAt: s.startAt ?? dates?.startAt ?? null,
      endAt: s.endAt ?? dates?.endAt ?? null,
    };
  });
}
