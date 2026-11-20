import {
  getRaidRecordRankStatus,
  getRaidRecordTotalScore,
  isRaidRecordRaidType,
  isRaidSeasonOngoing,
  isRaidSeasonStarted,
  isScoreOnlyRaidRecord,
  type RaidRecord,
  type RaidRecordDefenseType,
  type RaidRecordRaidType,
  type RaidRecordRankStatus,
  type RaidRecordServer,
  type RaidRecordSnapshot,
  RAID_RECORD_SERVERS,
} from "~/domain/raid-record";
import { isInstantBefore, nowUtcIso, type UtcIsoString } from "~/lib/date-time";
import {
  getRaidRecordRecruitedSnapshots,
  getRaidRecordSeasons,
  listRaidRecords,
  type RaidRecordSeason,
} from "~/models/raid-record";
import { getAllStudents } from "~/models/student";

// What a list row, a table row, and the detail header show about a season.
export type RaidRecordSeasonView = {
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
  seasonIndex: number;
  counterpartSeasonIndex: number | null;
  rankSeasonIndex: number | null;
  boss: { uid: string; name: string };
  terrain: RaidRecordSeason["terrain"];
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  ongoing: boolean;
  displayDefenseTypes: RaidRecordDefenseType[];
  scoreDefenseTypes: RaidRecordSeason["scoreDefenseTypes"];
  rankConfirmAt: UtcIsoString | null;
};

export type RaidRecordScoreView = {
  defenseType: RaidRecordDefenseType;
  // Null for a defense type the record has no score for.
  score: number | null;
  difficulty: string | null;
  clearTimeMs: number | null;
};

export type RaidRecordRowView = {
  uid: string;
  season: RaidRecordSeasonView;
  // One entry per scoring defense type of the season, in BAQL order.
  scores: RaidRecordScoreView[];
  totalScore: number;
  enteredCount: number;
  rank: number | null;
  rankStatus: RaidRecordRankStatus;
  // The confirmation time passed and the rank is still 잠정, so the owner can confirm it.
  canConfirmRank: boolean;
  updatedAt: UtcIsoString;
};

export function toRaidRecordSeasonView(season: RaidRecordSeason, now: UtcIsoString): RaidRecordSeasonView {
  return {
    server: season.server,
    raidType: season.raidType,
    seasonIndex: season.seasonIndex,
    counterpartSeasonIndex: season.counterpartSeasonIndex,
    rankSeasonIndex: season.rankSeasonIndex,
    boss: season.boss,
    terrain: season.terrain,
    startAt: season.startAt,
    endAt: season.endAt,
    ongoing: isRaidSeasonOngoing(season, now),
    displayDefenseTypes: season.displayDefenseTypes,
    scoreDefenseTypes: season.scoreDefenseTypes,
    rankConfirmAt: season.rankConfirmAt,
  };
}

export function toRaidRecordRowView(
  record: RaidRecord,
  season: RaidRecordSeason,
  now: UtcIsoString,
): RaidRecordRowView | null {
  const scoreByDefenseType = new Map(record.scores.map((entry) => [entry.defenseType, entry]));
  const scores = season.scoreDefenseTypes.map(({ defenseType }): RaidRecordScoreView => {
    const entry = scoreByDefenseType.get(defenseType);
    return {
      defenseType,
      score: entry?.score ?? null,
      difficulty: entry?.difficulty ?? null,
      clearTimeMs: entry?.clearTimeMs ?? null,
    };
  });
  // A score for a defense type the season no longer lists cannot be shown truthfully; the caller marks the record.
  const seasonDefenseTypes = new Set(season.scoreDefenseTypes.map(({ defenseType }) => defenseType));
  if (record.scores.some((entry) => !seasonDefenseTypes.has(entry.defenseType))) return null;
  const rankStatus = getRaidRecordRankStatus(record, season.rankConfirmAt);
  return {
    uid: record.uid,
    season: toRaidRecordSeasonView(season, now),
    scores,
    totalScore: getRaidRecordTotalScore(record.scores),
    enteredCount: record.scores.length,
    rank: record.rank,
    rankStatus,
    canConfirmRank:
      rankStatus === "provisional" && season.rankConfirmAt !== null && !isInstantBefore(now, season.rankConfirmAt),
    updatedAt: record.updatedAt,
  };
}

function seasonKey(raidType: string, seasonIndex: number) {
  return `${raidType}:${seasonIndex}`;
}

export type RaidRecordListView = {
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
  counts: Record<RaidRecordRaidType, number>;
  rows: RaidRecordRowView[];
  // Records whose season BAQL no longer lists as recorded. Each takes its own place in the list as a failure.
  unavailableRecords: { uid: string; seasonIndex: number }[];
  // Seasons of the server and raid type that ended without a record.
  unrecordedPastSeasonCount: number;
  now: UtcIsoString;
};

export async function loadRaidRecordList(
  env: Env,
  userId: number,
  server: RaidRecordServer,
  raidType: RaidRecordRaidType,
  ctx?: ExecutionContext,
): Promise<RaidRecordListView> {
  const now = nowUtcIso();
  const [records, seasons] = await Promise.all([
    listRaidRecords(env, userId, { ctx }),
    getRaidRecordSeasons(env, server),
  ]);
  const seasonByKey = new Map(seasons.map((season) => [seasonKey(season.raidType, season.seasonIndex), season]));
  const serverRecords = records.filter((record) => record.server === server);
  const counts: Record<RaidRecordRaidType, number> = {
    total_assault: serverRecords.filter((record) => record.raidType === "total_assault").length,
    elimination: serverRecords.filter((record) => record.raidType === "elimination").length,
  };
  const rows: RaidRecordRowView[] = [];
  const unavailableRecords: RaidRecordListView["unavailableRecords"] = [];
  for (const record of serverRecords) {
    if (record.raidType !== raidType) continue;
    const season = seasonByKey.get(seasonKey(record.raidType, record.seasonIndex));
    const row = season ? toRaidRecordRowView(record, season, now) : null;
    if (!row) {
      unavailableRecords.push({ uid: record.uid, seasonIndex: record.seasonIndex });
      continue;
    }
    rows.push(row);
  }
  rows.sort((left, right) => right.season.seasonIndex - left.season.seasonIndex);
  const recordedSeasons = new Set(serverRecords.map((record) => seasonKey(record.raidType, record.seasonIndex)));
  const unrecordedPastSeasonCount = seasons.filter(
    (season) =>
      season.raidType === raidType &&
      isRaidSeasonStarted(season, now) &&
      !isRaidSeasonOngoing(season, now) &&
      !recordedSeasons.has(seasonKey(season.raidType, season.seasonIndex)),
  ).length;
  return { server, raidType, counts, rows, unavailableRecords, unrecordedPastSeasonCount, now };
}

// ---------------------------------------------------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------------------------------------------------

export type RaidRecordFormSeasonOption = RaidRecordSeasonView & {
  // The Sensei's record of the season, so the season menu can send them to it instead of adding a second one.
  recordUid: string | null;
};

export type RaidRecordFormStudent = {
  uid: string;
  name: string;
  role: "striker" | "special";
  initialTier: number;
  equipmentSlots: number;
  // Released on the Korean server. A Japanese server record can also hold the others.
  released: boolean;
};

export type RaidRecordFormData = {
  // Started seasons only, newest first.
  seasonsByServer: Record<RaidRecordServer, RaidRecordFormSeasonOption[]>;
  students: RaidRecordFormStudent[];
  // The current growth state of each recruited student, by student uid.
  recruited: Record<string, RaidRecordSnapshot>;
  now: UtcIsoString;
};

export async function loadRaidRecordFormData(
  env: Env,
  userId: number,
  servers: readonly RaidRecordServer[] = RAID_RECORD_SERVERS,
  ctx?: ExecutionContext,
): Promise<RaidRecordFormData> {
  const now = nowUtcIso();
  const [records, seasonLists, students, recruited] = await Promise.all([
    listRaidRecords(env, userId, { ctx }),
    Promise.all(servers.map((server) => getRaidRecordSeasons(env, server))),
    getAllStudents(env, true),
    getRaidRecordRecruitedSnapshots(env, userId),
  ]);
  const recordUidByKey = new Map(
    records.map((record) => [`${record.server}:${seasonKey(record.raidType, record.seasonIndex)}`, record.uid]),
  );
  const seasonsByServer: Record<RaidRecordServer, RaidRecordFormSeasonOption[]> = { kr: [], jp: [] };
  servers.forEach((server, index) => {
    seasonsByServer[server] = seasonLists[index]
      .filter((season) => isRaidSeasonStarted(season, now))
      .map((season) => ({
        ...toRaidRecordSeasonView(season, now),
        recordUid: recordUidByKey.get(`${server}:${seasonKey(season.raidType, season.seasonIndex)}`) ?? null,
      }));
  });
  return {
    seasonsByServer,
    students: students.map((student) => ({
      uid: student.uid,
      name: student.name,
      role: student.role === "special" ? "special" : "striker",
      initialTier: student.initialTier,
      equipmentSlots: student.equipments.length,
      released: student.released,
    })),
    recruited,
    now,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------------------------------------------------

// The saved values a table row starts from.
export type RaidRecordTableRecordView = {
  uid: string;
  scores: RaidRecordScoreView[];
  rank: number | null;
  rankStatus: RaidRecordRankStatus;
};

export type RaidRecordTableRowView = {
  season: RaidRecordSeasonView;
  // Null for a season without a record.
  record: RaidRecordTableRecordView | null;
  // A record whose scores name a defense type the season no longer lists. The table cannot show it truthfully, so the
  // row is read-only and points to the record's edit screen.
  unavailableRecordUid: string | null;
};

export type RaidRecordTableView = {
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
  // Every started season of the server and raid type, newest first.
  rows: RaidRecordTableRowView[];
  now: UtcIsoString;
};

export async function loadRaidRecordTable(
  env: Env,
  userId: number,
  server: RaidRecordServer,
  raidType: RaidRecordRaidType,
  ctx?: ExecutionContext,
): Promise<RaidRecordTableView> {
  const now = nowUtcIso();
  const [records, seasons] = await Promise.all([
    listRaidRecords(env, userId, { ctx }),
    getRaidRecordSeasons(env, server),
  ]);
  const recordByKey = new Map(
    records
      .filter((record) => record.server === server)
      .map((record) => [seasonKey(record.raidType, record.seasonIndex), record]),
  );
  const rows = seasons
    .filter((season) => season.raidType === raidType && isRaidSeasonStarted(season, now))
    .sort((left, right) => right.seasonIndex - left.seasonIndex)
    .map((season): RaidRecordTableRowView => {
      const record = recordByKey.get(seasonKey(season.raidType, season.seasonIndex)) ?? null;
      const row = record ? toRaidRecordRowView(record, season, now) : null;
      return {
        season: toRaidRecordSeasonView(season, now),
        record: row ? { uid: row.uid, scores: row.scores, rank: row.rank, rankStatus: row.rankStatus } : null,
        unavailableRecordUid: record && !row ? record.uid : null,
      };
    });
  return { server, raidType, rows, now };
}

// ---------------------------------------------------------------------------------------------------------------------
// Season chart
// ---------------------------------------------------------------------------------------------------------------------

// What the season chart's "내 점수" shows about the signed-in Sensei's record of the season.
export type RaidChartRecordView = {
  uid: string;
  scores: { defenseType: RaidRecordDefenseType; score: number }[];
  totalScore: number;
  rank: number | null;
  rankStatus: RaidRecordRankStatus;
  // A record with nothing but scores. Clearing a score on the chart removes it only from such a record.
  scoreOnly: boolean;
};

// One server's season that the chart can save a score to.
export type RaidChartSeasonView = {
  server: RaidRecordServer;
  seasonIndex: number;
  // Not started on the server yet: the chart keeps the score in the browser only.
  started: boolean;
  scoreDefenseTypes: RaidRecordDefenseType[];
  record: RaidChartRecordView | null;
};

export type RaidChartRecordContextView = {
  username: string;
  raidType: RaidRecordRaidType;
  kr: RaidChartSeasonView;
  // The matching Japanese season, only when the Sensei has a record of it.
  jp: RaidChartSeasonView | null;
};

export function toRaidChartRecordView(record: RaidRecord, season: Pick<RaidRecordSeason, "rankConfirmAt">): RaidChartRecordView {
  return {
    uid: record.uid,
    scores: record.scores.map(({ defenseType, score }) => ({ defenseType, score })),
    totalScore: getRaidRecordTotalScore(record.scores),
    rank: record.rank,
    rankStatus: getRaidRecordRankStatus(record, season.rankConfirmAt),
    scoreOnly: isScoreOnlyRaidRecord(record),
  };
}

function toRaidChartSeasonView(
  season: RaidRecordSeason,
  record: RaidRecord | null,
  now: UtcIsoString,
): RaidChartSeasonView {
  return {
    server: season.server,
    seasonIndex: season.seasonIndex,
    started: isRaidSeasonStarted(season, now),
    scoreDefenseTypes: season.scoreDefenseTypes.map(({ defenseType }) => defenseType),
    record: record ? toRaidChartRecordView(record, season) : null,
  };
}

// The season chart's record context for a Korean season page. Null for a raid type that takes no records.
export async function loadRaidChartRecordContext(
  env: Env,
  user: { id: number; username: string },
  raidType: string,
  krSeasonIndex: number,
  ctx?: ExecutionContext,
): Promise<RaidChartRecordContextView | null> {
  if (!isRaidRecordRaidType(raidType)) return null;
  const now = nowUtcIso();
  const [records, krSeasons] = await Promise.all([
    listRaidRecords(env, user.id, { ctx }),
    getRaidRecordSeasons(env, "kr"),
  ]);
  const recordOf = (server: RaidRecordServer, seasonIndex: number) =>
    records.find(
      (record) => record.server === server && record.raidType === raidType && record.seasonIndex === seasonIndex,
    ) ?? null;

  const krSeason = krSeasons.find((season) => season.raidType === raidType && season.seasonIndex === krSeasonIndex);
  // A Korean season without a start time has not started.
  const kr: RaidChartSeasonView = krSeason
    ? toRaidChartSeasonView(krSeason, recordOf("kr", krSeasonIndex), now)
    : { server: "kr", seasonIndex: krSeasonIndex, started: false, scoreDefenseTypes: [], record: null };

  const jpSeasonIndex = krSeason?.counterpartSeasonIndex ?? null;
  const jpRecord = jpSeasonIndex === null ? null : recordOf("jp", jpSeasonIndex);
  let jp: RaidChartSeasonView | null = null;
  if (jpRecord) {
    const jpSeasons = await getRaidRecordSeasons(env, "jp");
    const jpSeason = jpSeasons.find((season) => season.raidType === raidType && season.seasonIndex === jpSeasonIndex);
    if (jpSeason) jp = toRaidChartSeasonView(jpSeason, jpRecord, now);
  }
  return { username: user.username, raidType, kr, jp };
}
