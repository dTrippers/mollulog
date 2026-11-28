import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  applyPostgresRaidRecordChartScore,
  createPostgresRaidRecord,
  listPostgresRaidRecords,
} from "~/db/postgres/raid-records";
import type { RaidRecord } from "~/domain/raid-record";
import type { RaidSchedule, RaidScheduleListItem } from "~/models/raid";
import { getAllRaidSchedules, getRaidSchedule } from "~/models/raid";
import { getRaidRecordSeasons } from "~/models/raid-record";
import { getNumberedKoreanRaidSchedules } from "~/models/raid-season.server";
import { getAllRaidRows, getFutureRaidRows } from "~/models/timeline-content.server";
import { handleRaidRecordFormAction } from "~/routes/$username.raids._components/raid-record-form.server";
import { action as chartScoreAction } from "~/routes/api.raid-records.chart-score";
import { loadRaidChartRecordContext, loadRaidRecordFormData } from "~/views/raid-records";
import {
  GL_TOTAL_ASSAULT_89,
  JP_TOTAL_ASSAULT_92,
  raidDetail,
  raidListItem,
  raidRow,
} from "../../helpers/raid-season-fixtures";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn(async () => ({ id: 7 })) }));
jest.mock("~/lib/observability.server", () => ({ getLogger: () => ({ error: jest.fn() }) }));
jest.mock("~/db/postgres/raid-records", () => ({
  applyPostgresRaidRecordChartScore: jest.fn(),
  countPostgresRaidRecords: jest.fn(),
  createPostgresRaidRecord: jest.fn(),
  deletePostgresRaidRecord: jest.fn(),
  getPostgresRaidRecordBySeason: jest.fn(async () => null),
  getPostgresRaidRecordByUid: jest.fn(async () => null),
  listPostgresRaidRecords: jest.fn(async () => []),
  savePostgresRaidRecordsBatch: jest.fn(),
  updatePostgresRaidRecord: jest.fn(),
}));
jest.mock("~/models/raid", () => ({ getAllRaidSchedules: jest.fn(), getRaidSchedule: jest.fn() }));
jest.mock("~/models/timeline-content.server", () => ({ getFutureRaidRows: jest.fn(), getAllRaidRows: jest.fn() }));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: jest.fn(async () => []) }));
jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(async () => []),
  getStudentGrowthVisualsBatch: jest.fn(),
  getStudentWeaponAvailability: jest.fn(),
}));

const env = {} as Env;
const ctx = {} as ExecutionContext;

function serveBaql(glSchedules: RaidScheduleListItem[], jpSchedules: RaidScheduleListItem[], details: RaidSchedule[]) {
  jest
    .mocked(getAllRaidSchedules)
    .mockImplementation(async (_env, _forceRefresh, options) => (options?.region === "jp" ? jpSchedules : glSchedules));
  jest
    .mocked(getRaidSchedule)
    .mockImplementation(async (_env, uid) => details.find((detail) => detail.uid === uid) ?? null);
}

// The forecast row of total assault #89 has started; BAQL lags and lists no `gl` schedule for it, only JP season 92.
const startedForecastRow = raidRow({
  uid: "raid-89",
  contentUid: "gl_total_assault_89",
  startAt: "2026-01-06T02:00:00Z",
  endAt: "2099-01-12T19:00:00Z",
  raidSeason: { raidType: "total_assault", jpRaidSeasonIndex: 92, glRaidSeasonIndex: 89 },
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getFutureRaidRows).mockResolvedValue([startedForecastRow]);
  jest.mocked(getAllRaidRows).mockResolvedValue([startedForecastRow]);
  serveBaql([], [raidListItem(JP_TOTAL_ASSAULT_92)], [raidDetail(JP_TOTAL_ASSAULT_92)]);
});

describe("a started forecast season BAQL does not list yet", () => {
  it("is a numbered Korean season on the season pages", async () => {
    await expect(getNumberedKoreanRaidSchedules(env)).resolves.toEqual([
      expect.objectContaining({ raidType: "total_assault", seasonIndex: 89, startAt: "2026-01-06T02:00:00.000Z" }),
    ]);
  });

  it("is not a season the record form offers", async () => {
    const formData = await loadRaidRecordFormData(env, 7, ["kr"]);

    expect(formData.seasonsByServer.kr).toEqual([]);
  });

  it("is not a season the record form saves to", async () => {
    const result = (await handleRaidRecordFormAction({
      env,
      ctx,
      request: new Request("https://mollulog.net/@sensei/raids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "save",
          server: "kr",
          raidType: "total_assault",
          seasonIndex: 89,
          scores: [{ defenseType: "special", score: 40_000_000 }],
          rank: 1200,
          memo: "",
          parties: [],
        }),
      }),
      userId: 7,
      username: "sensei",
      existing: null,
    })) as unknown as { data: unknown; init: ResponseInit | null };

    expect(result.init?.status).toBe(400);
    expect(result.data).toMatchObject({ ok: false, error: { field: "season" } });
    expect(createPostgresRaidRecord).not.toHaveBeenCalled();
  });

  it("takes no score on its season page, and the score API neither accepts it nor reads the raid rows", async () => {
    const context = await loadRaidChartRecordContext(env, { id: 7, username: "sensei" }, "total_assault", 89, ctx);
    expect(context?.kr).toMatchObject({ seasonIndex: 89, started: false, scoreDefenseTypes: [] });
    // The page itself reads the forecast season for its JP record; the score API must not.
    jest.mocked(getFutureRaidRows).mockClear();
    jest.mocked(getAllRaidRows).mockClear();

    const result = (await chartScoreAction({
      request: new Request("https://mollulog.net/api/raid-records/chart-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server: "kr",
          raidType: "total_assault",
          seasonIndex: 89,
          defenseType: "special",
          score: 40_000_000,
        }),
      }),
      context: { cloudflare: { env, ctx } },
      params: {},
    } as never)) as unknown as { data: unknown; init: ResponseInit | null };

    expect(result.init?.status).toBe(400);
    expect(applyPostgresRaidRecordChartScore).not.toHaveBeenCalled();
    expect(getFutureRaidRows).not.toHaveBeenCalled();
    expect(getAllRaidRows).not.toHaveBeenCalled();
  });

  it("is offered once BAQL lists its gl schedule", async () => {
    const started89 = { ...raidListItem(GL_TOTAL_ASSAULT_89), startAt: startedForecastRow.startAt };
    serveBaql([started89], [raidListItem(JP_TOTAL_ASSAULT_92)], []);

    const formData = await loadRaidRecordFormData(env, 7, ["kr"]);

    expect(formData.seasonsByServer.kr.map(({ raidType, seasonIndex }) => [raidType, seasonIndex])).toEqual([
      ["total_assault", 89],
    ]);
  });
});

describe("the season page's record context of a forecast season", () => {
  const jpRecordOf92: RaidRecord = {
    uid: "record-jp-92",
    userId: 7,
    server: "jp",
    raidType: "total_assault",
    seasonIndex: 92,
    scoreMode: "defense_type",
    scores: [{ defenseType: "special", score: 30_000_000 }],
    totalScore: null,
    rank: 500,
    rankRecordedAt: "2026-09-09T00:00:00.000Z",
    memo: "",
    parties: [],
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
  };
  const user = { id: 7, username: "sensei" };
  const jpView = {
    server: "jp",
    seasonIndex: 92,
    started: true,
    scoreDefenseTypes: ["special"],
    record: expect.objectContaining({ uid: "record-jp-92" }),
  };

  beforeEach(() => {
    jest.mocked(listPostgresRaidRecords).mockResolvedValue([jpRecordOf92]);
  });

  it("shows the Sensei's JP record of the forecast's JP season once BAQL drops the gl schedule", async () => {
    await expect(loadRaidChartRecordContext(env, user, "total_assault", 89, ctx)).resolves.toEqual({
      username: "sensei",
      raidType: "total_assault",
      kr: { server: "kr", seasonIndex: 89, started: false, scoreDefenseTypes: [], record: null },
      jp: jpView,
    });
  });

  it("shows the same JP record as before while BAQL lists the gl schedule, without reading the raid rows", async () => {
    const started89 = { ...raidListItem(GL_TOTAL_ASSAULT_89), startAt: startedForecastRow.startAt };
    serveBaql([started89], [raidListItem(JP_TOTAL_ASSAULT_92)], []);

    await expect(loadRaidChartRecordContext(env, user, "total_assault", 89, ctx)).resolves.toEqual({
      username: "sensei",
      raidType: "total_assault",
      kr: expect.objectContaining({ server: "kr", seasonIndex: 89, started: true, record: null }),
      jp: jpView,
    });
    expect(getFutureRaidRows).not.toHaveBeenCalled();
  });
});

describe("a JP season's Korean counterpart number", () => {
  it("comes from BAQL's gl schedules for every path that keys a record, and from a forecast only for display", async () => {
    const jpSeasonOf92 = (seasons: Awaited<ReturnType<typeof getRaidRecordSeasons>>) =>
      seasons.find((season) => season.raidType === "total_assault" && season.seasonIndex === 92);

    expect(jpSeasonOf92(await getRaidRecordSeasons(env, "jp"))?.counterpartSeasonIndex).toBeNull();
    expect(getFutureRaidRows).not.toHaveBeenCalled();
    expect(
      jpSeasonOf92(await getRaidRecordSeasons(env, "jp", { forecastCounterparts: true }))?.counterpartSeasonIndex,
    ).toBe(89);
  });
});
