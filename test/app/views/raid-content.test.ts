import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { RaidSchedule } from "~/models/raid";
import { getAllRaidSchedules, getRaidSchedule } from "~/models/raid";
import type { TimelineContent } from "~/models/timeline-content";
import { getFutureRaidContents } from "~/models/timeline-content";
import { getUpcomingRaidContents } from "../../../app/views/raid-content";

jest.mock("~/models/timeline-content", () => ({
  getFutureRaidContents: jest.fn(),
}));

jest.mock("~/models/raid", () => ({
  getAllRaidSchedules: jest.fn(),
  getRaidSchedule: jest.fn(),
  getRaidScheduleByTypeAndSeason: jest.fn(),
}));

const mockedGetFutureRaidContents = getFutureRaidContents as jest.MockedFunction<typeof getFutureRaidContents>;
const mockedGetAllRaidSchedules = getAllRaidSchedules as jest.MockedFunction<typeof getAllRaidSchedules>;

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
}): TimelineContent {
  return {
    uid,
    name: uid,
    contentType: "raid",
    contentUid,
    startAt,
    endAt,
    endless: endAt === null,
    imageUrl: null,
    videos: [],
    runType: "first",
    occurrence: null,
    recruitmentGroupUid: null,
    confirmed: true,
    isSpoiler: false,
    tags: [],
    earnablePyroxene: null,
    syncedAt: "2026-06-29T00:00:00.000Z",
    recruitments: [],
  } as unknown as TimelineContent;
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

afterEach(() => {
  jest.restoreAllMocks();
  mockedGetFutureRaidContents.mockReset();
  mockedGetAllRaidSchedules.mockReset();
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
    const schedules = new Map([
      [
        "gl_allied_12",
        createRaidSchedule({
          uid: "gl_allied_12",
          raidType: "allied",
          startAt: "2024-12-03T02:00:00.000Z",
        }),
      ],
      [
        "gl_unlimit_24",
        createRaidSchedule({
          uid: "gl_unlimit_24",
          raidType: "unlimit",
          startAt: "2026-06-24T02:00:00.000Z",
        }),
      ],
      [
        "gl_allied_17",
        createRaidSchedule({
          uid: "gl_allied_17",
          raidType: "allied",
          startAt: "2026-06-24T02:00:00.000Z",
        }),
      ],
      [
        "gl_total_assault_83",
        createRaidSchedule({
          uid: "gl_total_assault_83",
          raidType: "total_assault",
          startAt: "2026-06-30T02:00:00.000Z",
        }),
      ],
      [
        "gl_elimination_31",
        createRaidSchedule({
          uid: "gl_elimination_31",
          raidType: "elimination",
          startAt: "2026-07-07T02:00:00.000Z",
        }),
      ],
    ]);

    mockedGetFutureRaidContents.mockResolvedValueOnce(contents);
    mockedGetAllRaidSchedules.mockResolvedValueOnce([...schedules.values()]);

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

    mockedGetFutureRaidContents.mockResolvedValueOnce(contents);
    mockedGetAllRaidSchedules.mockResolvedValueOnce(schedules);

    const result = await getUpcomingRaidContents(env, {
      limit: 3,
      raidTypes: ["total_assault"],
    });

    expect(result).toEqual([]);
  });
});
