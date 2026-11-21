import {
  InvalidRaidRecordError,
  parseRaidRecordRank,
  parseRaidRecordScore,
  type RaidRecordDefenseType,
  type RaidRecordRankStatus,
} from "~/domain/raid-record";
import { isInstantBefore } from "~/lib/date-time";
import type { RaidRecordTableRowView } from "~/views/raid-records";

// What a table row holds while the Sensei types: one score per scoring defense type of the season, and the rank.
export type RaidTableDraft = {
  scores: Partial<Record<RaidRecordDefenseType, number | null>>;
  rank: number | null;
};

export type RaidTableCellError = {
  field: "score" | "rank";
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
  scores: { defenseType: RaidRecordDefenseType; score: number }[];
  rank: number;
};

export function initialRaidTableDraft(row: RaidRecordTableRowView): RaidTableDraft {
  const saved = new Map(row.record?.scores.map((entry) => [entry.defenseType, entry.score]) ?? []);
  return {
    scores: Object.fromEntries(
      row.season.scoreDefenseTypes.map(({ defenseType }) => [defenseType, saved.get(defenseType) ?? null]),
    ),
    rank: row.record?.rank ?? null,
  };
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

export function isRaidTableRankChanged(row: RaidRecordTableRowView, draft: RaidTableDraft): boolean {
  return draft.rank !== (row.record?.rank ?? null);
}

export function isRaidTableRowChanged(row: RaidRecordTableRowView, draft: RaidTableDraft): boolean {
  return (
    isRaidTableRankChanged(row, draft) ||
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
): RaidTableCellError[] {
  if (!isRaidTableRowChanged(row, draft)) return [];
  const scores = enteredScores(row, draft);
  const errors: RaidTableCellError[] = [];
  if (scores.length === 0 && draft.rank === null) {
    // Only a saved record can be emptied; an empty new row is unchanged.
    return [{ field: "score", message: "기록을 지우려면 수정 화면에서 삭제해 주세요." }];
  }
  if (scores.length === 0) {
    errors.push({
      field: "score",
      message: row.season.raidType === "elimination" ? "방어 타입 점수를 하나 이상 입력해 주세요." : "점수를 입력해 주세요.",
    });
  }
  for (const { defenseType, score } of scores) {
    // The same range the save checks, such as a score of 0.
    const rangeError = rangeErrorOf(() => parseRaidRecordScore(score));
    if (rangeError) {
      errors.push({ field: "score", defenseType, message: rangeError });
      continue;
    }
    const maxScore = maxScores[defenseType];
    if (typeof maxScore === "number" && score > maxScore) {
      errors.push({
        field: "score",
        defenseType,
        message: `이 시즌에서 달성할 수 있는 최대 점수(${maxScore.toLocaleString("ko-KR")})보다 높아요.`,
      });
    }
  }
  if (draft.rank === null) errors.push({ field: "rank", message: "순위를 입력해 주세요." });
  else {
    const rangeError = rangeErrorOf(() => parseRaidRecordRank(draft.rank));
    if (rangeError) errors.push({ field: "rank", message: rangeError });
  }
  return errors;
}

function rangeErrorOf(parse: () => unknown): string | null {
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

export function toRaidTableSubmissionRow(row: RaidRecordTableRowView, draft: RaidTableDraft): RaidTableSubmissionRow {
  if (draft.rank === null) throw new Error("A row without a rank cannot be submitted");
  return {
    seasonIndex: row.season.seasonIndex,
    recordUid: row.record?.uid ?? null,
    recordUpdatedAt: row.record?.updatedAt ?? null,
    scores: enteredScores(row, draft),
    rank: draft.rank,
  };
}

export function raidTableErrorLabel(row: RaidRecordTableRowView, error: RaidTableCellError): string {
  return `#${row.season.seasonIndex} ${error.field === "rank" ? "순위" : "점수"}`;
}
