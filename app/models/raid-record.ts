import {
  applyPostgresRaidRecordChartScore,
  countPostgresRaidRecords,
  createPostgresRaidRecord,
  deletePostgresRaidRecord,
  getPostgresRaidRecordBySeason,
  getPostgresRaidRecordByUid,
  listPostgresRaidRecords,
  type PostgresRaidRecordOptions,
  type RaidRecordBatchRow,
  type RaidRecordChartScoreResult,
  type RaidRecordSeasonKey,
  type RaidRecordValues,
  savePostgresRaidRecordsBatch,
  updatePostgresRaidRecord,
} from "~/db/postgres/raid-records";
import {
  getRaidRankConfirmAt,
  InvalidRaidRecordError,
  isRaidRecordDefenseType,
  type RaidRecord,
  type RaidRecordDefenseType,
  type RaidRecordParty,
  type RaidRecordRaidType,
  type RaidRecordScoreMode,
  type RaidRecordSeasonRules,
  type RaidRecordServer,
  type RaidRecordSnapshot,
  type RaidRecordStudentInfo,
  RAID_RECORD_SNAPSHOT_FIELDS,
  raidRecordServerRegion,
} from "~/domain/raid-record";
import { compareInstantDesc, nowUtcIso, type UtcIsoString } from "~/lib/date-time";
import { getAllRaidSchedules, type RaidScheduleListItem } from "~/models/raid";
import { getNumberedKoreanRaidSchedules } from "~/models/raid-season.server";
import { getRecruitedStudents, type RecruitedStudent } from "~/models/recruited-student";
import { getAllStudents, getStudentGrowthVisualsBatch, getStudentWeaponAvailability } from "~/models/student";

export {
  RaidRecordBatchStaleError,
  RaidRecordSeasonConflictError,
} from "~/db/postgres/raid-records";
export type { RaidRecordSeasonKey } from "~/db/postgres/raid-records";

// One season a record can belong to, on one server.
export type RaidRecordSeason = {
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
  seasonIndex: number;
  boss: { uid: string; name: string };
  terrain: RaidScheduleListItem["terrain"];
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  // The defense types shown with the season, such as 특수장갑 · 경장갑 of a total_assault set.
  displayDefenseTypes: RaidRecordDefenseType[];
  // The defense types that take a score, in BAQL order, with each one's top difficulty.
  scoreDefenseTypes: RaidRecordSeasonRules["defenseTypes"];
  // The matching season on the other server: the Korean one for a Japanese season, and the other way round.
  counterpartSeasonIndex: number | null;
  rankConfirmAt: UtcIsoString | null;
};

function toScoreDefenseTypes(schedule: RaidScheduleListItem): RaidRecordSeasonRules["defenseTypes"] {
  const sets = schedule.raidType === "total_assault" ? schedule.defenseTypeSets.slice(0, 1) : schedule.defenseTypeSets;
  return sets.flatMap((set) =>
    isRaidRecordDefenseType(set.primaryDefenseType)
      ? [{ defenseType: set.primaryDefenseType, maxDifficulty: set.difficulty ?? null }]
      : [],
  );
}

function toRecordSeason(
  server: RaidRecordServer,
  schedule: RaidScheduleListItem,
  counterpartSeasonIndex: number | null,
): RaidRecordSeason | null {
  if (schedule.raidType !== "total_assault" && schedule.raidType !== "elimination") return null;
  if (!schedule.startAt) return null;
  const displayDefenseTypes = [
    ...new Set(schedule.defenseTypeSets.flatMap((set) => set.defenseTypes).filter(isRaidRecordDefenseType)),
  ];
  return {
    server,
    raidType: schedule.raidType,
    seasonIndex: schedule.seasonIndex,
    boss: { uid: schedule.raidBoss.uid, name: schedule.raidBoss.name },
    terrain: schedule.terrain,
    startAt: schedule.startAt,
    endAt: schedule.endAt,
    displayDefenseTypes,
    scoreDefenseTypes: toScoreDefenseTypes(schedule),
    counterpartSeasonIndex,
    rankConfirmAt: schedule.endAt ? getRaidRankConfirmAt(schedule.endAt) : null,
  };
}

// Every 총력전 and 대결전 season of the server that has a start time, newest first. Seasons that have not started yet
// are included; the screens filter them with `isRaidSeasonStarted`.
//
// A record is keyed by its server, raid type and season number, so the seasons are BAQL's own: a Korean season is a
// `gl` schedule, never a forecast season whose number is only predicted. `forecastCounterparts` lets a screen show a JP
// season's Korean number from a numbered forecast season as well; that number is display only and is never stored.
export async function getRaidRecordSeasons(
  env: Env,
  server: RaidRecordServer,
  { forecastCounterparts = false }: { forecastCounterparts?: boolean } = {},
): Promise<RaidRecordSeason[]> {
  const [schedules, krSchedules] = await Promise.all([
    getAllRaidSchedules(env, false, { region: raidRecordServerRegion(server) }),
    server === "jp"
      ? forecastCounterparts
        ? getNumberedKoreanRaidSchedules(env)
        : getAllRaidSchedules(env)
      : Promise.resolve(null),
  ]);
  const krSeasonByJpSeason = new Map<string, number>();
  for (const schedule of krSchedules ?? []) {
    if (schedule.jpSchedule) {
      krSeasonByJpSeason.set(`${schedule.raidType}:${schedule.jpSchedule.seasonIndex}`, schedule.seasonIndex);
    }
  }
  return schedules
    .flatMap((schedule) => {
      const counterpart =
        server === "kr"
          ? (schedule.jpSchedule?.seasonIndex ?? null)
          : (krSeasonByJpSeason.get(`${schedule.raidType}:${schedule.seasonIndex}`) ?? null);
      const season = toRecordSeason(server, schedule, counterpart);
      return season ? [season] : [];
    })
    .sort((left, right) => compareInstantDesc(left.startAt, right.startAt));
}

export function raidRecordSeasonRules(season: RaidRecordSeason): RaidRecordSeasonRules {
  return { raidType: season.raidType, defenseTypes: season.scoreDefenseTypes };
}

// ---------------------------------------------------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------------------------------------------------

export function listRaidRecords(env: Env, userId: number, options?: PostgresRaidRecordOptions) {
  return listPostgresRaidRecords(env, userId, options);
}

export function countRaidRecords(env: Env, userId: number, options?: PostgresRaidRecordOptions) {
  return countPostgresRaidRecords(env, userId, options);
}

export function getRaidRecord(env: Env, userId: number, uid: string, options?: PostgresRaidRecordOptions) {
  return getPostgresRaidRecordByUid(env, userId, uid, options);
}

export function getRaidRecordBySeason(
  env: Env,
  userId: number,
  key: RaidRecordSeasonKey,
  options?: PostgresRaidRecordOptions,
) {
  return getPostgresRaidRecordBySeason(env, userId, key, options);
}

export type RaidRecordFormValues = {
  scoreMode: RaidRecordScoreMode;
  scores: { defenseType: RaidRecordDefenseType; score: number }[];
  totalScore: number | null;
  rank: number;
  memo: string;
  parties: RaidRecordParty[];
};

// The edit form shows the rank it saves; saving it is the Sensei confirming that rank, so the rank time is now.
function toFormRecordValues(values: RaidRecordFormValues): RaidRecordValues {
  return {
    scoreMode: values.scoreMode,
    scores: values.scores,
    totalScore: values.totalScore,
    rank: values.rank,
    rankRecordedAt: nowUtcIso(),
    memo: values.memo,
    parties: values.parties,
  };
}

export async function createRaidRecord(
  env: Env,
  userId: number,
  season: RaidRecordSeason,
  values: RaidRecordFormValues,
  options?: PostgresRaidRecordOptions,
): Promise<RaidRecord> {
  return createPostgresRaidRecord(
    env,
    userId,
    { server: season.server, raidType: season.raidType, seasonIndex: season.seasonIndex },
    toFormRecordValues(values),
    options,
  );
}

export async function updateRaidRecord(
  env: Env,
  userId: number,
  uid: string,
  values: RaidRecordFormValues,
  options?: PostgresRaidRecordOptions,
): Promise<RaidRecord | null> {
  return updatePostgresRaidRecord(env, userId, uid, toFormRecordValues(values), options);
}

export function deleteRaidRecord(env: Env, userId: number, uid: string, options?: PostgresRaidRecordOptions) {
  return deletePostgresRaidRecord(env, userId, uid, options);
}

// "순위 확정하기": the rank the Sensei checked in the game after the confirmation time.
export function confirmRaidRecordRank(
  env: Env,
  userId: number,
  uid: string,
  rank: number,
  options?: PostgresRaidRecordOptions,
) {
  return updatePostgresRaidRecord(env, userId, uid, { rank, rankRecordedAt: nowUtcIso() }, options);
}

export type RaidRecordTableRowInput = {
  season: RaidRecordSeason;
  // The record the table showed for the season, or null for a season it showed empty.
  current: RaidRecord | null;
  scoreMode: RaidRecordScoreMode;
  scores: { defenseType: RaidRecordDefenseType; score: number }[];
  totalScore: number | null;
  rank: number;
};

// Saves the rows the table changed, all or none. A row keeps its rank time unless its rank changed, so editing only a
// score does not confirm a 잠정 rank.
export async function saveRaidRecordTable(
  env: Env,
  userId: number,
  rows: readonly RaidRecordTableRowInput[],
  options?: PostgresRaidRecordOptions,
): Promise<void> {
  const now = nowUtcIso();
  const batch = rows.map((row): RaidRecordBatchRow => {
    const rankChanged = row.current === null || row.current.rank !== row.rank || row.current.rankRecordedAt === null;
    return {
      key: { server: row.season.server, raidType: row.season.raidType, seasonIndex: row.season.seasonIndex },
      current: row.current ? { uid: row.current.uid, updatedAt: row.current.updatedAt } : null,
      values: {
        scoreMode: row.scoreMode,
        scores: row.scores,
        totalScore: row.totalScore,
        rank: row.rank,
        rankRecordedAt: rankChanged ? now : row.current?.rankRecordedAt ?? now,
      },
    };
  });
  await savePostgresRaidRecordsBatch(env, userId, batch, options);
}

export async function applyRaidRecordChartScore(
  env: Env,
  userId: number,
  season: RaidRecordSeason,
  defenseType: RaidRecordDefenseType,
  score: number | null,
  options?: PostgresRaidRecordOptions,
): Promise<RaidRecordChartScoreResult> {
  if (!season.scoreDefenseTypes.some((entry) => entry.defenseType === defenseType)) {
    throw new InvalidRaidRecordError("이 시즌에 없는 방어 타입의 점수예요.");
  }
  const key = { server: season.server, raidType: season.raidType, seasonIndex: season.seasonIndex };
  if (score === null) {
    return applyPostgresRaidRecordChartScore(env, userId, key, { defenseType, score: null }, options);
  }
  return applyPostgresRaidRecordChartScore(env, userId, key, { defenseType, score }, options);
}

// ---------------------------------------------------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The students a submitted party list holds a favorite item or a weapon level for. Only those need the catalog checks
// that cost a request each; the shape itself is checked by parseRaidRecordParties.
function studentUidsNeedingAvailability(rawParties: unknown): { gear: string[]; weapon: string[] } {
  const gear = new Set<string>();
  const weapon = new Set<string>();
  if (!Array.isArray(rawParties)) return { gear: [], weapon: [] };
  for (const party of rawParties) {
    if (!isObject(party) || !Array.isArray(party.units)) continue;
    for (const unit of party.units) {
      if (!isObject(unit) || typeof unit.studentUid !== "string" || !isObject(unit.snapshot)) continue;
      const { equipSpecial, weaponLevel } = unit.snapshot;
      if (equipSpecial !== undefined && equipSpecial !== null) gear.add(unit.studentUid);
      if (typeof weaponLevel === "number" && weaponLevel > 0) weapon.add(unit.studentUid);
    }
  }
  return { gear: [...gear], weapon: [...weapon] };
}

// What the catalog says about every student a party can hold, for validating submitted parties. Unreleased students are
// included, since a Japanese server record can hold a student the Korean server has not released.
export async function getRaidRecordStudentInfo(
  env: Env,
  rawParties: unknown,
): Promise<Map<string, RaidRecordStudentInfo>> {
  const { gear, weapon } = studentUidsNeedingAvailability(rawParties);
  const [students, growthVisuals, weaponAvailability] = await Promise.all([
    getAllStudents(env, true),
    gear.length > 0 ? getStudentGrowthVisualsBatch(env, gear) : Promise.resolve(new Map()),
    weapon.length > 0 ? getStudentWeaponAvailability(env, weapon) : Promise.resolve(new Map<string, boolean>()),
  ]);
  return new Map(
    students.map((student) => {
      const info: RaidRecordStudentInfo = {
        role: student.role === "special" ? "special" : "striker",
        equipmentSlots: student.equipments.length,
      };
      if (gear.includes(student.uid)) {
        const visuals = growthVisuals.get(student.uid);
        if (!visuals) throw new Error("학생 애용품 정보를 확인하지 못했어요");
        info.gearAvailable = visuals.gearAvailable;
      }
      if (weapon.includes(student.uid)) {
        const available = weaponAvailability.get(student.uid);
        if (available === undefined) throw new Error("학생 고유무기 정보를 확인하지 못했어요");
        info.weaponAvailable = available;
      }
      return [student.uid, info] as const;
    }),
  );
}

// The growth values a party slot starts with: the student's current state in "모집한 학생". Empty values are left out.
export function toRaidRecordSnapshot(student: RecruitedStudent): RaidRecordSnapshot {
  const snapshot: RaidRecordSnapshot = {};
  for (const field of RAID_RECORD_SNAPSHOT_FIELDS) {
    const value = student[field];
    if (typeof value === "number") snapshot[field] = value;
  }
  return snapshot;
}

export async function getRaidRecordRecruitedSnapshots(
  env: Env,
  userId: number,
): Promise<Record<string, RaidRecordSnapshot>> {
  const recruited = await getRecruitedStudents(env, userId);
  return Object.fromEntries(recruited.map((student) => [student.studentUid, toRaidRecordSnapshot(student)]));
}
