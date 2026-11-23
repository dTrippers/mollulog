import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { InvalidRaidRecordError, type RaidRecord } from "~/domain/raid-record";
import { Terrain } from "~/graphql/graphql";
import type { RaidRecordSeason, RaidRecordTableRowInput } from "~/models/raid-record";

const mockGetSeasons = jest.fn<(env: unknown, server: string) => Promise<RaidRecordSeason[]>>();
const mockListRecords = jest.fn<() => Promise<RaidRecord[]>>();
const mockSaveTable = jest.fn<(env: unknown, userId: number, rows: RaidRecordTableRowInput[]) => Promise<void>>();
const mockCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDelete = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const mockStudentInfo = jest.fn<() => Promise<Map<string, unknown>>>();
const mockLogError = jest.fn();

jest.mock("~/models/raid-record", () => {
  const actual = jest.requireActual<typeof import("~/models/raid-record")>("~/models/raid-record");
  return {
    ...actual,
    getRaidRecordSeasons: (...args: [unknown, string]) => mockGetSeasons(...args),
    listRaidRecords: () => mockListRecords(),
    saveRaidRecordTable: (...args: [unknown, number, RaidRecordTableRowInput[]]) => mockSaveTable(...args),
    createRaidRecord: (...args: unknown[]) => mockCreate(...args),
    updateRaidRecord: (...args: unknown[]) => mockUpdate(...args),
    deleteRaidRecord: (...args: unknown[]) => mockDelete(...args),
    getRaidRecordStudentInfo: () => mockStudentInfo(),
  };
});
jest.mock("~/lib/observability.server", () => ({
  getLogger: () => ({ error: (...args: unknown[]) => mockLogError(...args) }),
}));

import {
  RaidRecordBatchStaleError,
  RaidRecordScoreAboveMaxError,
  RaidRecordSeasonConflictError,
  RaidRecordTableScoresAboveMaxError,
  RaidRecordTotalScoreAboveMaxError,
} from "~/models/raid-record";
import { handleRaidRecordFormAction } from "~/routes/$username.raids._components/raid-record-form.server";
import { handleRaidRecordTableAction } from "~/routes/$username.raids._components/raid-record-table.server";

const env = {} as Env;
const ctx = {} as ExecutionContext;
const USER_ID = 7;

function season(seasonIndex: number, startAt = "2026-01-01T00:00:00.000Z"): RaidRecordSeason {
  return {
    server: "kr",
    raidType: "elimination",
    seasonIndex,
    boss: { uid: "hod", name: "호드" },
    terrain: Terrain.Indoor,
    startAt,
    endAt: null,
    displayDefenseTypes: [],
    scoreDefenseTypes: [
      { defenseType: "heavy", maxDifficulty: "torment" },
      { defenseType: "elastic", maxDifficulty: "torment" },
    ],
    counterpartSeasonIndex: seasonIndex,
    rankConfirmAt: null,
  };
}

function record(seasonIndex: number, uid: string): RaidRecord {
  return {
    uid,
    userId: USER_ID,
    server: "kr",
    raidType: "elimination",
    seasonIndex,
    scoreMode: "defense_type",
    scores: [{ defenseType: "heavy", score: 40_000_000 }],
    totalScore: null,
    rank: 1200,
    rankRecordedAt: "2026-02-01T00:00:00.000Z",
    memo: "",
    parties: [],
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
}

function request(body: unknown) {
  return new Request("https://mollulog.net/@sensei/raids", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

type ActionResult = Response | { data: unknown; init: ResponseInit | null };

function read(result: ActionResult) {
  if (result instanceof Response) return { status: result.status, location: result.headers.get("Location") };
  return { status: result.init?.status ?? 200, body: result.data };
}

beforeEach(() => {
  mockGetSeasons.mockReset().mockResolvedValue([season(35), season(34), season(36, "2999-01-01T00:00:00.000Z")]);
  mockListRecords.mockReset().mockResolvedValue([record(35, "record-35")]);
  mockSaveTable.mockReset().mockResolvedValue(undefined);
  mockCreate.mockReset().mockResolvedValue(record(34, "record-34"));
  mockUpdate.mockReset().mockResolvedValue(record(35, "record-35"));
  mockDelete.mockReset().mockResolvedValue(true);
  mockStudentInfo.mockReset().mockResolvedValue(new Map());
  mockLogError.mockReset();
});

describe("raid record table action", () => {
  async function submit(body: unknown) {
    return read(
      (await handleRaidRecordTableAction({
        env,
        ctx,
        request: request(body),
        userId: USER_ID,
        username: "sensei",
      })) as ActionResult,
    );
  }

  const tableBody = (rows: unknown[]) => ({ server: "kr", raidType: "elimination", rows });

  it("saves every changed row and returns to the list", async () => {
    await expect(
      submit(
        tableBody([
          {
            seasonIndex: 35,
            recordUid: "record-35",
            recordUpdatedAt: "2026-02-01T00:00:00.000Z",
            scores: [{ defenseType: "heavy", score: 41_000_000 }],
            rank: 1100,
          },
          { seasonIndex: 34, recordUid: null, scores: [{ defenseType: "elastic", score: "39,000,000" }], rank: "900" },
        ]),
      ),
    ).resolves.toEqual({ status: 200, body: { ok: true, redirectTo: "/@sensei/raids?server=kr" } });

    const rows = mockSaveTable.mock.calls[0][2];
    expect(rows.map((row) => [row.season.seasonIndex, row.current?.uid ?? null, row.scores, row.rank])).toEqual([
      [35, "record-35", [{ defenseType: "heavy", score: 41_000_000 }], 1100],
      [34, null, [{ defenseType: "elastic", score: 39_000_000 }], 900],
    ]);
    // A row without a score mode shows its scores, as before the total existed.
    expect(rows.map((row) => [row.scoreMode, row.totalScore])).toEqual([
      ["defense_type", null],
      ["defense_type", null],
    ]);
  });

  it("saves a row that shows its total alone, and asks for the total it shows", async () => {
    await expect(
      submit(
        tableBody([
          { seasonIndex: 34, recordUid: null, scoreMode: "total", scores: [], totalScore: "90,000,000", rank: 900 },
        ]),
      ),
    ).resolves.toMatchObject({ status: 200, body: { ok: true } });
    expect(mockSaveTable.mock.calls[0][2][0]).toMatchObject({ scoreMode: "total", scores: [], totalScore: 90_000_000 });

    await expect(
      submit(
        tableBody([{ seasonIndex: 34, recordUid: null, scoreMode: "total", scores: [], totalScore: null, rank: 900 }]),
      ),
    ).resolves.toEqual({
      status: 400,
      body: {
        ok: false,
        message: null,
        rowErrors: [{ seasonIndex: 34, field: "totalScore", message: "합산 점수를 입력해 주세요." }],
      },
    });
    expect(mockSaveTable).toHaveBeenCalledTimes(1);
  });

  it("returns every row error at once and saves nothing", async () => {
    await expect(
      submit(
        tableBody([
          {
            seasonIndex: 35,
            recordUid: "record-35",
            recordUpdatedAt: "2026-02-01T00:00:00.000Z",
            scores: [],
            rank: null,
          },
          { seasonIndex: 34, recordUid: null, scores: [{ defenseType: "light", score: 1 }], rank: -1 },
        ]),
      ),
    ).resolves.toEqual({
      status: 400,
      body: {
        ok: false,
        message: null,
        rowErrors: [
          { seasonIndex: 35, field: "score", message: "방어 타입 점수를 하나 이상 입력해 주세요." },
          { seasonIndex: 35, field: "rank", message: "순위를 입력해 주세요." },
          { seasonIndex: 34, field: "score", message: "이 시즌에 없는 방어 타입의 점수예요." },
          { seasonIndex: 34, field: "rank", message: "순위를 확인해 주세요." },
        ],
      },
    });
    expect(mockSaveTable).not.toHaveBeenCalled();
  });

  it("asks for a reload when a row's record is not the one the table showed", async () => {
    const stale = {
      status: 409,
      body: { ok: false, message: "다른 곳에서 기록이 바뀌었어요. 새로고침한 뒤 다시 입력해 주세요.", rowErrors: [] },
    };
    await expect(
      submit(tableBody([{ seasonIndex: 35, recordUid: null, scores: [{ defenseType: "heavy", score: 1 }], rank: 1 }])),
    ).resolves.toEqual(stale);
    expect(mockSaveTable).not.toHaveBeenCalled();

    // The same record, changed elsewhere since the table read it.
    await expect(
      submit(
        tableBody([
          {
            seasonIndex: 35,
            recordUid: "record-35",
            recordUpdatedAt: "2026-01-31T00:00:00.000Z",
            scores: [{ defenseType: "heavy", score: 1 }],
            rank: 1,
          },
        ]),
      ),
    ).resolves.toEqual(stale);
    expect(mockSaveTable).not.toHaveBeenCalled();

    mockSaveTable.mockRejectedValue(new RaidRecordBatchStaleError());
    await expect(
      submit(tableBody([{ seasonIndex: 34, recordUid: null, scores: [{ defenseType: "heavy", score: 1 }], rank: 1 }])),
    ).resolves.toEqual(stale);
  });

  it("marks each score cell above its season maximum", async () => {
    mockSaveTable.mockRejectedValue(
      new RaidRecordTableScoresAboveMaxError([
        { seasonIndex: 35, error: new RaidRecordScoreAboveMaxError("heavy", 40_348_000) },
        { seasonIndex: 34, error: new RaidRecordScoreAboveMaxError("elastic", 40_000_000) },
      ]),
    );
    const result = await submit(
      tableBody([
        {
          seasonIndex: 35,
          recordUid: "record-35",
          recordUpdatedAt: "2026-02-01T00:00:00.000Z",
          scores: [{ defenseType: "heavy", score: 50_000_000 }],
          rank: 1,
        },
        { seasonIndex: 34, recordUid: null, scores: [{ defenseType: "elastic", score: 50_000_000 }], rank: 1 },
      ]),
    );
    expect(result).toEqual({
      status: 400,
      body: {
        ok: false,
        message: null,
        rowErrors: [
          {
            seasonIndex: 35,
            field: "score",
            defenseType: "heavy",
            message: "최대 점수(40,348,000)보다 높아요.",
          },
          {
            seasonIndex: 34,
            field: "score",
            defenseType: "elastic",
            message: "최대 점수(40,000,000)보다 높아요.",
          },
        ],
      },
    });
  });

  it("rejects a malformed request, a season that has not started, and a repeated season", async () => {
    const invalid = { status: 400, body: { ok: false, message: "요청을 확인하지 못했어요.", rowErrors: [] } };
    await expect(submit("{")).resolves.toEqual(invalid);
    await expect(submit({ server: "kr", raidType: "joint", rows: [] })).resolves.toEqual(invalid);
    await expect(submit(tableBody([]))).resolves.toEqual({
      status: 400,
      body: { ok: false, message: "저장할 기록이 없어요.", rowErrors: [] },
    });
    await expect(submit(tableBody([{ seasonIndex: 36, recordUid: null, scores: [], rank: 1 }]))).resolves.toEqual({
      status: 400,
      body: { ok: false, message: "#36은 기록할 수 있는 시즌이 아니에요.", rowErrors: [] },
    });
    await expect(
      submit(
        tableBody([
          { seasonIndex: 34, recordUid: null, scores: [], rank: 1 },
          { seasonIndex: 34, recordUid: null, scores: [], rank: 1 },
        ]),
      ),
    ).resolves.toEqual(invalid);
  });

  it("hides an unexpected failure behind a retry message", async () => {
    mockSaveTable.mockRejectedValue(new Error("connection reset"));
    await expect(
      submit(tableBody([{ seasonIndex: 34, recordUid: null, scores: [{ defenseType: "heavy", score: 1 }], rank: 1 }])),
    ).resolves.toEqual({
      status: 500,
      body: { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도해 주세요.", rowErrors: [] },
    });
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});

describe("raid record form action", () => {
  async function submit(body: unknown, existing: RaidRecord | null = null) {
    return read(
      (await handleRaidRecordFormAction({
        env,
        ctx,
        request: request(body),
        userId: USER_ID,
        username: "sensei",
        existing,
      })) as ActionResult,
    );
  }

  const saveBody = (overrides: Record<string, unknown> = {}) => ({
    intent: "save",
    server: "kr",
    raidType: "elimination",
    seasonIndex: 34,
    scores: [{ defenseType: "heavy", score: 40_000_000 }],
    rank: 1200,
    memo: " 메모 ",
    parties: [],
    ...overrides,
  });

  it("creates a record and returns to the list", async () => {
    await expect(submit(saveBody())).resolves.toEqual({
      status: 302,
      location: "/@sensei/raids?server=kr",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      env,
      USER_ID,
      season(34),
      {
        scoreMode: "defense_type",
        scores: [{ defenseType: "heavy", score: 40_000_000 }],
        totalScore: null,
        rank: 1200,
        memo: "메모",
        parties: [],
      },
      { ctx },
    );
  });

  it("saves a total shown alone together with the scores it keeps", async () => {
    await expect(
      submit(
        saveBody({
          scoreMode: "total",
          totalScore: "90,000,000",
          scores: [{ defenseType: "heavy", score: 40_000_000 }],
        }),
      ),
    ).resolves.toMatchObject({ status: 302 });
    expect(mockCreate.mock.calls[0][3]).toMatchObject({
      scoreMode: "total",
      scores: [{ defenseType: "heavy", score: 40_000_000 }],
      totalScore: 90_000_000,
    });

    // A record that shows its total needs no score per defense type.
    await expect(submit(saveBody({ scoreMode: "total", totalScore: 90_000_000, scores: [] }))).resolves.toMatchObject({
      status: 302,
    });
  });

  it("asks for the total a record shows, and checks it against the sum of the maximums", async () => {
    await expect(submit(saveBody({ scoreMode: "total", totalScore: null }))).resolves.toEqual({
      status: 400,
      body: { ok: false, error: { field: "totalScore", message: "합산 점수를 입력해 주세요." } },
    });
    await expect(submit(saveBody({ scoreMode: "total", totalScore: 0 }))).resolves.toEqual({
      status: 400,
      body: { ok: false, error: { field: "totalScore", message: "합산 점수를 확인해 주세요." } },
    });
    await expect(submit(saveBody({ scoreMode: "bogus" }))).resolves.toEqual({
      status: 400,
      body: { ok: false, error: { field: "score", message: "점수 입력 방식을 확인해 주세요." } },
    });
    // The season's two torment defense types top out at 40,348,000 each.
    mockCreate.mockRejectedValueOnce(new RaidRecordTotalScoreAboveMaxError(80_696_000));
    await expect(submit(saveBody({ scoreMode: "total", totalScore: 80_696_001 }))).resolves.toEqual({
      status: 400,
      body: {
        ok: false,
        error: { field: "totalScore", message: "최대 합산 점수(80,696,000)보다 높아요." },
      },
    });
  });

  it("names the field each error belongs to", async () => {
    await expect(submit(saveBody({ scores: [] }))).resolves.toEqual({
      status: 400,
      body: { ok: false, error: { field: "score", message: "방어 타입 점수를 하나 이상 입력해 주세요." } },
    });
    await expect(submit(saveBody({ rank: "" }))).resolves.toEqual({
      status: 400,
      body: { ok: false, error: { field: "rank", message: "순위를 입력해 주세요." } },
    });
    await expect(submit(saveBody({ seasonIndex: 36 }))).resolves.toEqual({
      status: 400,
      body: { ok: false, error: { field: "season", message: "기록할 수 있는 시즌이 아니에요." } },
    });
    await expect(submit(saveBody({ parties: {} }))).resolves.toEqual({
      status: 400,
      body: { ok: false, error: { field: "parties", message: "편성을 확인해 주세요." } },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("points a season that already has a record and a score above the maximum to their fields", async () => {
    mockCreate.mockRejectedValueOnce(new RaidRecordSeasonConflictError());
    await expect(submit(saveBody())).resolves.toEqual({
      status: 409,
      body: { ok: false, error: { field: "season", message: "이 시즌에는 이미 기록이 있어요." } },
    });
    mockCreate.mockRejectedValueOnce(new RaidRecordScoreAboveMaxError("heavy", 40_348_000));
    await expect(submit(saveBody())).resolves.toEqual({
      status: 400,
      body: {
        ok: false,
        error: {
          field: "score",
          message: "최대 점수(40,348,000)보다 높아요.",
          defenseType: "heavy",
        },
      },
    });
    mockCreate.mockRejectedValueOnce(new InvalidRaidRecordError("점수를 확인해 주세요."));
    await expect(submit(saveBody())).resolves.toEqual({
      status: 400,
      body: { ok: false, error: { field: "form", message: "점수를 확인해 주세요." } },
    });
  });

  it("does not move a record to another season", async () => {
    await expect(submit(saveBody({ seasonIndex: 34 }), record(35, "record-35"))).resolves.toEqual({
      status: 400,
      body: { ok: false, error: { field: "season", message: "기록의 서버와 시즌은 바꿀 수 없어요." } },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates an existing record and reports one that disappeared", async () => {
    await expect(submit(saveBody({ seasonIndex: 35 }), record(35, "record-35"))).resolves.toMatchObject({
      status: 302,
    });
    expect(mockUpdate.mock.calls[0][2]).toBe("record-35");

    mockUpdate.mockResolvedValueOnce(null);
    await expect(submit(saveBody({ seasonIndex: 35 }), record(35, "record-35"))).resolves.toEqual({
      status: 404,
      body: { ok: false, error: { field: "form", message: "기록을 찾을 수 없어요. 목록에서 다시 열어 주세요." } },
    });
  });

  it("deletes only a record the edit screen opened", async () => {
    await expect(submit({ intent: "delete" })).resolves.toMatchObject({ status: 400 });
    expect(mockDelete).not.toHaveBeenCalled();

    await expect(submit({ intent: "delete" }, record(35, "record-35"))).resolves.toEqual({
      status: 302,
      location: "/@sensei/raids?server=kr",
    });
    expect(mockDelete).toHaveBeenCalledWith(env, USER_ID, "record-35", { ctx });
  });

  it("does not save when the student catalog cannot be read", async () => {
    mockStudentInfo.mockRejectedValue(new Error("catalog down"));
    await expect(submit(saveBody())).resolves.toEqual({
      status: 503,
      body: {
        ok: false,
        error: { field: "form", message: "학생 정보를 불러오지 못해 저장하지 못했어요. 잠시 후 다시 시도해 주세요." },
      },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
