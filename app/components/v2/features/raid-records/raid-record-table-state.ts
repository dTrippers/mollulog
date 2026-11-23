import {
  defaultRaidRecordScoreMode,
  InvalidRaidRecordError,
  isRaidRecordScoreMode,
  parseRaidRecordRank,
  parseRaidRecordScore,
  parseRaidRecordTotalScore,
  type RaidRecordDefenseType,
  type RaidRecordRankStatus,
  type RaidRecordScoreMode,
} from "~/domain/raid-record";
import { isInstantBefore } from "~/lib/date-time";
import type { RaidRecordTableRowView } from "~/views/raid-records";

// What a table row holds while the Sensei types: one score per scoring defense type of the season, the total entered
// alone, which of the two the row shows, and the rank. The side not shown keeps its values and is saved too.
export type RaidTableDraft = {
  scoreMode: RaidRecordScoreMode;
  scores: Partial<Record<RaidRecordDefenseType, number | null>>;
  totalScore: number | null;
  rank: number | null;
};

export type RaidTableCellError = {
  field: "score" | "totalScore" | "rank";
  // The score cell an error belongs to. A score error without one belongs to the row's first score cell.
  defenseType?: RaidRecordDefenseType;
  message: string;
};

// What saving the row will do, for the status column.
export type RaidTableRowStatus =
  | { kind: "none" }
  | { kind: "saved"; status: RaidRecordRankStatus }
  | { kind: "new" }
  | { kind: "changed" }
  | { kind: "transition"; from: RaidRecordRankStatus; to: RaidRecordRankStatus };

export type RaidTableSubmissionRow = {
  seasonIndex: number;
  recordUid: string | null;
  // The version of the record the table showed; the save fails if the record changed since.
  recordUpdatedAt: string | null;
  scoreMode: RaidRecordScoreMode;
  scores: { defenseType: RaidRecordDefenseType; score: number }[];
  totalScore: number | null;
  rank: number;
};

export function initialRaidTableDraft(row: RaidRecordTableRowView): RaidTableDraft {
  const saved = new Map(row.record?.scores.map((entry) => [entry.defenseType, entry.score]) ?? []);
  return {
    // A season without a record starts as a new record would: an ended 대결전 season with the total alone.
    scoreMode: row.record?.scoreMode ?? defaultRaidRecordScoreMode(row.season.raidType, row.season.ongoing),
    scores: Object.fromEntries(
      row.season.scoreDefenseTypes.map(({ defenseType }) => [defenseType, saved.get(defenseType) ?? null]),
    ),
    totalScore: row.record?.totalScore ?? null,
    rank: row.record?.rank ?? null,
  };
}

// The row shows the total entered alone instead of the scores per defense type.
export function raidTableShowsTotal(row: RaidRecordTableRowView, draft: RaidTableDraft): boolean {
  return row.season.raidType === "elimination" && draft.scoreMode === "total";
}

function scoreOf(draft: RaidTableDraft, defenseType: RaidRecordDefenseType): number | null {
  return draft.scores[defenseType] ?? null;
}

export function isRaidTableScoreChanged(
  row: RaidRecordTableRowView,
  draft: RaidTableDraft,
  defenseType: RaidRecordDefenseType,
): boolean {
  return scoreOf(draft, defenseType) !== scoreOf(initialRaidTableDraft(row), defenseType);
}

export function isRaidTableTotalScoreChanged(row: RaidRecordTableRowView, draft: RaidTableDraft): boolean {
  return draft.totalScore !== (row.record?.totalScore ?? null);
}

export function isRaidTableRankChanged(row: RaidRecordTableRowView, draft: RaidTableDraft): boolean {
  return draft.rank !== (row.record?.rank ?? null);
}

// Switching an empty row between the scores and the total changes nothing until a value is typed.
export function isRaidTableRowChanged(row: RaidRecordTableRowView, draft: RaidTableDraft): boolean {
  return (
    isRaidTableRankChanged(row, draft) ||
    isRaidTableTotalScoreChanged(row, draft) ||
    (row.record !== null && draft.scoreMode !== row.record.scoreMode) ||
    row.season.scoreDefenseTypes.some(({ defenseType }) => isRaidTableScoreChanged(row, draft, defenseType))
  );
}

function enteredScores(row: RaidRecordTableRowView, draft: RaidTableDraft) {
  return row.season.scoreDefenseTypes.flatMap(({ defenseType }) => {
    const score = scoreOf(draft, defenseType);
    return score === null ? [] : [{ defenseType, score }];
  });
}

// The errors of a changed row. A row the Sensei did not touch keeps what is saved, even a score saved without a rank.
// `maxScores` holds the season maximum of each defense type the score formula knows.
export function raidTableRowErrors(
  row: RaidRecordTableRowView,
  draft: RaidTableDraft,
  maxScores: Partial<Record<RaidRecordDefenseType, number | null>> = {},
  maxTotalScore: number | null = null,
): RaidTableCellError[] {
  if (!isRaidTableRowChanged(row, draft)) return [];
  const scores = enteredScores(row, draft);
  const showsTotal = raidTableShowsTotal(row, draft);
  const errors: RaidTableCellError[] = [];
  if (scores.length === 0 && draft.totalScore === null && draft.rank === null) {
    // Only a saved record can be emptied; an empty new row is unchanged.
    return [{ field: showsTotal ? "totalScore" : "score", message: "기록을 지우려면 수정 화면에서 삭제해 주세요." }];
  }
  if (showsTotal && draft.totalScore === null) {
    errors.push({ field: "totalScore", message: "합산 점수를 입력해 주세요." });
  }
  if (!showsTotal && scores.length === 0) {
    errors.push({
      field: "score",
      message: row.season.raidType === "elimination" ? "방어 타입 점수를 하나 이상 입력해 주세요." : "점수를 입력해 주세요.",
    });
  }
  if (showsTotal) {
    const totalError = totalScoreErrorOf(draft, maxTotalScore);
    if (totalError) errors.push({ field: "totalScore", message: totalError });
  } else {
    for (const { defenseType, score } of scores) {
      const scoreError = scoreErrorOf(defenseType, score, maxScores);
      if (scoreError) errors.push({ field: "score", defenseType, message: scoreError });
    }
  }
  if (draft.rank === null) errors.push({ field: "rank", message: "순위를 입력해 주세요." });
  else {
    const rangeError = raidRecordRangeError(() => parseRaidRecordRank(draft.rank));
    if (rangeError) errors.push({ field: "rank", message: rangeError });
  }
  return errors;
}

// The same range the save checks, such as a score of 0, and the season maximum.
function scoreErrorOf(
  defenseType: RaidRecordDefenseType,
  score: number,
  maxScores: Partial<Record<RaidRecordDefenseType, number | null>>,
): string | null {
  const rangeError = raidRecordRangeError(() => parseRaidRecordScore(score));
  if (rangeError) return rangeError;
  const maxScore = maxScores[defenseType];
  return typeof maxScore === "number" && score > maxScore ? `최대 점수(${maxScore.toLocaleString("ko-KR")})보다 높아요.` : null;
}

function totalScoreErrorOf(draft: RaidTableDraft, maxTotalScore: number | null): string | null {
  if (draft.totalScore === null) return null;
  const rangeError = raidRecordRangeError(() => parseRaidRecordTotalScore(draft.totalScore));
  if (rangeError) return rangeError;
  return maxTotalScore !== null && draft.totalScore > maxTotalScore
    ? `최대 합산 점수(${maxTotalScore.toLocaleString("ko-KR")})보다 높아요.`
    : null;
}

// The message of a domain parse function that rejects a value, or null when it accepts it. Screens check input with the
// same parse functions as the save, so a value the screen accepts is never rejected on save.
export function raidRecordRangeError(parse: () => unknown): string | null {
  try {
    parse();
    return null;
  } catch (error) {
    if (error instanceof InvalidRaidRecordError) return error.message;
    throw error;
  }
}

function rankStatusAt(rankConfirmAt: string | null, now: string): RaidRecordRankStatus {
  if (rankConfirmAt === null) return "provisional";
  return isInstantBefore(now, rankConfirmAt) ? "provisional" : "confirmed";
}

// The same rule as the save: a rank keeps its time unless it changed, so editing only a score does not confirm a
// 잠정 rank, and a rank entered after the confirmation time is 확정.
export function raidTableRowStatus(row: RaidRecordTableRowView, draft: RaidTableDraft, now: string): RaidTableRowStatus {
  const record = row.record;
  if (!isRaidTableRowChanged(row, draft)) {
    return record ? { kind: "saved", status: record.rankStatus } : { kind: "none" };
  }
  if (!record) return { kind: "new" };
  if (draft.rank === null) return { kind: "changed" };
  const rankTouched = isRaidTableRankChanged(row, draft) || record.rankStatus === "missing";
  const next = rankTouched ? rankStatusAt(row.season.rankConfirmAt, now) : record.rankStatus;
  return next === record.rankStatus ? { kind: "changed" } : { kind: "transition", from: record.rankStatus, to: next };
}

// The side the row does not show is only checked here: a value that would not save is left out instead of
// stopping the save, so a hidden value never needs a message.
export function toRaidTableSubmissionRow(
  row: RaidRecordTableRowView,
  draft: RaidTableDraft,
  maxScores: Partial<Record<RaidRecordDefenseType, number | null>> = {},
  maxTotalScore: number | null = null,
): RaidTableSubmissionRow {
  if (draft.rank === null) throw new Error("A row without a rank cannot be submitted");
  const showsTotal = raidTableShowsTotal(row, draft);
  return {
    seasonIndex: row.season.seasonIndex,
    recordUid: row.record?.uid ?? null,
    recordUpdatedAt: row.record?.updatedAt ?? null,
    scoreMode: row.season.raidType === "elimination" ? draft.scoreMode : "defense_type",
    scores: showsTotal
      ? enteredScores(row, draft).filter(({ defenseType, score }) => scoreErrorOf(defenseType, score, maxScores) === null)
      : enteredScores(row, draft),
    totalScore:
      row.season.raidType !== "elimination" || (!showsTotal && totalScoreErrorOf(draft, maxTotalScore) !== null)
        ? null
        : draft.totalScore,
    rank: draft.rank,
  };
}

export function raidTableErrorLabel(row: RaidRecordTableRowView, error: RaidTableCellError): string {
  const label = error.field === "rank" ? "순위" : error.field === "totalScore" ? "합산" : "점수";
  return `#${row.season.seasonIndex} ${label}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Unsaved drafts kept in the browser
// ---------------------------------------------------------------------------------------------------------------------

// What the browser keeps of the changed rows, so a reload or a closed tab does not lose them. Each row keeps the version
// of the record it was typed over; a row whose record changed since, such as by the save itself, is not restored.
export type StoredRaidTableDrafts = {
  version: 1;
  rows: Record<string, { recordUpdatedAt: string | null; draft: RaidTableDraft }>;
};

export function raidTableDraftStorageKey(username: string, server: string, raidType: string): string {
  return `raid-record-table-drafts:${username}:${server}:${raidType}`;
}

function storedRowsOf(stored: unknown): StoredRaidTableDrafts["rows"] {
  if (typeof stored !== "object" || stored === null) return {};
  const { version, rows } = stored as Partial<StoredRaidTableDrafts>;
  return version === 1 && typeof rows === "object" && rows !== null ? { ...rows } : {};
}

function storedOrNull(rows: StoredRaidTableDrafts["rows"]): StoredRaidTableDrafts | null {
  return Object.keys(rows).length > 0 ? { version: 1, rows } : null;
}

// What to keep after this table's drafts changed, or null when nothing is left. Only the rows this table holds a draft
// for are written: a changed row is kept and an unchanged one removed. Rows another tab keeps stay as they are.
export function mergeStoredRaidTableDrafts(
  stored: unknown,
  rows: readonly RaidRecordTableRowView[],
  drafts: Record<number, RaidTableDraft>,
): StoredRaidTableDrafts | null {
  const kept = storedRowsOf(stored);
  for (const row of rows) {
    const draft = drafts[row.season.seasonIndex];
    if (!draft) continue;
    const key = String(row.season.seasonIndex);
    if (isRaidTableRowChanged(row, draft)) kept[key] = { recordUpdatedAt: row.record?.updatedAt ?? null, draft };
    else delete kept[key];
  }
  return storedOrNull(kept);
}

// What to keep after the given seasons were saved or discarded, or null when nothing is left.
export function forgetStoredRaidTableDrafts(stored: unknown, seasonIndexes: readonly number[]): StoredRaidTableDrafts | null {
  const kept = storedRowsOf(stored);
  for (const seasonIndex of seasonIndexes) delete kept[String(seasonIndex)];
  return storedOrNull(kept);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value));
}

function restoredDraftOf(row: RaidRecordTableRowView, value: unknown): RaidTableDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const draft = value as Record<string, unknown>;
  if (!isRaidRecordScoreMode(draft.scoreMode) || !isNullableNumber(draft.totalScore) || !isNullableNumber(draft.rank)) {
    return null;
  }
  if (typeof draft.scores !== "object" || draft.scores === null) return null;
  const storedScores = draft.scores as Record<string, unknown>;
  const scores: RaidTableDraft["scores"] = {};
  // Only the defense types the season scores; anything else in the stored row is dropped.
  for (const { defenseType } of row.season.scoreDefenseTypes) {
    const score = storedScores[defenseType] ?? null;
    if (!isNullableNumber(score)) return null;
    scores[defenseType] = score;
  }
  return { scoreMode: draft.scoreMode, scores, totalScore: draft.totalScore, rank: draft.rank };
}

// The drafts to put back from what the browser kept. A row is restored only when its season is still in the table, its
// record is the version the draft was typed over, and the draft still differs from what is saved.
export function restoreRaidTableDrafts(
  rows: readonly RaidRecordTableRowView[],
  stored: unknown,
): Record<number, RaidTableDraft> {
  const storedRows = storedRowsOf(stored);
  const restored: Record<number, RaidTableDraft> = {};
  for (const row of rows) {
    if (row.unavailableRecordUid !== null) continue;
    const entry: unknown = storedRows[String(row.season.seasonIndex)];
    if (typeof entry !== "object" || entry === null) continue;
    const { recordUpdatedAt, draft } = entry as Record<string, unknown>;
    if (recordUpdatedAt !== (row.record?.updatedAt ?? null)) continue;
    const restoredDraft = restoredDraftOf(row, draft);
    if (restoredDraft && isRaidTableRowChanged(row, restoredDraft)) restored[row.season.seasonIndex] = restoredDraft;
  }
  return restored;
}
