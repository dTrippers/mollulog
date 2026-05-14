import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { type UtcIsoString, compareInstantAsc, isInstantAfter, nowUtcIso, toUtcIso } from "~/lib/date-time";
import { fetchCached } from "./base";
import { getTimelineContentDatesByContentUids } from "./timeline-content";

export type Difficulty = "normal" | "hard" | "very_hard" | "hardcore" | "extreme" | "insane" | "torment" | "lunatic";
export type Boss =
  | "binah"
  | "chesed"
  | "hod"
  | "shirokuro"
  | "perorozilla"
  | "goz"
  | "hieronymus"
  | "kaiten-fx-mk0"
  | "gregorius"
  | "hovercraft"
  | "myouki-kurokage"
  | "geburah"
  | "yesod";
const ALL_RAID_SCHEDULES_CACHE_KEY = "raids::schedules::all::v2";

type RawRaidSchedule = NonNullable<Awaited<ReturnType<typeof runRaidScheduleDetailQuery>>>;

export type NormalizedRaidSchedule = Omit<RawRaidSchedule, "startAt" | "endAt" | "jpSchedule"> & {
  startAt: UtcIsoString | null;
  endAt: UtcIsoString | null;
  jpSchedule: RawRaidSchedule["jpSchedule"];
};

function normalizeRaidSchedule<T extends { startAt: Date | string | null; endAt: Date | string | null }>(
  schedule: T,
): Omit<T, "startAt" | "endAt"> & { startAt: UtcIsoString | null; endAt: UtcIsoString | null } {
  return {
    ...schedule,
    startAt: schedule.startAt ? toUtcIso(schedule.startAt) : null,
    endAt: schedule.endAt ? toUtcIso(schedule.endAt) : null,
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
      defenseTypes { defenseType difficulty }
      jpSchedule { uid seasonIndex }
    }
  }
`);

export function getRaidSchedule(env: Env, uid: string, forceRefresh = false) {
  return fetchCached(
    env,
    `raids::schedules::uid=${uid}`,
    async () => {
      const schedule = await runRaidScheduleDetailQuery(env, uid);
      return schedule ? normalizeRaidSchedule(schedule) : null;
    },
    24 * 60 * 60,
    forceRefresh,
  );
}

const raidScheduleBySeasonIndexQuery = graphql(`
  query RaidScheduleBySeasonIndex($region: String!, $seasonIndex: Int!) {
    raidScheduleBySeasonIndex(region: $region, seasonIndex: $seasonIndex) {
      uid raidType seasonIndex region terrain startAt endAt attackType
      raidBoss { uid name }
      defenseTypes { defenseType difficulty }
      jpSchedule { uid seasonIndex }
    }
  }
`);

export function getRaidScheduleBySeasonIndex(env: Env, region: string, seasonIndex: number, forceRefresh = false) {
  return fetchCached(
    env,
    `raids::schedules::region=${region}::seasonIndex=${seasonIndex}`,
    async () => {
      const { data, error } = await runQuery(raidScheduleBySeasonIndexQuery, { region, seasonIndex });
      if (error) {
        throw "failed to fetch raid schedule by season index";
      }
      return data?.raidScheduleBySeasonIndex ? normalizeRaidSchedule(data.raidScheduleBySeasonIndex) : null;
    },
    24 * 60 * 60,
    forceRefresh,
  );
}

const allRaidSchedulesQuery = graphql(`
  query AllRaidSchedules($region: String!, $endAfter: ISO8601DateTime) {
    raidSchedules(region: $region, endAfter: $endAfter) {
      nodes {
        uid raidType seasonIndex region terrain startAt endAt attackType
        raidBoss { uid name }
        defenseTypes { defenseType difficulty }
        jpSchedule { uid seasonIndex }
      }
    }
  }
`);
export function getAllRaidSchedules(env: Env, forceRefresh = false) {
  return fetchCached(
    env,
    ALL_RAID_SCHEDULES_CACHE_KEY,
    async () => {
      const { data, error } = await runQuery(allRaidSchedulesQuery, { region: "gl", endAfter: null });
      if (error || !data) {
        throw error ?? "failed to fetch raid schedules";
      }
      return data.raidSchedules.nodes.map(normalizeRaidSchedule);
    },
    24 * 60 * 60,
    forceRefresh,
  );
}

export async function getUpcomingRaidSchedules(env: Env, forceRefresh = false) {
  const now = nowUtcIso();
  const schedules = await getAllRaidSchedules(env, forceRefresh);
  return schedules
    .filter((schedule) => schedule.endAt && isInstantAfter(schedule.endAt, now))
    .sort((a, b) => compareInstantAsc(a.startAt ?? now, b.startAt ?? now));
}

export const ALL_TOTAL_ASSUALT_BOSS: Boss[] = [
  "binah",
  "chesed",
  "hod",
  "shirokuro",
  "perorozilla",
  "goz",
  "hieronymus",
  "kaiten-fx-mk0",
  "gregorius",
  "hovercraft",
  "myouki-kurokage",
  "geburah",
  "yesod",
];

const RAID_TIME_SCORE_PER_SECOND = {
  normal: 120,
  hard: 240,
  very_hard: 480,
  hardcore: 960,
  extreme: 1440,
  insane: 1920,
  torment: 2400,
  lunatic: 2880,
};

const RAID_DIFFICULTY_SCORE = {
  normal: 250000,
  hard: 500000,
  very_hard: 1000000,
  hardcore: 2000000,
  extreme: 4000000,
  insane: 6800000,
  torment: 12200000,
  lunatic: 17710000,
};

const RAID_HP_SCORE = {
  normal: { 180: 229000, 240: 277000, 270: 304700 },
  hard: { 180: 458000, 240: 554000, 270: 609400 },
  very_hard: { 180: 916000, 240: 1108000, 270: 1218800 },
  hardcore: { 180: 1832000, 240: 2216000, 270: 2437600 },
  extreme: { 180: 5392000, 240: 6160000, 270: 6578880 },
  insane: { 180: 12449600, 240: 14216000, 270: 14941016 },
  torment: { 180: 18876000, 240: 19508000, 270: 20302000 },
  lunatic: { 180: null, 240: 26315000, 270: 26954000 },
};

function timeForBoss(boss: Boss): 180 | 240 | 270 {
  if (boss === "yesod") return 270;
  if (boss === "binah" || boss === "kaiten-fx-mk0") return 180;
  return 240;
}

export function timeToScore(boss: Boss, difficulty: Difficulty, clearTimeMillisec: number): number {
  if (clearTimeMillisec < 0 || clearTimeMillisec > 3600000) {
    throw new Error("소요 시간은 0 ~ 60분 사이여야 해요");
  }

  const timePerBoss = timeForBoss(boss);
  const hpScore = RAID_HP_SCORE[difficulty][timePerBoss];
  if (hpScore === null) {
    throw new Error("선택한 보스는 아직 해당 난이도가 개최되지 않았어요");
  }

  const difficultyScore = RAID_DIFFICULTY_SCORE[difficulty];
  const timeScore = ((3600000 - clearTimeMillisec) / 1000) * RAID_TIME_SCORE_PER_SECOND[difficulty];
  return Math.round(difficultyScore + hpScore + timeScore);
}

export function scoreToDifficultyAndTime(
  boss: Boss,
  score: number,
): { difficulty: Difficulty; clearTimeMillisec: number } {
  const timePerBoss = timeForBoss(boss);
  const difficulties: Difficulty[] = [
    "normal",
    "hard",
    "very_hard",
    "hardcore",
    "extreme",
    "insane",
    "torment",
    "lunatic",
  ];

  // Try each difficulty from highest to lowest
  for (let i = difficulties.length - 1; i >= 0; i--) {
    const difficulty = difficulties[i];
    const hpScore = RAID_HP_SCORE[difficulty][timePerBoss];
    if (hpScore === null) {
      continue;
    }

    const difficultyScore = RAID_DIFFICULTY_SCORE[difficulty];
    const timeScore = score - difficultyScore - hpScore;

    const clearTimeMillisec = Math.round(3600000 - (timeScore * 1000) / RAID_TIME_SCORE_PER_SECOND[difficulty]);
    if (clearTimeMillisec >= 0 && clearTimeMillisec <= 3600000) {
      return { difficulty, clearTimeMillisec };
    }
  }

  throw new Error("유효하지 않은 점수에요");
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

// ============================================================
// URL param ↔ internal raidType conversion
// ============================================================

const PARAM_TO_RAID_TYPE: Record<string, string> = {
  "total-assault": "total_assault",
  "grand-assault": "elimination",
};

const RAID_TYPE_TO_PARAM: Record<string, string> = {
  total_assault: "total-assault",
  elimination: "grand-assault",
};

/** URL path param (e.g. "total-assault") → internal raidType (e.g. "total_assault") */
export function raidTypeFromParam(param: string): string {
  return PARAM_TO_RAID_TYPE[param] ?? param;
}

/** Internal raidType (e.g. "elimination") → URL path param (e.g. "grand-assault") */
export function raidTypeToParam(raidType: string): string {
  return RAID_TYPE_TO_PARAM[raidType] ?? raidType;
}
