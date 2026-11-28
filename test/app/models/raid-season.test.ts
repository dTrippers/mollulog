import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { RaidSchedule, RaidScheduleListItem } from "~/models/raid";
import { getAllRaidSchedules, getRaidSchedule, warmRaidCache } from "~/models/raid";
import type { TimelineRaidRow } from "~/models/timeline-content.server";
import { getAllRaidRows, getFutureRaidRows } from "~/models/timeline-content.server";
import {
  GL_TOTAL_ASSAULT_89,
  GL_TOTAL_ASSAULT_91,
  GL_UNLIMIT_31,
  JP_TOTAL_ASSAULT_92,
  JP_TOTAL_ASSAULT_94,
  JP_UNLIMIT_31,
  OFFICIAL_GL_TOTAL_ASSAULT_89_OF_JP_95,
  raidDetail,
  raidListItem,
  raidRow,
} from "../../helpers/raid-season-fixtures";

jest.mock("~/models/timeline-content.server", () => ({
  getFutureRaidRows: jest.fn(),
  getAllRaidRows: jest.fn(),
}));
jest.mock("~/models/raid", () => ({
  getAllRaidSchedules: jest.fn(),
  getRaidSchedule: jest.fn(),
  warmRaidCache: jest.fn(),
}));
jest.mock("~/db/postgres/raid-records", () => ({}));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: jest.fn() }));
jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
  getStudentGrowthVisualsBatch: jest.fn(),
  getStudentWeaponAvailability: jest.fn(),
}));

import { getRaidRecordSeasons } from "~/models/raid-record";
import {
  getKoreanRaidScheduleByTypeAndSeason,
  getKoreanRaidScheduleByUid,
  getKoreanRaidSchedules,
  getNumberedKoreanRaidSchedules,
  getRaidRowSeasonPages,
  loadKoreanRaidSeasons,
  warmKoreanRaidCache,
} from "~/models/raid-season.server";

const env = {} as Env;
const mockedGetFutureRaidRows = jest.mocked(getFutureRaidRows);
const mockedGetAllRaidRows = jest.mocked(getAllRaidRows);
const mockedGetAllRaidSchedules = jest.mocked(getAllRaidSchedules);
const mockedGetRaidSchedule = jest.mocked(getRaidSchedule);

const GL_RAWS = [GL_TOTAL_ASSAULT_89, GL_UNLIMIT_31, GL_TOTAL_ASSAULT_91];
const JP_RAWS = [JP_TOTAL_ASSAULT_92, JP_UNLIMIT_31, JP_TOTAL_ASSAULT_94];

/** BAQL as the mocks serve it. */
function serveBaql(glSchedules: RaidScheduleListItem[], jpSchedules: RaidScheduleListItem[], details: RaidSchedule[]) {
  mockedGetAllRaidSchedules.mockImplementation(async (_env, _forceRefresh, options) =>
    options?.region === "jp" ? jpSchedules : glSchedules,
  );
  const detailsByUid = new Map(details.map((detail) => [detail.uid, detail]));
  mockedGetRaidSchedule.mockImplementation(async (_env, uid) => detailsByUid.get(uid) ?? null);
}

/** BAQL after it lists an official #89 of another JP season than the forecast row of #89 predicted. */
function serveBaqlWithOfficial89OfAnotherSeason() {
  serveBaql(
    [raidListItem(OFFICIAL_GL_TOTAL_ASSAULT_89_OF_JP_95)],
    JP_RAWS.map(raidListItem),
    [OFFICIAL_GL_TOTAL_ASSAULT_89_OF_JP_95, ...JP_RAWS].map(raidDetail),
  );
}

function serveBaqlToday() {
  serveBaql(GL_RAWS.map(raidListItem), JP_RAWS.map(raidListItem), [...GL_RAWS, ...JP_RAWS].map(raidDetail));
}

function serveBaqlWithoutForecasts() {
  serveBaql([], JP_RAWS.map(raidListItem), JP_RAWS.map(raidDetail));
}

function rowOf89(overrides: Partial<Parameters<typeof raidRow>[0]> = {}): TimelineRaidRow {
  return raidRow({
    uid: "gl_total_assault_89",
    contentUid: "gl_total_assault_89",
    startAt: "2026-12-22T02:00:00Z",
    endAt: "2026-12-28T19:00:00Z",
    raidSeason: { raidType: "total_assault", jpRaidSeasonIndex: 92, glRaidSeasonIndex: 89 },
    ...overrides,
  });
}

function rowOfNightmare(glRaidSeasonIndex: number | null = 91): TimelineRaidRow {
  return raidRow({
    uid: "raid-nightmare",
    contentUid: "gl_total_assault_91",
    startAt: "2027-02-23T02:00:00Z",
    endAt: "2027-03-01T19:00:00Z",
    raidSeason: { raidType: "total_assault", jpRaidSeasonIndex: 94, glRaidSeasonIndex },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetFutureRaidRows.mockResolvedValue([rowOf89(), rowOfNightmare()]);
  mockedGetAllRaidRows.mockResolvedValue([rowOf89(), rowOfNightmare()]);
});

describe("Korean-server season lists", () => {
  it("are BAQL's gl list while BAQL still lists every forecast", async () => {
    serveBaqlToday();

    await expect(getKoreanRaidSchedules(env)).resolves.toEqual(GL_RAWS.map(raidListItem));
    await expect(getNumberedKoreanRaidSchedules(env)).resolves.toEqual(GL_RAWS.map(raidListItem));
  });

  it("add the forecast seasons once BAQL drops their gl schedules", async () => {
    serveBaqlWithoutForecasts();
    mockedGetFutureRaidRows.mockResolvedValue([rowOf89(), rowOfNightmare(null)]);

    const all = await getKoreanRaidSchedules(env);
    expect(all.map((schedule) => [schedule.uid, schedule.seasonIndex, schedule.raidBoss.uid])).toEqual([
      ["jp_total_assault_92", 89, "perorodzilla"],
      ["jp_total_assault_94", null, "nightmare"],
    ]);

    const numbered = await getNumberedKoreanRaidSchedules(env);
    expect(numbered).toEqual([
      expect.objectContaining({
        uid: "jp_total_assault_92",
        raidType: "total_assault",
        seasonIndex: 89,
        region: "gl",
        startAt: "2026-12-22T02:00:00.000Z",
        endAt: "2026-12-28T19:00:00.000Z",
        jpSchedule: { uid: "jp_total_assault_92", seasonIndex: 92, startAt: "2026-09-02T02:00:00.000Z" },
      }),
    ]);
  });
});

describe("getKoreanRaidScheduleByTypeAndSeason", () => {
  it("returns BAQL's gl season while it exists, without reading raid rows", async () => {
    serveBaqlToday();

    await expect(getKoreanRaidScheduleByTypeAndSeason(env, "total_assault", 89)).resolves.toEqual(
      raidDetail(GL_TOTAL_ASSAULT_89),
    );
    expect(mockedGetFutureRaidRows).not.toHaveBeenCalled();
  });

  it("returns the forecast season of that number from its JP schedule once BAQL has no gl season", async () => {
    serveBaqlWithoutForecasts();

    const season = await getKoreanRaidScheduleByTypeAndSeason(env, "total_assault", "91");

    expect(season).toEqual({
      ...raidDetail(JP_TOTAL_ASSAULT_94),
      region: "gl",
      seasonIndex: 91,
      startAt: "2027-02-23T02:00:00.000Z",
      endAt: "2027-03-01T19:00:00.000Z",
      raidBoss: { uid: "nightmare", name: "악몽 열차", nameJa: "악몽 열차 (ja)" },
      jpSchedule: { uid: "jp_total_assault_94", seasonIndex: 94, startAt: "2026-11-04T02:00:00.000Z" },
    });
  });

  it("reads BAQL's gl list once when the number is a forecast season's", async () => {
    serveBaqlWithoutForecasts();

    await expect(getKoreanRaidScheduleByTypeAndSeason(env, "total_assault", 89)).resolves.toMatchObject({
      uid: "jp_total_assault_92",
      seasonIndex: 89,
    });
    expect(mockedGetAllRaidSchedules.mock.calls.map(([, , options]) => options?.region ?? "gl")).toEqual(["gl", "jp"]);
  });

  it("finds no season for a number no forecast holds, another raid type, or a number two forecasts claim", async () => {
    serveBaqlWithoutForecasts();

    await expect(getKoreanRaidScheduleByTypeAndSeason(env, "total_assault", 90)).resolves.toBeNull();
    await expect(getKoreanRaidScheduleByTypeAndSeason(env, "elimination", 89)).resolves.toBeNull();
    await expect(getKoreanRaidScheduleByTypeAndSeason(env, "total_assault", "x")).resolves.toBeNull();

    mockedGetFutureRaidRows.mockResolvedValue([rowOf89(), rowOfNightmare(89)]);
    await expect(getKoreanRaidScheduleByTypeAndSeason(env, "total_assault", 89)).resolves.toBeNull();
  });

  it("lets a gl season keep its number when a forecast predicted the same one", async () => {
    serveBaql(
      [raidListItem(GL_TOTAL_ASSAULT_89)],
      JP_RAWS.map(raidListItem),
      [GL_TOTAL_ASSAULT_89, ...JP_RAWS].map(raidDetail),
    );
    mockedGetFutureRaidRows.mockResolvedValue([rowOf89(), rowOfNightmare(89)]);

    await expect(getKoreanRaidScheduleByTypeAndSeason(env, "total_assault", 89)).resolves.toEqual(
      raidDetail(GL_TOTAL_ASSAULT_89),
    );
    await expect(getNumberedKoreanRaidSchedules(env)).resolves.toEqual([raidListItem(GL_TOTAL_ASSAULT_89)]);
  });
});

describe("getKoreanRaidScheduleByUid", () => {
  it("resolves the JP uid a forecast season is listed by to that forecast season", async () => {
    serveBaqlWithoutForecasts();

    await expect(getKoreanRaidScheduleByUid(env, "jp_total_assault_92")).resolves.toMatchObject({
      uid: "jp_total_assault_92",
      region: "gl",
      seasonIndex: 89,
      startAt: "2026-12-22T02:00:00.000Z",
    });
  });

  it("resolves a forecast season's JP uid to the gl schedule BAQL lists for that JP season later", async () => {
    // A compare link issued while #89 was a forecast season, opened after BAQL lists gl #89 again.
    serveBaqlToday();

    await expect(getKoreanRaidScheduleByUid(env, "jp_total_assault_92")).resolves.toEqual(
      raidDetail(GL_TOTAL_ASSAULT_89),
    );
  });

  it("returns BAQL's schedule as before for a gl uid, a JP uid with neither a gl nor a forecast season, or none", async () => {
    serveBaqlToday();
    mockedGetFutureRaidRows.mockResolvedValue([]);

    await expect(getKoreanRaidScheduleByUid(env, "gl_total_assault_89")).resolves.toEqual(
      raidDetail(GL_TOTAL_ASSAULT_89),
    );
    serveBaql([], JP_RAWS.map(raidListItem), JP_RAWS.map(raidDetail));
    await expect(getKoreanRaidScheduleByUid(env, "jp_unlimit_31")).resolves.toEqual(raidDetail(JP_UNLIMIT_31));
    await expect(getKoreanRaidScheduleByUid(env, "missing")).resolves.toBeNull();
  });

  it("returns the JP schedule, not the forecast season, when the forecast season does not own its number", async () => {
    serveBaqlWithOfficial89OfAnotherSeason();

    await expect(getKoreanRaidScheduleByUid(env, "jp_total_assault_92")).resolves.toEqual(
      raidDetail(JP_TOTAL_ASSAULT_92),
    );
  });
});

describe("getRaidRowSeasonPages", () => {
  const contents = () => [
    rowOf89(),
    rowOfNightmare(),
    raidRow({ uid: "legacy", contentUid: "gl_unlimit_31", startAt: "2027-01-13T02:00:00Z", endAt: null }),
  ];

  it("links every row to the season page its content uid linked to while BAQL still lists every forecast", async () => {
    serveBaqlToday();
    mockedGetAllRaidRows.mockResolvedValue(contents());

    const pages = await getRaidRowSeasonPages(env, contents());

    expect(Object.fromEntries(pages)).toEqual({
      gl_total_assault_89: { raidType: "total_assault", seasonIndex: 89 },
      "raid-nightmare": { raidType: "total_assault", seasonIndex: 91 },
      legacy: { raidType: "unlimit", seasonIndex: 31 },
    });
  });

  it("links a forecast row by its own season number once BAQL drops the gl forecast, and no page without one", async () => {
    serveBaqlWithoutForecasts();
    const rows = [rowOf89(), rowOfNightmare(null)];
    mockedGetAllRaidRows.mockResolvedValue(rows);
    mockedGetFutureRaidRows.mockResolvedValue(rows);

    const pages = await getRaidRowSeasonPages(env, rows);

    expect(Object.fromEntries(pages)).toEqual({ gl_total_assault_89: { raidType: "total_assault", seasonIndex: 89 } });
  });
});

describe("a forecast season whose number BAQL gives an official season of another JP season", () => {
  it("is listed without a number, has no season page, and leaves the number's page to the official season", async () => {
    serveBaqlWithOfficial89OfAnotherSeason();
    const rows = [rowOf89()];
    mockedGetFutureRaidRows.mockResolvedValue(rows);
    mockedGetAllRaidRows.mockResolvedValue(rows);

    const all = await getKoreanRaidSchedules(env);
    expect(all.map((schedule) => [schedule.uid, schedule.seasonIndex])).toEqual([
      ["gl_total_assault_89", 89],
      ["jp_total_assault_92", null],
    ]);
    await expect(getNumberedKoreanRaidSchedules(env)).resolves.toEqual([
      raidListItem(OFFICIAL_GL_TOTAL_ASSAULT_89_OF_JP_95),
    ]);
    await expect(getKoreanRaidScheduleByTypeAndSeason(env, "total_assault", 89)).resolves.toEqual(
      raidDetail(OFFICIAL_GL_TOTAL_ASSAULT_89_OF_JP_95),
    );
    await expect(getRaidRowSeasonPages(env, rows)).resolves.toEqual(new Map());
  });
});

describe("one read per request", () => {
  it("reads the raid rows and BAQL's lists once for the season page and its season list", async () => {
    serveBaqlWithoutForecasts();

    const seasons = await loadKoreanRaidSeasons(env);
    const [current, list] = await Promise.all([
      getKoreanRaidScheduleByTypeAndSeason(env, "total_assault", 89, { seasons }),
      getNumberedKoreanRaidSchedules(env, { seasons }),
    ]);

    expect(current).toMatchObject({ uid: "jp_total_assault_92", seasonIndex: 89 });
    expect(list.map((schedule) => schedule.uid)).toEqual(["jp_total_assault_92", "jp_total_assault_94"]);
    expect(mockedGetFutureRaidRows).toHaveBeenCalledTimes(1);
    expect(mockedGetAllRaidSchedules.mock.calls.map(([, , options]) => options?.region ?? "gl")).toEqual(["gl", "jp"]);
  });

  it("reads the raid rows and BAQL's lists once for the sitemap", async () => {
    serveBaqlWithoutForecasts();

    await getRaidRowSeasonPages(env, [rowOf89()]);

    expect(mockedGetAllRaidRows).toHaveBeenCalledTimes(1);
    expect(mockedGetFutureRaidRows).not.toHaveBeenCalled();
    expect(mockedGetAllRaidSchedules.mock.calls.map(([, , options]) => options?.region ?? "gl")).toEqual(["gl", "jp"]);
  });

  it("gives no season page to a forecast row that has ended", async () => {
    serveBaqlWithoutForecasts();
    const ended = rowOf89({ startAt: "2020-01-01T00:00:00Z", endAt: "2020-01-08T00:00:00Z" });
    mockedGetAllRaidRows.mockResolvedValue([ended]);

    await expect(getRaidRowSeasonPages(env, [ended])).resolves.toEqual(new Map());
  });
});

describe("warmKoreanRaidCache", () => {
  it("also warms the JP schedule detail each forecast season shows", async () => {
    serveBaqlWithoutForecasts();
    jest.mocked(warmRaidCache).mockResolvedValue([]);

    await warmKoreanRaidCache(env, true);

    expect(warmRaidCache).toHaveBeenCalledWith(env, true);
    expect(mockedGetRaidSchedule.mock.calls.map(([, uid, forceRefresh]) => [uid, forceRefresh])).toEqual([
      ["jp_total_assault_92", true],
      ["jp_total_assault_94", true],
    ]);
  });
});

describe("getRaidRecordSeasons with forecast seasons", () => {
  it("lists no forecast Korean season, and gives a JP season a forecast's Korean number only for display", async () => {
    serveBaqlWithoutForecasts();

    await expect(getRaidRecordSeasons(env, "kr")).resolves.toEqual([]);

    const jp = await getRaidRecordSeasons(env, "jp");
    expect(jp.map((season) => [season.seasonIndex, season.counterpartSeasonIndex])).toEqual([
      [94, null],
      [92, null],
    ]);

    const jpForDisplay = await getRaidRecordSeasons(env, "jp", { forecastCounterparts: true });
    expect(jpForDisplay.map((season) => [season.seasonIndex, season.counterpartSeasonIndex])).toEqual([
      [94, 91],
      [92, 89],
    ]);
  });
});
