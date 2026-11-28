import type { RaidRowSeason } from "@dtrippers/mollulog-sdk";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { RaidSchedule, RaidScheduleListItem } from "~/models/raid";
import { getAllRaidSchedules, getRaidSchedule } from "~/models/raid";
import type { TimelineRaidRow } from "~/models/timeline-content.server";
import { getFutureRaidRows } from "~/models/timeline-content.server";
import { enrichRaidContents, getUpcomingRaidContents } from "../../../app/views/raid-content";
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
  getRaidScheduleByTypeAndSeason: jest.fn(),
  warmRaidCache: jest.fn(),
}));

const mockedGetFutureRaidRows = getFutureRaidRows as jest.MockedFunction<typeof getFutureRaidRows>;
const mockedGetAllRaidSchedules = getAllRaidSchedules as jest.MockedFunction<typeof getAllRaidSchedules>;
const mockedGetRaidSchedule = getRaidSchedule as jest.MockedFunction<typeof getRaidSchedule>;

function createTimelineRaidContent({
  uid,
  contentUid,
  startAt,
  endAt,
}: {
  uid: string;
  contentUid: string;
  startAt: string;
  endAt: string | null;
}): TimelineRaidRow {
  return {
    ...raidRow({ uid, contentUid, startAt, endAt }),
    confirmed: true,
    syncedAt: "2026-06-29T00:00:00.000Z",
  } as TimelineRaidRow;
}

function createRaidSchedule({
  uid,
  raidType,
  startAt,
}: {
  uid: string;
  raidType: string;
  startAt: string;
}): RaidSchedule {
  return {
    uid,
    raidType,
    seasonIndex: 1,
    region: "gl",
    terrain: "outdoor",
    startAt,
    endAt: "2026-07-06T19:00:00.000Z",
    attackType: null,
    raidBoss: { uid, name: uid },
    defenseTypeSets: [],
    defenseTypes: [],
    jpSchedule: null,
  } as unknown as RaidSchedule;
}

/** BAQL as the mocks serve it: `gl` and JP lists, and details of every listed schedule by uid. */
function serveBaql(glSchedules: RaidScheduleListItem[], jpSchedules: RaidScheduleListItem[], details: RaidSchedule[]) {
  mockedGetAllRaidSchedules.mockImplementation(async (_env, _forceRefresh, options) =>
    options?.region === "jp" ? jpSchedules : glSchedules,
  );
  const detailsByUid = new Map(details.map((detail) => [detail.uid, detail]));
  mockedGetRaidSchedule.mockImplementation(async (_env, uid) => detailsByUid.get(uid) ?? null);
}

const GL_RAWS = [GL_TOTAL_ASSAULT_89, GL_UNLIMIT_31, GL_TOTAL_ASSAULT_91];
const JP_RAWS = [JP_TOTAL_ASSAULT_92, JP_UNLIMIT_31, JP_TOTAL_ASSAULT_94];

/** BAQL today: every forecast season still has its `gl` schedule. */
function serveBaqlToday() {
  serveBaql(GL_RAWS.map(raidListItem), JP_RAWS.map(raidListItem), [...GL_RAWS, ...JP_RAWS].map(raidDetail));
}

/** BAQL once the forecast `gl` schedules are deleted. */
function serveBaqlWithoutForecasts() {
  serveBaql([], JP_RAWS.map(raidListItem), JP_RAWS.map(raidDetail));
}

/** The MolluLog rows of the three forecast seasons, the way production stores them. Dates differ from BAQL's. */
function forecastRows(seasons: { withColumns: boolean; glRaidSeasonIndexes?: Record<string, number | null> }) {
  const season = (raidType: string, jpRaidSeasonIndex: number, glRaidSeasonIndex: number | null): RaidRowSeason =>
    seasons.withColumns
      ? { raidType, jpRaidSeasonIndex, glRaidSeasonIndex }
      : { raidType: null, jpRaidSeasonIndex: null, glRaidSeasonIndex: null };
  const glIndex = (uid: string, fallback: number) =>
    seasons.glRaidSeasonIndexes && uid in seasons.glRaidSeasonIndexes ? seasons.glRaidSeasonIndexes[uid] : fallback;
  return [
    raidRow({
      uid: "gl_total_assault_89",
      contentUid: "gl_total_assault_89",
      startAt: "2026-12-22T02:00:00Z",
      endAt: "2026-12-28T19:00:00Z",
      raidSeason: season("total_assault", 92, glIndex("gl_total_assault_89", 89)),
    }),
    raidRow({
      uid: "unlimit_31",
      contentUid: "gl_unlimit_31",
      startAt: "2027-01-13T02:00:00Z",
      endAt: "2027-02-15T19:00:00Z",
      raidSeason: season("unlimit", 31, glIndex("unlimit_31", 31)),
    }),
    raidRow({
      uid: "raid-nightmare",
      contentUid: "gl_total_assault_91",
      startAt: "2027-02-23T02:00:00Z",
      endAt: "2027-03-01T19:00:00Z",
      raidSeason: season("total_assault", 94, glIndex("raid-nightmare", 91)),
    }),
  ];
}

beforeEach(() => {
  mockedGetFutureRaidRows.mockReset();
  mockedGetAllRaidSchedules.mockReset();
  mockedGetRaidSchedule.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("getUpcomingRaidContents", () => {
  it("filters by BAQL raidType before applying the limit", async () => {
    const env = {} as Env;
    const contents = [
      createTimelineRaidContent({
        uid: "gl_allied_12",
        contentUid: "gl_allied_12",
        startAt: "2024-12-03T02:00:00.000Z",
        endAt: null,
      }),
      createTimelineRaidContent({
        uid: "gl_unlimit_24",
        contentUid: "gl_unlimit_24",
        startAt: "2026-06-24T02:00:00.000Z",
        endAt: "2026-07-20T19:00:00.000Z",
      }),
      createTimelineRaidContent({
        uid: "gl_allied_17",
        contentUid: "gl_allied_17",
        startAt: "2026-06-24T02:00:00.000Z",
        endAt: "2026-06-30T02:00:00.000Z",
      }),
      createTimelineRaidContent({
        uid: "raid-202607-binah",
        contentUid: "gl_total_assault_83",
        startAt: "2026-06-30T02:00:00.000Z",
        endAt: "2026-07-06T19:00:00.000Z",
      }),
      createTimelineRaidContent({
        uid: "gl_elimination_31",
        contentUid: "gl_elimination_31",
        startAt: "2026-07-07T02:00:00.000Z",
        endAt: "2026-07-13T19:00:00.000Z",
      }),
    ];
    const schedules = [
      createRaidSchedule({ uid: "gl_allied_12", raidType: "allied", startAt: "2024-12-03T02:00:00.000Z" }),
      createRaidSchedule({ uid: "gl_unlimit_24", raidType: "unlimit", startAt: "2026-06-24T02:00:00.000Z" }),
      createRaidSchedule({ uid: "gl_allied_17", raidType: "allied", startAt: "2026-06-24T02:00:00.000Z" }),
      createRaidSchedule({
        uid: "gl_total_assault_83",
        raidType: "total_assault",
        startAt: "2026-06-30T02:00:00.000Z",
      }),
      createRaidSchedule({ uid: "gl_elimination_31", raidType: "elimination", startAt: "2026-07-07T02:00:00.000Z" }),
    ];

    mockedGetFutureRaidRows.mockResolvedValueOnce(contents);
    mockedGetAllRaidSchedules.mockResolvedValueOnce(schedules);

    const result = await getUpcomingRaidContents(env, {
      limit: 3,
      raidTypes: ["total_assault", "elimination", "unlimit"],
    });

    expect(result.map((content) => content.raidSchedule?.uid)).toEqual([
      "gl_unlimit_24",
      "gl_total_assault_83",
      "gl_elimination_31",
    ]);
    expect(mockedGetAllRaidSchedules).toHaveBeenCalledTimes(1);
    expect(mockedGetAllRaidSchedules).toHaveBeenCalledWith(env, false);
    expect(getRaidSchedule).not.toHaveBeenCalled();
  });

  it("does not attach raid metadata by start time when multiple raid contents share the same start time", async () => {
    const env = {} as Env;
    const contents = [
      createTimelineRaidContent({
        uid: "timeline-total-assault",
        contentUid: "timeline-total-assault",
        startAt: "2026-07-07T02:00:00.000Z",
        endAt: "2026-07-13T19:00:00.000Z",
      }),
      createTimelineRaidContent({
        uid: "timeline-elimination",
        contentUid: "timeline-elimination",
        startAt: "2026-07-07T02:00:00.000Z",
        endAt: "2026-07-13T19:00:00.000Z",
      }),
    ];
    const schedules = [
      createRaidSchedule({
        uid: "gl_total_assault_84",
        raidType: "total_assault",
        startAt: "2026-07-07T02:00:00.000Z",
      }),
    ];

    mockedGetFutureRaidRows.mockResolvedValueOnce(contents);
    mockedGetAllRaidSchedules.mockResolvedValueOnce(schedules);

    const result = await getUpcomingRaidContents(env, {
      limit: 3,
      raidTypes: ["total_assault"],
    });

    expect(result).toEqual([]);
  });

  describe("rows with a JP season", () => {
    const env = {} as Env;
    const raidTypes = ["total_assault", "elimination", "unlimit"] as const;

    it("show what their content uid showed while BAQL still lists the gl forecasts", async () => {
      serveBaqlToday();
      mockedGetFutureRaidRows.mockResolvedValue(forecastRows({ withColumns: false }));
      const before = {
        home: await getUpcomingRaidContents(env, { raidTypes }),
        futures: await getUpcomingRaidContents(env),
      };

      mockedGetFutureRaidRows.mockResolvedValue(forecastRows({ withColumns: true }));
      const after = {
        home: await getUpcomingRaidContents(env, { raidTypes }),
        futures: await getUpcomingRaidContents(env),
      };

      expect(before.home.map((content) => content.raidSchedule?.uid)).toEqual([
        "gl_total_assault_89",
        "gl_unlimit_31",
        "gl_total_assault_91",
      ]);
      expect(before.futures.map((content) => content.raidInfo?.seasonIndex)).toEqual([89, 31, 91]);
      expect(after).toEqual(before);
    });

    it("never use their content uid to choose the season", async () => {
      serveBaqlToday();
      const rows = forecastRows({ withColumns: true }).map((row) =>
        row.uid === "gl_total_assault_89" ? { ...row, contentUid: "gl_total_assault_91" } : row,
      );
      mockedGetFutureRaidRows.mockResolvedValue(rows);

      const futures = await getUpcomingRaidContents(env);

      expect(futures[0]?.raidSchedule).toMatchObject({ uid: "gl_total_assault_89", seasonIndex: 89 });
    });

    it("show the JP schedule with the row's dates and season number once BAQL has no gl forecast", async () => {
      serveBaqlWithoutForecasts();
      mockedGetFutureRaidRows.mockResolvedValue(forecastRows({ withColumns: true }));

      const [home, futures] = [await getUpcomingRaidContents(env, { raidTypes }), await getUpcomingRaidContents(env)];

      const unlimit = futures.find((content) => content.uid === "unlimit_31");
      expect(unlimit?.raidInfo).toEqual({
        raidType: "unlimit",
        boss: "tiphareth",
        name: "티페레트",
        seasonIndex: 31,
        terrain: "indoor",
        attackType: "piercing",
        defenseTypeSets: [
          { difficulty: null, defenseTypes: ["heavy"], primaryDefenseType: "heavy", secondaryDefenseTypes: [] },
        ],
        defenseTypes: [{ defenseType: "heavy", difficulty: null }],
      });
      expect(unlimit?.raidSchedule).toMatchObject({
        uid: "jp_unlimit_31",
        region: "gl",
        seasonIndex: 31,
        startAt: "2027-01-13T02:00:00.000Z",
        endAt: "2027-02-15T19:00:00.000Z",
        jpSchedule: { uid: "jp_unlimit_31", seasonIndex: 31 },
        raidBoss: { uid: "tiphareth", name: "티페레트", nameJa: "티페레트 (ja)" },
      });

      const nightmare = futures.find((content) => content.uid === "raid-nightmare");
      expect(nightmare?.raidInfo).toMatchObject({ boss: "nightmare", seasonIndex: 91 });

      expect(home.map((content) => [content.uid, content.raidSchedule?.seasonIndex])).toEqual([
        ["gl_total_assault_89", 89],
        ["unlimit_31", 31],
        ["raid-nightmare", 91],
      ]);
      expect(home[0]?.raidSchedule).toMatchObject({
        uid: "jp_total_assault_92",
        startAt: "2026-12-22T02:00:00.000Z",
        endAt: "2026-12-28T19:00:00.000Z",
        raidBoss: { uid: "perorodzilla" },
      });
      // The rows keep the general row shape.
      expect(futures.every((content) => !("raidSeason" in content))).toBe(true);
    });

    it("show no season number, and no season schedule to link, for a forecast without one", async () => {
      serveBaqlWithoutForecasts();
      mockedGetFutureRaidRows.mockResolvedValue(
        forecastRows({ withColumns: true, glRaidSeasonIndexes: { unlimit_31: null } }),
      );

      const futures = await getUpcomingRaidContents(env);
      const unlimit = futures.find((content) => content.uid === "unlimit_31");
      expect(unlimit?.raidInfo).toMatchObject({ raidType: "unlimit", boss: "tiphareth" });
      expect(unlimit?.raidInfo?.seasonIndex).toBeUndefined();
      expect(unlimit?.raidSchedule).toBeUndefined();

      const home = await getUpcomingRaidContents(env, { raidTypes });
      expect(home.map((content) => content.uid)).toEqual(["gl_total_assault_89", "raid-nightmare"]);
    });

    it("show no season number, and no season schedule to link, for a forecast whose number BAQL gives another season", async () => {
      // BAQL lists an official #89 of JP season 95, while the row of JP season 92 still predicts #89.
      serveBaql(
        [raidListItem(OFFICIAL_GL_TOTAL_ASSAULT_89_OF_JP_95)],
        JP_RAWS.map(raidListItem),
        [OFFICIAL_GL_TOTAL_ASSAULT_89_OF_JP_95, ...JP_RAWS].map(raidDetail),
      );
      mockedGetFutureRaidRows.mockResolvedValue(forecastRows({ withColumns: true }));

      const futures = await getUpcomingRaidContents(env);
      const forecast = futures.find((content) => content.uid === "gl_total_assault_89");
      expect(forecast?.raidInfo).toMatchObject({ raidType: "total_assault", boss: "perorodzilla" });
      expect(forecast?.raidInfo?.seasonIndex).toBeUndefined();
      expect(forecast?.raidSchedule).toBeUndefined();

      const home = await getUpcomingRaidContents(env, { raidTypes });
      expect(home.map((content) => [content.uid, content.raidSchedule?.seasonIndex])).toEqual([
        ["unlimit_31", 31],
        ["raid-nightmare", 91],
      ]);
    });

    it("show a row as a raid row without schedule data when neither schedule exists", async () => {
      serveBaql([], [], []);
      mockedGetFutureRaidRows.mockResolvedValue(forecastRows({ withColumns: true }));

      const futures = await getUpcomingRaidContents(env);

      expect(futures.map((content) => [content.uid, content.raidInfo, content.raidSchedule])).toEqual([
        ["gl_total_assault_89", undefined, undefined],
        ["unlimit_31", undefined, undefined],
        ["raid-nightmare", undefined, undefined],
      ]);
      expect(await getUpcomingRaidContents(env, { raidTypes })).toEqual([]);
    });
  });
});

describe("enrichRaidContents", () => {
  it("reads the detail of a row without a JP season by its content uid, as before", async () => {
    serveBaqlToday();

    const [content] = await enrichRaidContents({} as Env, forecastRows({ withColumns: false }).slice(0, 1));

    expect(mockedGetAllRaidSchedules).not.toHaveBeenCalled();
    expect(mockedGetRaidSchedule).toHaveBeenCalledWith({} as Env, "gl_total_assault_89", false);
    expect(content?.raidSchedule).toMatchObject({ uid: "gl_total_assault_89", startAt: "2026-12-22T02:00:00.000Z" });
  });
});
