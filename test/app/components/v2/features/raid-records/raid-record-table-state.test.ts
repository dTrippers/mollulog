import { describe, expect, it } from "@jest/globals";
import {
  initialRaidTableDraft,
  isRaidTableRowChanged,
  type RaidTableDraft,
  raidTableErrorLabel,
  raidTableRowErrors,
  raidTableRowStatus,
  toRaidTableSubmissionRow,
} from "~/components/v2/features/raid-records/raid-record-table-state";
import type { RaidRecordRankStatus } from "~/domain/raid-record";
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
    rankSeasonIndex: null,
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
  record: { scores: Record<string, number>; rank: number | null; rankStatus: RaidRecordRankStatus } | null,
): RaidRecordTableRowView {
  const rowSeason = season(raidType);
  return {
    season: rowSeason,
    record: record && {
      uid: "record-1",
      scores: rowSeason.scoreDefenseTypes.map(({ defenseType }) => ({
        defenseType,
        score: record.scores[defenseType] ?? null,
        difficulty: null,
        clearTimeMs: null,
      })),
      rank: record.rank,
      rankStatus: record.rankStatus,
    },
    unavailableRecordUid: null,
  };
}

function draft(scores: RaidTableDraft["scores"], rank: number | null): RaidTableDraft {
  return { scores, rank };
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
      { field: "score", defenseType: "heavy", message: "이 시즌에서 달성할 수 있는 최대 점수(40,348,000)보다 높아요." },
      { field: "score", defenseType: "light", message: "이 시즌에서 달성할 수 있는 최대 점수(40,000,000)보다 높아요." },
    ]);
    // A defense type the rank data has no maximum for is not checked.
    expect(raidTableRowErrors(row("elimination", null), draft({ heavy: 50_000_000 }, 1200), { heavy: null })).toEqual(
      [],
    );
  });

  it("labels an error by season and field", () => {
    const tableRow = row("elimination", null);
    expect(raidTableErrorLabel(tableRow, { field: "rank", message: "" })).toBe("#35 순위");
    expect(raidTableErrorLabel(tableRow, { field: "score", defenseType: "heavy", message: "" })).toBe("#35 점수");
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
      scores: [
        { defenseType: "heavy", score: 40_000_000 },
        { defenseType: "light", score: 27_000_000 },
      ],
      rank: 1100,
    });
    expect(() => toRaidTableSubmissionRow(saved, draft({ heavy: 1 }, null))).toThrow();
  });
});
