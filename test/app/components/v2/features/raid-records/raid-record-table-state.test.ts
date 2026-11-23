import { describe, expect, it } from "@jest/globals";
import {
  forgetStoredRaidTableDrafts,
  initialRaidTableDraft,
  isRaidTableRowChanged,
  mergeStoredRaidTableDrafts,
  type RaidTableDraft,
  raidTableErrorLabel,
  raidTableRowErrors,
  raidTableRowStatus,
  restoreRaidTableDrafts,
  toRaidTableSubmissionRow,
} from "~/components/v2/features/raid-records/raid-record-table-state";
import type { RaidRecordRankStatus, RaidRecordScoreMode } from "~/domain/raid-record";
import { Terrain } from "~/graphql/graphql";
import type { RaidRecordSeasonView, RaidRecordTableRowView } from "~/views/raid-records";

const CONFIRM_AT = "2026-11-24T15:00:00.000Z";
const BEFORE_CONFIRM = "2026-11-24T14:00:00.000Z";
const AFTER_CONFIRM = "2026-11-25T00:00:00.000Z";

function season(raidType: "total_assault" | "elimination"): RaidRecordSeasonView {
  return {
    server: "kr",
    raidType,
    seasonIndex: raidType === "elimination" ? 35 : 88,
    counterpartSeasonIndex: null,
    boss: { uid: "hod", name: "호드" },
    terrain: Terrain.Indoor,
    startAt: "2026-11-17T02:00:00.000Z",
    endAt: "2026-11-23T19:00:00.000Z",
    ongoing: false,
    displayDefenseTypes: [],
    scoreDefenseTypes:
      raidType === "elimination"
        ? [
            { defenseType: "heavy", maxDifficulty: "torment" },
            { defenseType: "elastic", maxDifficulty: "torment" },
            { defenseType: "light", maxDifficulty: "insane" },
          ]
        : [{ defenseType: "special", maxDifficulty: "lunatic" }],
    rankConfirmAt: CONFIRM_AT,
  };
}

function row(
  raidType: "total_assault" | "elimination",
  record: {
    scores: Record<string, number>;
    rank: number | null;
    rankStatus: RaidRecordRankStatus;
    scoreMode?: RaidRecordScoreMode;
    totalScore?: number | null;
  } | null,
  { ongoing = false }: { ongoing?: boolean } = {},
): RaidRecordTableRowView {
  const rowSeason = { ...season(raidType), ongoing };
  return {
    season: rowSeason,
    record: record && {
      uid: "record-1",
      scoreMode: record.scoreMode ?? "defense_type",
      scores: rowSeason.scoreDefenseTypes.flatMap(({ defenseType }) => {
        const score = record.scores[defenseType];
        return score === undefined ? [] : [{ defenseType, score }];
      }),
      totalScore: record.totalScore ?? null,
      rank: record.rank,
      rankStatus: record.rankStatus,
      updatedAt: "2026-11-05T00:00:00.000Z",
    },
    unavailableRecordUid: null,
  };
}

function draft(
  scores: RaidTableDraft["scores"],
  rank: number | null,
  total: Partial<Pick<RaidTableDraft, "scoreMode" | "totalScore">> = {},
): RaidTableDraft {
  return { scoreMode: "defense_type", totalScore: null, ...total, scores, rank };
}

describe("raid record table drafts", () => {
  it("starts from the saved scores and rank, one entry per scoring defense type", () => {
    expect(
      initialRaidTableDraft(
        row("elimination", { scores: { heavy: 40_000_000 }, rank: 1200, rankStatus: "provisional" }),
      ),
    ).toEqual(draft({ heavy: 40_000_000, elastic: null, light: null }, 1200));
    expect(initialRaidTableDraft(row("total_assault", null))).toEqual(draft({ special: null }, null));
  });

  it("starts an ended 대결전 season without a record with the total alone, and a saved record as it was saved", () => {
    expect(initialRaidTableDraft(row("elimination", null)).scoreMode).toBe("total");
    expect(initialRaidTableDraft(row("elimination", null, { ongoing: true })).scoreMode).toBe("defense_type");
    expect(initialRaidTableDraft(row("total_assault", null)).scoreMode).toBe("defense_type");
    const savedTotal = row("elimination", {
      scores: { heavy: 40_000_000 },
      rank: 1200,
      rankStatus: "confirmed",
      scoreMode: "total",
      totalScore: 90_000_000,
    });
    expect(initialRaidTableDraft(savedTotal)).toEqual(
      draft({ heavy: 40_000_000, elastic: null, light: null }, 1200, { scoreMode: "total", totalScore: 90_000_000 }),
    );
    const savedScores = row("elimination", { scores: { heavy: 40_000_000 }, rank: 1200, rankStatus: "confirmed" });
    expect(initialRaidTableDraft(savedScores).scoreMode).toBe("defense_type");
  });

  it("changes with the score mode of a saved record, but not of an empty row", () => {
    const saved = row("elimination", { scores: { heavy: 40_000_000 }, rank: 1200, rankStatus: "confirmed" });
    const switched = { ...initialRaidTableDraft(saved), scoreMode: "total" as const };
    expect(isRaidTableRowChanged(saved, switched)).toBe(true);
    const empty = row("elimination", null);
    expect(isRaidTableRowChanged(empty, { ...initialRaidTableDraft(empty), scoreMode: "defense_type" })).toBe(false);
  });

  it("is unchanged until a score or the rank differs from what is saved", () => {
    const saved = row("total_assault", { scores: { special: 30_000_000 }, rank: 500, rankStatus: "confirmed" });

    expect(isRaidTableRowChanged(saved, draft({ special: 30_000_000 }, 500))).toBe(false);
    expect(isRaidTableRowChanged(saved, draft({ special: 30_000_001 }, 500))).toBe(true);
    expect(isRaidTableRowChanged(saved, draft({ special: 30_000_000 }, 501))).toBe(true);
  });
});

describe("raid record table errors", () => {
  it("has no error for an untouched row, even a saved score without a rank", () => {
    const saved = row("total_assault", { scores: { special: 30_000_000 }, rank: null, rankStatus: "missing" });
    expect(raidTableRowErrors(saved, initialRaidTableDraft(saved))).toEqual([]);
  });

  it("marks a score or rank of 0 before the save, like the save does", () => {
    const empty = row("total_assault", null);
    expect(raidTableRowErrors(empty, draft({ special: 0 }, 0))).toEqual([
      { field: "score", defenseType: "special", message: "점수를 확인해 주세요." },
      { field: "rank", message: "순위를 확인해 주세요." },
    ]);
  });

  it("asks for a rank and a score in a changed row", () => {
    const empty = row("total_assault", null);
    expect(raidTableRowErrors(empty, draft({ special: 30_000_000 }, null))).toEqual([
      { field: "rank", message: "순위를 입력해 주세요." },
    ]);
    expect(raidTableRowErrors(empty, draft({ special: null }, 1200))).toEqual([
      { field: "score", message: "점수를 입력해 주세요." },
    ]);
    expect(raidTableRowErrors(row("elimination", null), draft({}, 1200))).toEqual([
      { field: "score", message: "방어 타입 점수를 하나 이상 입력해 주세요." },
    ]);
  });

  it("sends a row emptied of everything to the edit screen", () => {
    const saved = row("total_assault", { scores: { special: 30_000_000 }, rank: 500, rankStatus: "confirmed" });
    expect(raidTableRowErrors(saved, draft({ special: null }, null))).toEqual([
      { field: "score", message: "기록을 지우려면 수정 화면에서 삭제해 주세요." },
    ]);
  });

  it("flags every score above its defense type's maximum", () => {
    const errors = raidTableRowErrors(
      row("elimination", null),
      draft({ heavy: 50_000_000, elastic: 30_000_000, light: 45_000_000 }, 1200),
      { heavy: 40_348_000, elastic: 40_348_000, light: 40_000_000 },
    );
    expect(errors).toEqual([
      { field: "score", defenseType: "heavy", message: "최대 점수(40,348,000)보다 높아요." },
      { field: "score", defenseType: "light", message: "최대 점수(40,000,000)보다 높아요." },
    ]);
    // A defense type without a known maximum (a boss the score formula does not know) is not checked.
    expect(raidTableRowErrors(row("elimination", null), draft({ heavy: 50_000_000 }, 1200), { heavy: null })).toEqual(
      [],
    );
  });

  it("asks for the total of a row that shows it alone, and checks it against the season maximum", () => {
    const empty = row("elimination", null);
    expect(raidTableRowErrors(empty, draft({}, 1200, { scoreMode: "total" }))).toEqual([
      { field: "totalScore", message: "합산 점수를 입력해 주세요." },
    ]);
    expect(
      raidTableRowErrors(empty, draft({}, 1200, { scoreMode: "total", totalScore: 120_000_001 }), {}, 120_000_000),
    ).toEqual([{ field: "totalScore", message: "최대 합산 점수(120,000,000)보다 높아요." }]);
    expect(raidTableRowErrors(empty, draft({}, 1200, { scoreMode: "total", totalScore: 0 }))).toEqual([
      { field: "totalScore", message: "합산 점수를 확인해 주세요." },
    ]);
    // A row that shows its total needs no score per defense type.
    expect(raidTableRowErrors(empty, draft({}, 1200, { scoreMode: "total", totalScore: 90_000_000 }))).toEqual([]);
  });

  it("does not check the side a row does not show", () => {
    const empty = row("elimination", null);
    expect(
      raidTableRowErrors(empty, draft({ heavy: 50_000_000 }, 1200, { scoreMode: "total", totalScore: 90_000_000 }), {
        heavy: 40_348_000,
      }),
    ).toEqual([]);
    expect(
      raidTableRowErrors(empty, draft({ heavy: 30_000_000 }, 1200, { totalScore: 120_000_001 }), {}, 120_000_000),
    ).toEqual([]);
  });

  it("labels an error by season and field", () => {
    const tableRow = row("elimination", null);
    expect(raidTableErrorLabel(tableRow, { field: "rank", message: "" })).toBe("#35 순위");
    expect(raidTableErrorLabel(tableRow, { field: "score", defenseType: "heavy", message: "" })).toBe("#35 점수");
    expect(raidTableErrorLabel(tableRow, { field: "totalScore", message: "" })).toBe("#35 합산");
  });
});

describe("raid record table row status", () => {
  it("shows the saved status of an untouched row and nothing for an empty one", () => {
    const saved = row("total_assault", { scores: { special: 1 }, rank: 500, rankStatus: "provisional" });
    expect(raidTableRowStatus(saved, initialRaidTableDraft(saved), AFTER_CONFIRM)).toEqual({
      kind: "saved",
      status: "provisional",
    });
    const empty = row("total_assault", null);
    expect(raidTableRowStatus(empty, initialRaidTableDraft(empty), AFTER_CONFIRM)).toEqual({ kind: "none" });
  });

  it("marks a new record as new", () => {
    expect(raidTableRowStatus(row("total_assault", null), draft({ special: 1 }, 500), BEFORE_CONFIRM)).toEqual({
      kind: "new",
    });
  });

  it("keeps a 잠정 rank when only a score changes", () => {
    const saved = row("total_assault", { scores: { special: 1 }, rank: 500, rankStatus: "provisional" });
    expect(raidTableRowStatus(saved, draft({ special: 2 }, 500), AFTER_CONFIRM)).toEqual({ kind: "changed" });
  });

  it("shows the transition a changed rank makes at the confirmation time", () => {
    const provisional = row("total_assault", { scores: { special: 1 }, rank: 500, rankStatus: "provisional" });
    expect(raidTableRowStatus(provisional, draft({ special: 1 }, 400), AFTER_CONFIRM)).toEqual({
      kind: "transition",
      from: "provisional",
      to: "confirmed",
    });
    expect(raidTableRowStatus(provisional, draft({ special: 1 }, 400), BEFORE_CONFIRM)).toEqual({ kind: "changed" });

    const confirmed = row("total_assault", { scores: { special: 1 }, rank: 500, rankStatus: "confirmed" });
    expect(raidTableRowStatus(confirmed, draft({ special: 1 }, 400), AFTER_CONFIRM)).toEqual({ kind: "changed" });
  });

  it("treats a rank added to a score-only record as entered now", () => {
    const scoreOnly = row("total_assault", { scores: { special: 1 }, rank: null, rankStatus: "missing" });
    expect(raidTableRowStatus(scoreOnly, draft({ special: 1 }, 400), BEFORE_CONFIRM)).toEqual({
      kind: "transition",
      from: "missing",
      to: "provisional",
    });
    expect(raidTableRowStatus(scoreOnly, draft({ special: 1 }, null), BEFORE_CONFIRM)).toEqual({
      kind: "saved",
      status: "missing",
    });
  });
});

describe("raid record table submission", () => {
  it("sends the entered scores in season order with the rank", () => {
    const saved = row("elimination", { scores: { heavy: 40_000_000 }, rank: 1200, rankStatus: "provisional" });
    expect(
      toRaidTableSubmissionRow(saved, draft({ light: 27_000_000, elastic: null, heavy: 40_000_000 }, 1100)),
    ).toEqual({
      seasonIndex: 35,
      recordUid: "record-1",
      recordUpdatedAt: "2026-11-05T00:00:00.000Z",
      scoreMode: "defense_type",
      scores: [
        { defenseType: "heavy", score: 40_000_000 },
        { defenseType: "light", score: 27_000_000 },
      ],
      totalScore: null,
      rank: 1100,
    });
    expect(() => toRaidTableSubmissionRow(saved, draft({ heavy: 1 }, null))).toThrow();
  });

  it("sends the total and the scores together, whichever the row shows", () => {
    const saved = row("elimination", { scores: { heavy: 40_000_000 }, rank: 1200, rankStatus: "provisional" });
    expect(
      toRaidTableSubmissionRow(
        saved,
        draft({ heavy: 40_000_000, elastic: null, light: null }, 1200, { scoreMode: "total", totalScore: 90_000_000 }),
      ),
    ).toMatchObject({
      scoreMode: "total",
      scores: [{ defenseType: "heavy", score: 40_000_000 }],
      totalScore: 90_000_000,
    });
    // A hidden value that would not save is left out.
    expect(
      toRaidTableSubmissionRow(
        saved,
        draft({ heavy: 50_000_000, light: 30_000_000 }, 1200, { scoreMode: "total", totalScore: 90_000_000 }),
        { heavy: 40_348_000, light: 40_000_000 },
      ),
    ).toMatchObject({ scores: [{ defenseType: "light", score: 30_000_000 }], totalScore: 90_000_000 });
    expect(
      toRaidTableSubmissionRow(
        saved,
        draft({ heavy: 30_000_000 }, 1200, { scoreMode: "defense_type", totalScore: 120_000_001 }),
        {},
        120_000_000,
      ),
    ).toMatchObject({ scores: [{ defenseType: "heavy", score: 30_000_000 }], totalScore: null });
    // A 총력전 row never sends a total.
    const assault = row("total_assault", null);
    expect(
      toRaidTableSubmissionRow(assault, draft({ special: 1 }, 1, { scoreMode: "total", totalScore: 5 })),
    ).toMatchObject({ scoreMode: "defense_type", totalScore: null });
  });
});

describe("raid record table drafts kept in the browser", () => {
  const saved = row("total_assault", { scores: { special: 30_000_000 }, rank: 20_000, rankStatus: "confirmed" });
  const empty = row("total_assault", null);

  it("keeps only the changed rows, with the record version each was typed over", () => {
    const stored = mergeStoredRaidTableDrafts(null, [saved], {
      88: draft({ special: 31_000_000 }, 20_000),
    });
    expect(stored).toEqual({
      version: 1,
      rows: { "88": { recordUpdatedAt: "2026-11-05T00:00:00.000Z", draft: draft({ special: 31_000_000 }, 20_000) } },
    });
    expect(mergeStoredRaidTableDrafts(null, [saved], { 88: initialRaidTableDraft(saved) })).toBeNull();
    expect(mergeStoredRaidTableDrafts(null, [saved], {})).toBeNull();
  });

  it("restores a kept row only while its record is the version it was typed over", () => {
    const typed = draft({ special: 31_000_000 }, 20_000);
    const stored = mergeStoredRaidTableDrafts(null, [saved], { 88: typed });
    expect(restoreRaidTableDrafts([saved], JSON.parse(JSON.stringify(stored)))).toEqual({ 88: typed });
    const changedSince = {
      ...saved,
      record: saved.record && { ...saved.record, updatedAt: "2026-11-06T00:00:00.000Z" },
    };
    expect(restoreRaidTableDrafts([changedSince], stored)).toEqual({});
    // A new row kept before the save has a record after it, so it is not restored either.
    const newRow = mergeStoredRaidTableDrafts(null, [empty], { 88: draft({ special: 1_000_000 }, 30_000) });
    expect(restoreRaidTableDrafts([empty], newRow)).toEqual({ 88: draft({ special: 1_000_000 }, 30_000) });
    expect(restoreRaidTableDrafts([saved], newRow)).toEqual({});
  });

  it("restores nothing from a malformed entry, and drops defense types the season does not score", () => {
    for (const stored of [
      null,
      "x",
      { version: 2, rows: {} },
      { version: 1, rows: { "88": { recordUpdatedAt: null } } },
    ]) {
      expect(restoreRaidTableDrafts([empty], stored)).toEqual({});
    }
    const badRank = {
      version: 1,
      rows: { "88": { recordUpdatedAt: null, draft: { ...draft({ special: 1 }, null), rank: "1" } } },
    };
    expect(restoreRaidTableDrafts([empty], badRank)).toEqual({});
    const extra = {
      version: 1,
      rows: {
        "88": {
          recordUpdatedAt: null,
          draft: draft({ special: 1_000_000, heavy: 5 } as RaidTableDraft["scores"], 30_000),
        },
      },
    };
    expect(restoreRaidTableDrafts([empty], extra)).toEqual({ 88: draft({ special: 1_000_000 }, 30_000) });
  });

  it("skips a row the table cannot edit", () => {
    const unavailable = { ...empty, unavailableRecordUid: "record-x" };
    const stored = {
      version: 1,
      rows: { "88": { recordUpdatedAt: null, draft: draft({ special: 1_000_000 }, 30_000) } },
    };
    expect(restoreRaidTableDrafts([unavailable], stored)).toEqual({});
  });
});

describe("raid record table drafts across tabs and saves", () => {
  const saved = row("total_assault", { scores: { special: 30_000_000 }, rank: 20_000, rankStatus: "confirmed" });
  const other = { ...row("total_assault", null), season: { ...season("total_assault"), seasonIndex: 87 } };
  const kept = (_seasonIndex: number, rank: number) => ({
    recordUpdatedAt: null,
    draft: draft({ special: 1_000_000 }, rank),
  });

  it("writes only the rows this table holds a draft for, keeping rows another tab kept", () => {
    const stored = { version: 1, rows: { "87": kept(87, 30_000) } };
    expect(mergeStoredRaidTableDrafts(stored, [saved, other], { 88: draft({ special: 31_000_000 }, 20_000) })).toEqual({
      version: 1,
      rows: {
        "87": kept(87, 30_000),
        "88": { recordUpdatedAt: "2026-11-05T00:00:00.000Z", draft: draft({ special: 31_000_000 }, 20_000) },
      },
    });
    // A row this table put back to what is saved is removed; the other tab's row stays.
    expect(
      mergeStoredRaidTableDrafts({ version: 1, rows: { "87": kept(87, 30_000), "88": kept(88, 1) } }, [saved, other], {
        88: initialRaidTableDraft(saved),
      }),
    ).toEqual({ version: 1, rows: { "87": kept(87, 30_000) } });
  });

  it("forgets only the given seasons, and nothing is left once every row is forgotten", () => {
    const stored = { version: 1, rows: { "87": kept(87, 30_000), "88": kept(88, 1) } };
    expect(forgetStoredRaidTableDrafts(stored, [88])).toEqual({ version: 1, rows: { "87": kept(87, 30_000) } });
    expect(forgetStoredRaidTableDrafts(stored, [87, 88])).toBeNull();
    expect(forgetStoredRaidTableDrafts("broken", [88])).toBeNull();
  });
});
