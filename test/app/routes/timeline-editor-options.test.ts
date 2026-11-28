import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { RaidSchedule, RaidScheduleListItem } from "~/models/raid";
import { getAllRaidSchedules, getRaidSchedule } from "~/models/raid";
import { getFutureRaidRows } from "~/models/timeline-content.server";
import { loadTimelineEditorOptions } from "~/routes/timelines._components/timeline-route-data.server";
import {
  GL_TOTAL_ASSAULT_89,
  JP_TOTAL_ASSAULT_92,
  OFFICIAL_GL_TOTAL_ASSAULT_89_OF_JP_95,
  raidDetail,
  raidListItem,
  raidRow,
} from "../../helpers/raid-season-fixtures";

jest.mock("~/models/raid", () => ({ getAllRaidSchedules: jest.fn(), getRaidSchedule: jest.fn() }));
jest.mock("~/models/timeline-content.server", () => ({ getFutureRaidRows: jest.fn(), getAllRaidRows: jest.fn() }));
jest.mock("~/models/student", () => ({ getAllStudents: jest.fn(async () => []) }));
jest.mock("~/models/raid-record", () => ({ getRaidRecordRecruitedSnapshots: jest.fn(async () => []) }));

const env = {} as Env;

function serveBaql(glSchedules: RaidScheduleListItem[], jpSchedules: RaidScheduleListItem[], details: RaidSchedule[]) {
  jest
    .mocked(getAllRaidSchedules)
    .mockImplementation(async (_env, _forceRefresh, options) => (options?.region === "jp" ? jpSchedules : glSchedules));
  jest
    .mocked(getRaidSchedule)
    .mockImplementation(async (_env, uid) => details.find((detail) => detail.uid === uid) ?? null);
}

/** The forecast row of total assault #89, predicted from JP season 92 (페로로지라). */
const forecastRowOf89 = raidRow({
  uid: "raid-89",
  contentUid: "gl_total_assault_89",
  startAt: "2026-12-22T02:00:00Z",
  endAt: "2026-12-28T19:00:00Z",
  raidSeason: { raidType: "total_assault", jpRaidSeasonIndex: 92, glRaidSeasonIndex: 89 },
});

const schedulesByBoss = async () =>
  Object.fromEntries(
    (await loadTimelineEditorOptions(env, 1)).bosses.map((boss) => [boss.uid, boss.schedules.map(({ key }) => key)]),
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getFutureRaidRows).mockResolvedValue([forecastRowOf89]);
});

describe("loadTimelineEditorOptions season keys", () => {
  it("keys the season by the forecast row's number while it owns it", async () => {
    serveBaql([], [raidListItem(JP_TOTAL_ASSAULT_92)], [raidDetail(JP_TOTAL_ASSAULT_92)]);

    await expect(schedulesByBoss()).resolves.toEqual({ perorodzilla: ["total_assault:89"] });
  });

  it("is the gl season's key while BAQL lists the forecast season", async () => {
    serveBaql([raidListItem(GL_TOTAL_ASSAULT_89)], [raidListItem(JP_TOTAL_ASSAULT_92)], []);

    await expect(schedulesByBoss()).resolves.toEqual({ perorodzilla: ["total_assault:89"] });
  });

  it("gives the key to BAQL's official season when that number belongs to another JP season", async () => {
    serveBaql(
      [raidListItem(OFFICIAL_GL_TOTAL_ASSAULT_89_OF_JP_95)],
      [raidListItem(JP_TOTAL_ASSAULT_92)],
      [raidDetail(OFFICIAL_GL_TOTAL_ASSAULT_89_OF_JP_95), raidDetail(JP_TOTAL_ASSAULT_92)],
    );

    await expect(schedulesByBoss()).resolves.toEqual({ hod: ["total_assault:89"], perorodzilla: [] });
  });
});
