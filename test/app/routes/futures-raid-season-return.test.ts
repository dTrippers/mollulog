import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { RaidSchedule, RaidScheduleListItem } from "~/models/raid";
import { getAllRaidSchedules, getRaidSchedule } from "~/models/raid";
import { getKoreanRaidScheduleByTypeAndSeason } from "~/models/raid-season.server";
import { getFutureRaidRows, getTimelineContents } from "~/models/timeline-content.server";
import {
  createFutureDetailNavigationState,
  type FuturesVisitState,
  getFutureDetailContentUid,
  getRaidSeasonReturnUid,
  isVerifiedFutureDetailReturn,
  readFutureDetailNavigationState,
} from "~/routes/futures._components/futures-navigation";
import { getFutureContents } from "~/views/futures";
import {
  GL_TOTAL_ASSAULT_89,
  GL_TOTAL_ASSAULT_91,
  JP_TOTAL_ASSAULT_92,
  raidDetail,
  raidListItem,
  raidRow,
} from "../../helpers/raid-season-fixtures";

jest.mock("~/lib/cache", () => ({
  ...jest.requireActual<typeof import("~/lib/cache")>("~/lib/cache"),
  fetchRouteCached: jest.fn((_env: unknown, _ctx: unknown, _key: unknown, produce: () => unknown) => produce()),
}));
jest.mock("~/models/raid", () => ({ getAllRaidSchedules: jest.fn(), getRaidSchedule: jest.fn() }));
jest.mock("~/models/timeline-content.server", () => ({
  getTimelineContents: jest.fn(),
  getFutureRaidRows: jest.fn(),
  getAllRaidRows: jest.fn(),
}));
jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupsByUidsStrict: jest.fn(async () => []),
  normalizeRecruitmentGroupPeriod: jest.fn(),
}));
jest.mock("~/models/event-content", () => ({ getEventMinigameType: jest.fn() }));

const env = {} as Env;

function serveBaql(glSchedules: RaidScheduleListItem[], jpSchedules: RaidScheduleListItem[], details: RaidSchedule[]) {
  jest
    .mocked(getAllRaidSchedules)
    .mockImplementation(async (_env, _forceRefresh, options) => (options?.region === "jp" ? jpSchedules : glSchedules));
  jest
    .mocked(getRaidSchedule)
    .mockImplementation(async (_env, uid) => details.find((detail) => detail.uid === uid) ?? null);
}

// The row's `content_uid` still names the forecast `gl` schedule BAQL lists today.
const row = raidRow({
  uid: "raid-89",
  contentUid: "gl_total_assault_89",
  startAt: "2099-12-22T02:00:00Z",
  endAt: "2099-12-28T19:00:00Z",
  raidSeason: { raidType: "total_assault", jpRaidSeasonIndex: 92, glRaidSeasonIndex: 89 },
});

/** BAQL while it lists the forecast `gl` schedule of the season. */
const serveBaqlWithGl = () =>
  serveBaql(
    [raidListItem(GL_TOTAL_ASSAULT_89)],
    [raidListItem(JP_TOTAL_ASSAULT_92)],
    [raidDetail(GL_TOTAL_ASSAULT_89)],
  );
/** BAQL once it dropped the forecast `gl` schedule: the season is shown from its JP schedule. */
const serveBaqlWithoutGl = () => serveBaql([], [raidListItem(JP_TOTAL_ASSAULT_92)], [raidDetail(JP_TOTAL_ASSAULT_92)]);

/** The navigation state the futures page hands the row's season page. */
async function futuresNavigationState() {
  const content = (await getFutureContents(env)).find(({ uid }) => uid === row.uid);
  if (!content) throw new Error("the row is not on the futures page");
  return createFutureDetailNavigationState("futures-entry", getFutureDetailContentUid(content));
}

/** Whether the season page shows the 미래시 back control for that state, as `useVerifiedFutureDetailReturn` checks it. */
async function seasonPageVerifies(
  state: Awaited<ReturnType<typeof futuresNavigationState>>,
  seasonIndex = 89,
): Promise<boolean> {
  const currentRaid = await getKoreanRaidScheduleByTypeAndSeason(env, "total_assault", seasonIndex);
  if (!currentRaid) throw new Error("the season page does not load");
  const visitState = { entryKey: "futures-entry" } as FuturesVisitState;
  const navigationState = readFutureDetailNavigationState(state);
  return isVerifiedFutureDetailReturn(
    navigationState,
    getRaidSeasonReturnUid(navigationState, currentRaid),
    visitState,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  const { raidSeason: _raidSeason, ...timelineRow } = row;
  jest.mocked(getTimelineContents).mockResolvedValue([timelineRow]);
  jest.mocked(getFutureRaidRows).mockResolvedValue([row]);
});

describe("the futures return from a raid season page", () => {
  it("is verified while BAQL lists the season's gl schedule, and while it does not", async () => {
    serveBaqlWithGl();
    await expect(seasonPageVerifies(await futuresNavigationState())).resolves.toBe(true);

    serveBaqlWithoutGl();
    await expect(seasonPageVerifies(await futuresNavigationState())).resolves.toBe(true);
  });

  it("is verified when futures was built from the gl schedule and the season page from the forecast season", async () => {
    serveBaqlWithGl();
    const state = await futuresNavigationState();

    serveBaqlWithoutGl();
    await expect(seasonPageVerifies(state)).resolves.toBe(true);
  });

  it("is verified when futures was built from the forecast season and the season page from the gl schedule", async () => {
    serveBaqlWithoutGl();
    const state = await futuresNavigationState();

    serveBaqlWithGl();
    await expect(seasonPageVerifies(state)).resolves.toBe(true);
  });

  it("is verified for a state stored with the gl schedule's own uid, as a tab opened before the identity uid holds", async () => {
    serveBaqlWithGl();
    const state = createFutureDetailNavigationState("futures-entry", GL_TOTAL_ASSAULT_89.uid);

    await expect(seasonPageVerifies(state)).resolves.toBe(true);
  });

  it("is not verified on another season's page", async () => {
    serveBaql(
      [raidListItem(GL_TOTAL_ASSAULT_89), raidListItem(GL_TOTAL_ASSAULT_91)],
      [raidListItem(JP_TOTAL_ASSAULT_92)],
      [raidDetail(GL_TOTAL_ASSAULT_89), raidDetail(GL_TOTAL_ASSAULT_91)],
    );

    await expect(seasonPageVerifies(await futuresNavigationState(), 91)).resolves.toBe(false);
  });
});

describe("getFutureDetailContentUid", () => {
  it("uses the row's uid for a raid row without a season page and for every other row", () => {
    expect(getFutureDetailContentUid({ uid: "raid-row", contentType: "raid", raidSeasonUid: null })).toBe("raid-row");
    expect(getFutureDetailContentUid({ uid: "event-row", contentType: "event" })).toBe("event-row");
  });
});
