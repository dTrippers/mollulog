import {
  type Difficulty,
  normalizeBossUid,
  parseDifficulty,
  RAID_DIFFICULTY_SCORE,
  RAID_HP_SCORE,
  RAID_TIME_SCORE_PER_SECOND,
  timeForBoss,
} from "./raid-score";
import { STUDENT_GROWTH_EDIT_RANGES } from "./student-growth-edit";
import { getWeaponLevelMaxByTier } from "./student-growth-state";

// A Sensei's own result in one 총력전 or 대결전 season on one game server. The season index is that server's own
// numbering: kr is BAQL's gl numbering (the season screens), jp is BAQL's jp numbering.
export const RAID_RECORD_SERVERS = ["kr", "jp"] as const;
export type RaidRecordServer = (typeof RAID_RECORD_SERVERS)[number];

export const RAID_RECORD_RAID_TYPES = ["total_assault", "elimination"] as const;
export type RaidRecordRaidType = (typeof RAID_RECORD_RAID_TYPES)[number];

export const RAID_RECORD_DEFENSE_TYPES = ["light", "heavy", "special", "elastic", "composite", "normal"] as const;
export type RaidRecordDefenseType = (typeof RAID_RECORD_DEFENSE_TYPES)[number];

export const RAID_RECORD_LIMITS = {
  // The same party limit as the walkthrough timeline, per defense type.
  partiesPerDefenseType: 20,
  partySize: 6,
  strikerSlots: 4,
  memoLength: 1000,
  maxScore: 999_999_999,
  maxRank: 99_999_999,
} as const;

// The reward tier a final rank falls in. The tier decides the season's ranking rewards, and the gap between two
// tiers is large (rank 12,000 is platinum and 12,001 is gold on the kr server), so screens show it beside every rank.
export const RAID_RANK_TIERS = ["platinum", "gold", "silver", "bronze"] as const;
export type RaidRankTier = (typeof RAID_RANK_TIERS)[number];

// The last rank of each tier; every rank past silver is bronze.
type RaidRankTierBands = { platinum: number; gold: number; silver: number };
// Each entry applies from its season until the next entry of the same server and raid type. The bands have changed
// once (kr 총력전 from season 44), so they stay here rather than in a table. jp holds one set for every season.
type RaidRankTierBandsFrom = { fromSeasonIndex: number; bands: RaidRankTierBands };

const KR_BANDS_BEFORE_44: RaidRankTierBands = { platinum: 10_000, gold: 50_000, silver: 100_000 };
const KR_BANDS: RaidRankTierBands = { platinum: 12_000, gold: 55_000, silver: 100_000 };
const JP_BANDS: RaidRankTierBands = { platinum: 20_000, gold: 120_000, silver: 240_000 };

const RAID_RANK_TIER_BANDS: Record<RaidRecordServer, Record<RaidRecordRaidType, readonly RaidRankTierBandsFrom[]>> = {
  kr: {
    total_assault: [
      { fromSeasonIndex: 1, bands: KR_BANDS_BEFORE_44 },
      { fromSeasonIndex: 44, bands: KR_BANDS },
    ],
    elimination: [{ fromSeasonIndex: 1, bands: KR_BANDS }],
  },
  jp: {
    total_assault: [{ fromSeasonIndex: 1, bands: JP_BANDS }],
    elimination: [{ fromSeasonIndex: 1, bands: JP_BANDS }],
  },
};

export function raidRankTier(
  server: RaidRecordServer,
  raidType: RaidRecordRaidType,
  seasonIndex: number,
  rank: number,
): RaidRankTier | null {
  if (!Number.isInteger(rank) || rank <= 0) return null;
  let bands: RaidRankTierBands | null = null;
  for (const entry of RAID_RANK_TIER_BANDS[server][raidType]) {
    if (entry.fromSeasonIndex <= seasonIndex) bands = entry.bands;
  }
  if (!bands) return null;
  if (rank <= bands.platinum) return "platinum";
  if (rank <= bands.gold) return "gold";
  if (rank <= bands.silver) return "silver";
  return "bronze";
}

export type RaidRankTierCounts = { counts: Record<RaidRankTier, number>; provisionalCount: number };

// How many records reached each tier. A 잠정 rank counts by the tier it has now, and `provisionalCount` says how many
// of the counted records are 잠정, since their tier can still change. A record without a rank is not counted.
export function countRaidRankTiers(
  records: readonly {
    server: RaidRecordServer;
    raidType: RaidRecordRaidType;
    seasonIndex: number;
    rank: number | null;
    rankStatus: RaidRecordRankStatus;
  }[],
): RaidRankTierCounts {
  const counts: Record<RaidRankTier, number> = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  let provisionalCount = 0;
  for (const record of records) {
    if (record.rank === null) continue;
    const tier = raidRankTier(record.server, record.raidType, record.seasonIndex, record.rank);
    if (!tier) continue;
    counts[tier] += 1;
    if (record.rankStatus === "provisional") provisionalCount += 1;
  }
  return { counts, provisionalCount };
}

export const RAID_RECORD_SNAPSHOT_FIELDS = [
  "tier",
  "level",
  "weaponLevel",
  "skillEx",
  "skillNormal",
  "skillEnhanced",
  "skillSub",
  "equip1",
  "equip2",
  "equip3",
  "equipSpecial",
  "abilityHp",
  "abilityAtk",
  "abilityHeal",
] as const;
export type RaidRecordSnapshotField = (typeof RAID_RECORD_SNAPSHOT_FIELDS)[number];
// The growth values entered for one student of a party. A missing field was not entered.
export type RaidRecordSnapshot = Partial<Record<RaidRecordSnapshotField, number>>;

export type RaidRecordUnit = {
  // 0-3 are the STRIKER slots and 4-5 the SPECIAL slots.
  slot: number;
  studentUid: string;
  // A student borrowed from another Sensei (조력자). Its growth values are not filled from the Sensei's own students.
  assist: boolean;
  snapshot: RaidRecordSnapshot;
};

export type RaidRecordParty = {
  defenseType: RaidRecordDefenseType;
  units: RaidRecordUnit[];
};

export type RaidRecordScore = {
  defenseType: RaidRecordDefenseType;
  // The difficulty and clear time are not stored: screens compute them from the score and the season's boss
  // (computeRaidClearResult), so a boss the formula learns later applies to records saved before.
  score: number;
};

export type RaidRecord = {
  uid: string;
  userId: number;
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
  seasonIndex: number;
  scores: RaidRecordScore[];
  rank: number | null;
  rankRecordedAt: string | null;
  memo: string;
  parties: RaidRecordParty[];
  createdAt: string;
  updatedAt: string;
};

export class InvalidRaidRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRaidRecordError";
  }
}

export function isRaidRecordServer(value: unknown): value is RaidRecordServer {
  return RAID_RECORD_SERVERS.some((server) => server === value);
}

export function isRaidRecordRaidType(value: unknown): value is RaidRecordRaidType {
  return RAID_RECORD_RAID_TYPES.some((raidType) => raidType === value);
}

export function isRaidRecordDefenseType(value: unknown): value is RaidRecordDefenseType {
  return RAID_RECORD_DEFENSE_TYPES.some((defenseType) => defenseType === value);
}

// BAQL names the Korean server's schedules "gl".
export function raidRecordServerRegion(server: RaidRecordServer): "gl" | "jp" {
  return server === "kr" ? "gl" : "jp";
}

export function getRaidRecordTotalScore(scores: readonly Pick<RaidRecordScore, "score">[]): number {
  return scores.reduce((sum, entry) => sum + entry.score, 0);
}

type SeasonPeriod = { startAt: string; endAt: string | null };

export function isRaidSeasonStarted(season: SeasonPeriod, now: string): boolean {
  return Date.parse(season.startAt) <= Date.parse(now);
}

export function isRaidSeasonOngoing(season: SeasonPeriod, now: string): boolean {
  return isRaidSeasonStarted(season, now) && (season.endAt === null || Date.parse(now) < Date.parse(season.endAt));
}

// ---------------------------------------------------------------------------------------------------------------------
// Rank status
// ---------------------------------------------------------------------------------------------------------------------

// Both servers reset on UTC+9 (KST and JST), and ranks are confirmed at 0시 of the day after the season ends there.
const SERVER_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// A season that ends at 04:00 on 11/24 confirms its ranks at 0시 on 11/25.
export function getRaidRankConfirmAt(endAt: string): string {
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(endMs)) {
    throw new InvalidRaidRecordError("시즌 종료 시각을 확인하지 못했어요.");
  }
  const localDayStart = Math.floor((endMs + SERVER_UTC_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(localDayStart + DAY_MS - SERVER_UTC_OFFSET_MS).toISOString();
}

export type RaidRecordRankStatus = "missing" | "provisional" | "confirmed";

// A rank entered or confirmed at or after the confirmation time is 확정; one entered before it is 잠정.
export function getRaidRecordRankStatus(
  record: Pick<RaidRecord, "rank" | "rankRecordedAt">,
  confirmAt: string | null,
): RaidRecordRankStatus {
  if (record.rank === null || record.rankRecordedAt === null) return "missing";
  if (confirmAt === null) return "provisional";
  return Date.parse(record.rankRecordedAt) >= Date.parse(confirmAt) ? "confirmed" : "provisional";
}

// A record saved from the season chart holds a score alone. Only such a record may be removed by clearing the chart's
// score input; one with a rank, memo, or party is removed only from its edit screen.
export function isScoreOnlyRaidRecord(record: Pick<RaidRecord, "rank" | "memo" | "parties">): boolean {
  return record.rank === null && record.memo.trim() === "" && record.parties.every((party) => party.units.length === 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// Score → difficulty and clear time
// ---------------------------------------------------------------------------------------------------------------------

export type RaidClearResult = {
  difficulty: Difficulty;
  clearTimeMs: number;
};

// The in-game score formula: score = difficulty score + boss HP score + time score, where the time score is what is
// left of the one-hour room time at the clear, per second. The HP score depends on the boss's battle time limit, so a
// boss the formula does not know (a new one) has no result rather than a guessed one. Elimination uses the same formula
// per defense type.
const RAID_ROOM_TIME_MS = 3_600_000;
const SCORE_DIFFICULTIES: readonly Difficulty[] = [
  "normal",
  "hard",
  "very_hard",
  "hardcore",
  "extreme",
  "insane",
  "torment",
  "lunatic",
];

function raidBossTimeClass(bossUid: string): 180 | 240 | 270 | null {
  const boss = normalizeBossUid(bossUid);
  return boss ? timeForBoss(boss) : null;
}

function difficultyFloorScore(difficulty: Difficulty, timeClass: 180 | 240 | 270): number {
  return RAID_DIFFICULTY_SCORE[difficulty] + RAID_HP_SCORE[difficulty][timeClass];
}

// The difficulty and clear time a score means. Null for a boss the formula does not know, and for a score no difficulty
// can produce (below the lowest one, or between two). The difficulty ranges do not overlap, so a score has at most one.
export function computeRaidClearResult(bossUid: string, score: number): RaidClearResult | null {
  const timeClass = raidBossTimeClass(bossUid);
  if (timeClass === null) return null;
  for (const difficulty of SCORE_DIFFICULTIES) {
    const timeScore = score - difficultyFloorScore(difficulty, timeClass);
    const scorePerSecond = RAID_TIME_SCORE_PER_SECOND[difficulty];
    if (timeScore < 0 || timeScore > scorePerSecond * (RAID_ROOM_TIME_MS / 1000)) continue;
    return { difficulty, clearTimeMs: Math.round(RAID_ROOM_TIME_MS - (timeScore * 1000) / scorePerSecond) };
  }
  return null;
}

// The highest score the season allows: its top difficulty cleared at once. Null when the boss or the top difficulty is
// unknown, so a valid score is never rejected on missing data.
export function getRaidMaxScore(bossUid: string, maxDifficulty: string | null): number | null {
  const timeClass = raidBossTimeClass(bossUid);
  const difficulty = parseDifficulty(maxDifficulty);
  if (timeClass === null || difficulty === null) return null;
  return difficultyFloorScore(difficulty, timeClass) + RAID_TIME_SCORE_PER_SECOND[difficulty] * (RAID_ROOM_TIME_MS / 1000);
}

export function formatRaidClearTime(clearTimeMs: number): string {
  const totalMs = Math.max(0, Math.round(clearTimeMs));
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Input parsing and validation
// ---------------------------------------------------------------------------------------------------------------------

// What the season allows, for validating a record of it.
export type RaidRecordSeasonRules = {
  raidType: RaidRecordRaidType;
  // In BAQL order. A total_assault season has one; an elimination season has three.
  defenseTypes: { defenseType: RaidRecordDefenseType; maxDifficulty: string | null }[];
};

// What the catalog says about a student placed in a party. The availability flags are read only for students whose
// snapshot holds a favorite item or a weapon level; an unknown flag (undefined) is not checked.
export type RaidRecordStudentInfo = {
  role: "striker" | "special";
  equipmentSlots: number;
  gearAvailable?: boolean;
  weaponAvailable?: boolean;
};

export type RaidRecordScoreInput = { defenseType: string; score: number | null };

export type RaidRecordWriteInput = {
  scores: RaidRecordScoreInput[];
  rank: number | null;
  memo: string;
  parties: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRaidRecordScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[,\s]/g, ""));
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > RAID_RECORD_LIMITS.maxScore) {
    throw new InvalidRaidRecordError("점수를 확인해 주세요.");
  }
  return parsed;
}

export function parseRaidRecordRank(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[,\s]/g, ""));
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > RAID_RECORD_LIMITS.maxRank) {
    throw new InvalidRaidRecordError("순위를 확인해 주세요.");
  }
  return parsed;
}

// Keeps only the entered scores, in the season's defense type order, and checks them against the season.
export function normalizeRaidRecordScores(
  scores: readonly RaidRecordScoreInput[],
  rules: RaidRecordSeasonRules,
): { defenseType: RaidRecordDefenseType; score: number }[] {
  const allowed = new Set(rules.defenseTypes.map(({ defenseType }) => defenseType));
  const byDefenseType = new Map<RaidRecordDefenseType, number>();
  for (const entry of scores) {
    if (!isRaidRecordDefenseType(entry.defenseType) || !allowed.has(entry.defenseType)) {
      throw new InvalidRaidRecordError("이 시즌에 없는 방어 타입의 점수예요.");
    }
    if (byDefenseType.has(entry.defenseType)) {
      throw new InvalidRaidRecordError("같은 방어 타입의 점수가 두 번 들어왔어요.");
    }
    const score = parseRaidRecordScore(entry.score);
    if (score !== null) byDefenseType.set(entry.defenseType, score);
  }
  if (rules.raidType === "total_assault" && rules.defenseTypes.length !== 1) {
    throw new InvalidRaidRecordError("총력전 시즌의 방어 타입을 확인하지 못했어요.");
  }
  return rules.defenseTypes.flatMap(({ defenseType }) => {
    const score = byDefenseType.get(defenseType);
    return score === undefined ? [] : [{ defenseType, score }];
  });
}

export function normalizeRaidRecordMemo(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") throw new InvalidRaidRecordError("메모를 확인해 주세요.");
  const memo = value.trim();
  if (memo.length > RAID_RECORD_LIMITS.memoLength) {
    throw new InvalidRaidRecordError(`메모는 ${RAID_RECORD_LIMITS.memoLength.toLocaleString("ko-KR")}자까지 쓸 수 있어요.`);
  }
  return memo;
}

function parseSnapshot(value: unknown, path: string, student: RaidRecordStudentInfo): RaidRecordSnapshot {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) throw new InvalidRaidRecordError(`${path}의 성장 정보를 확인해 주세요.`);
  const snapshot: RaidRecordSnapshot = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (!RAID_RECORD_SNAPSHOT_FIELDS.some((field) => field === key)) {
      throw new InvalidRaidRecordError(`${path}의 성장 정보를 확인해 주세요.`);
    }
    if (fieldValue === null || fieldValue === undefined) continue;
    const field = key as RaidRecordSnapshotField;
    const range = STUDENT_GROWTH_EDIT_RANGES[field];
    if (typeof fieldValue !== "number" || !Number.isInteger(fieldValue) || fieldValue < range.min || fieldValue > range.max) {
      throw new InvalidRaidRecordError(`${path}의 ${range.label} 값을 확인해 주세요.`);
    }
    snapshot[field] = fieldValue;
  }
  const tier = snapshot.tier ?? null;
  if (tier !== null && tier <= 5) {
    // The weapon and ability release open from ★6.
    for (const field of ["weaponLevel", "abilityHp", "abilityAtk", "abilityHeal"] as const) {
      if (snapshot[field] !== undefined && snapshot[field] !== 0) {
        throw new InvalidRaidRecordError(`${path}의 ${STUDENT_GROWTH_EDIT_RANGES[field].label}은 ★6부터 입력할 수 있어요.`);
      }
      delete snapshot[field];
    }
  }
  for (const [index, field] of (["equip1", "equip2", "equip3"] as const).entries()) {
    if (snapshot[field] !== undefined && index >= student.equipmentSlots) {
      throw new InvalidRaidRecordError(`${path}의 학생에게 없는 장비 칸이 있어요.`);
    }
  }
  if (snapshot.equipSpecial !== undefined && student.gearAvailable === false) {
    throw new InvalidRaidRecordError(`${path}에 애용품이 없는 학생의 애용품 값이 있어요.`);
  }
  if (snapshot.weaponLevel !== undefined && snapshot.weaponLevel > 0 && student.weaponAvailable === false) {
    throw new InvalidRaidRecordError(`${path}에 고유무기가 없는 학생의 고유무기 값이 있어요.`);
  }
  if (snapshot.weaponLevel !== undefined && tier !== null && snapshot.weaponLevel > getWeaponLevelMaxByTier(tier)) {
    throw new InvalidRaidRecordError(`${path}의 고유무기 Lv이 성급에 비해 높아요.`);
  }
  return snapshot;
}

// Checks the parties against the season and the catalog. A party with no student is dropped, so an empty card the
// Sensei added and left alone is not saved.
export function parseRaidRecordParties(
  value: unknown,
  rules: RaidRecordSeasonRules,
  studentsByUid: ReadonlyMap<string, RaidRecordStudentInfo>,
): RaidRecordParty[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new InvalidRaidRecordError("편성을 확인해 주세요.");
  const allowed = new Set(rules.defenseTypes.map(({ defenseType }) => defenseType));
  const countByDefenseType = new Map<RaidRecordDefenseType, number>();
  const parties: RaidRecordParty[] = [];
  for (const [partyIndex, party] of value.entries()) {
    const path = `${partyIndex + 1}파티`;
    if (!isObject(party) || !Array.isArray(party.units)) throw new InvalidRaidRecordError(`${path}를 확인해 주세요.`);
    if (!isRaidRecordDefenseType(party.defenseType) || !allowed.has(party.defenseType)) {
      throw new InvalidRaidRecordError(`${path}의 방어 타입이 이 시즌에 없어요.`);
    }
    const defenseType = party.defenseType;
    if (party.units.length > RAID_RECORD_LIMITS.partySize) {
      throw new InvalidRaidRecordError(`${path}에는 학생을 ${RAID_RECORD_LIMITS.partySize}명까지 넣을 수 있어요.`);
    }
    const slots = new Set<number>();
    const studentUids = new Set<string>();
    const units: RaidRecordUnit[] = [];
    for (const unit of party.units) {
      if (!isObject(unit)) throw new InvalidRaidRecordError(`${path}의 학생을 확인해 주세요.`);
      const slot = unit.slot;
      if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot >= RAID_RECORD_LIMITS.partySize) {
        throw new InvalidRaidRecordError(`${path}의 슬롯을 확인해 주세요.`);
      }
      if (slots.has(slot)) throw new InvalidRaidRecordError(`${path}의 같은 슬롯에 학생이 둘 있어요.`);
      slots.add(slot);
      if (typeof unit.studentUid !== "string" || unit.studentUid === "") {
        throw new InvalidRaidRecordError(`${path}의 학생을 확인해 주세요.`);
      }
      const student = studentsByUid.get(unit.studentUid);
      if (!student) throw new InvalidRaidRecordError(`${path}에 찾을 수 없는 학생이 있어요.`);
      if (studentUids.has(unit.studentUid)) throw new InvalidRaidRecordError(`${path}에 같은 학생이 둘 있어요.`);
      studentUids.add(unit.studentUid);
      const strikerSlot = slot < RAID_RECORD_LIMITS.strikerSlots;
      if (strikerSlot !== (student.role === "striker")) {
        throw new InvalidRaidRecordError(`${path}에 슬롯과 맞지 않는 학생이 있어요.`);
      }
      if (unit.assist !== undefined && typeof unit.assist !== "boolean") {
        throw new InvalidRaidRecordError(`${path}의 조력자 표시를 확인해 주세요.`);
      }
      units.push({
        slot,
        studentUid: unit.studentUid,
        assist: unit.assist === true,
        snapshot: parseSnapshot(unit.snapshot, path, student),
      });
    }
    if (units.length === 0) continue;
    const count = (countByDefenseType.get(defenseType) ?? 0) + 1;
    if (count > RAID_RECORD_LIMITS.partiesPerDefenseType) {
      throw new InvalidRaidRecordError(`파티는 ${RAID_RECORD_LIMITS.partiesPerDefenseType}개까지 추가할 수 있어요.`);
    }
    countByDefenseType.set(defenseType, count);
    parties.push({ defenseType, units: units.sort((left, right) => left.slot - right.slot) });
  }
  return parties;
}

// Reads a stored parties value. Stored data that does not parse is an explicit failure, not an empty formation.
export function readStoredRaidRecordParties(value: unknown): RaidRecordParty[] {
  if (!Array.isArray(value)) throw new InvalidRaidRecordError("저장된 편성을 읽지 못했어요.");
  return value.map((party) => {
    if (!isObject(party) || !isRaidRecordDefenseType(party.defenseType) || !Array.isArray(party.units)) {
      throw new InvalidRaidRecordError("저장된 편성을 읽지 못했어요.");
    }
    return {
      defenseType: party.defenseType,
      units: party.units.map((unit) => {
        if (!isObject(unit) || typeof unit.slot !== "number" || typeof unit.studentUid !== "string") {
          throw new InvalidRaidRecordError("저장된 편성을 읽지 못했어요.");
        }
        return {
          slot: unit.slot,
          studentUid: unit.studentUid,
          assist: unit.assist === true,
          snapshot: isObject(unit.snapshot) ? (unit.snapshot as RaidRecordSnapshot) : {},
        };
      }),
    };
  });
}

export function readStoredRaidRecordScores(value: unknown): RaidRecordScore[] {
  if (!Array.isArray(value)) throw new InvalidRaidRecordError("저장된 점수를 읽지 못했어요.");
  return value.map((entry) => {
    if (
      !isObject(entry) ||
      !isRaidRecordDefenseType(entry.defenseType) ||
      typeof entry.score !== "number"
    ) {
      throw new InvalidRaidRecordError("저장된 점수를 읽지 못했어요.");
    }
    return {
      defenseType: entry.defenseType,
      score: entry.score,
    };
  });
}
