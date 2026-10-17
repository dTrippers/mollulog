import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { fetchRouteCached } from "~/lib/cache";
import { getEventMinigameType } from "~/models/event-content";
import { getFavoritedCounts } from "~/models/favorite-students";
import { getHomeCampaigns, getHomeJointFiringDrills } from "~/models/home-overview";
import { getNewsPosts } from "~/models/post";
import { getRecruitmentGroupsOrThrow } from "~/models/recruitment";
import { getAllStudents, getStudentCharacterUids } from "~/models/student";
import {
  findEventsForRecruitmentStudent,
  getHomeMainStoryContent,
  getTimelineContentsByContentTypes,
  groupTimelineContentsByRecruitmentGroupUid,
} from "~/models/timeline-content.server";
import { getHomeBirthdaySource, getHomeFavoritedCounts, getIndexContents } from "~/views/home";
import { getUpcomingRaidContents } from "~/views/raid-content";

const mockLogger = { error: jest.fn() };

jest.mock("~/lib/cache", () => ({
  cacheKey: (category: string, domain: string, version: number, query: string) =>
    `${category}::${domain}::v${version}::${query}`,
  fetchRouteCached: jest.fn(),
}));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn(() => mockLogger) }));
jest.mock("~/models/timeline-content.server", () => ({
  findEventsForRecruitmentStudent: jest.fn(() => []),
  getHomeMainStoryContent: jest.fn(),
  getTimelineContentsByContentTypes: jest.fn(),
  groupTimelineContentsByRecruitmentGroupUid: jest.fn(() => new Map()),
}));
jest.mock("~/models/recruitment", () => ({ getRecruitmentGroupsOrThrow: jest.fn() }));
jest.mock("~/models/home-overview", () => ({ getHomeCampaigns: jest.fn(), getHomeJointFiringDrills: jest.fn() }));
jest.mock("~/models/post", () => ({ getNewsPosts: jest.fn() }));
jest.mock("~/models/event-content", () => ({ getEventMinigameType: jest.fn() }));
jest.mock("~/models/favorite-students", () => ({ getFavoritedCounts: jest.fn() }));
jest.mock("~/views/raid-content", () => ({ getUpcomingRaidContents: jest.fn() }));
jest.mock("~/models/student", () => ({ getAllStudents: jest.fn(), getStudentCharacterUids: jest.fn() }));

const mockedFetchRouteCached = fetchRouteCached as jest.MockedFunction<typeof fetchRouteCached>;
const env = {} as Env;
const ctx = {} as ExecutionContext;

function healthySources() {
  jest.mocked(getTimelineContentsByContentTypes).mockResolvedValue([]);
  jest.mocked(getRecruitmentGroupsOrThrow).mockResolvedValue([]);
  jest.mocked(getFavoritedCounts).mockResolvedValue([]);
  jest.mocked(getUpcomingRaidContents).mockResolvedValue([]);
  jest.mocked(getNewsPosts).mockResolvedValue({ items: [], page: 1, pageSize: 3, totalCount: 0 } as never);
  jest.mocked(getHomeCampaigns).mockResolvedValue([]);
  jest.mocked(getHomeJointFiringDrills).mockResolvedValue([]);
  jest.mocked(getHomeMainStoryContent).mockResolvedValue(null);
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("getIndexContents", () => {
  it("caches a complete snapshot under the route index version 6 key, without the favorited counts", async () => {
    healthySources();
    mockedFetchRouteCached.mockImplementation((_env, _ctx, _key, fn) => fn());

    const result = await getIndexContents(env, false, ctx);

    expect(mockedFetchRouteCached).toHaveBeenCalledWith(env, ctx, "route::index::v6::all", expect.any(Function), false);
    expect(result).not.toHaveProperty("favoritedCounts");
    expect(getFavoritedCounts).not.toHaveBeenCalled();
    expect(result.events).toEqual({
      status: "success",
      data: { main: null, together: [], upcoming: null, minigameType: null },
    });
    expect(result.raids).toEqual({
      status: "success",
      data: { total: { ongoing: [], upcoming: null }, unlimit: { ongoing: [], upcoming: null } },
    });
    expect(result.news).toEqual({ status: "success", data: [] });
  });

  it("isolates a failed timeline source and returns the other sources without caching the partial snapshot", async () => {
    healthySources();
    jest.mocked(getTimelineContentsByContentTypes).mockRejectedValue(new Error("PostgreSQL unavailable"));
    mockedFetchRouteCached.mockImplementation((_env, _ctx, _key, fn) => fn());

    const result = await getIndexContents(env, false, ctx);

    expect(result.events).toEqual({ status: "error" });
    expect(result.recruitmentGroups).toEqual({ status: "error" });
    expect(result.raids.status).toBe("success");
    expect(result.news.status).toBe("success");
    expect(result.overview.campaigns.status).toBe("success");
    expect(mockLogger.error).toHaveBeenCalledWith("Failed to load home event timeline", expect.any(Error));
    expect(getEventMinigameType).not.toHaveBeenCalled();
  });

  it("does not hide a failed recruitment group read as an empty group list", async () => {
    healthySources();
    jest.mocked(getRecruitmentGroupsOrThrow).mockRejectedValue(new Error("BAQL unavailable"));
    mockedFetchRouteCached.mockImplementation((_env, _ctx, _key, fn) => fn());

    const result = await getIndexContents(env, false, ctx);

    expect(result.recruitmentGroups).toEqual({ status: "error" });
    expect(mockLogger.error).toHaveBeenCalledWith("Failed to load home recruitment groups", expect.any(Error));
  });

  it("gives every concurrent caller of a payload with a failed source the partial contents, not a rejection", async () => {
    healthySources();
    jest.mocked(getTimelineContentsByContentTypes).mockRejectedValue(new Error("PostgreSQL unavailable"));
    // The route cache shares one in-flight read per key, so both callers receive the same incomplete generator.
    const inflight = new Map<string, Promise<unknown>>();
    mockedFetchRouteCached.mockImplementation((_env, _ctx, key, fn) => {
      if (!inflight.has(key)) {
        inflight.set(
          key,
          fn().finally(() => inflight.delete(key)),
        );
      }
      return inflight.get(key) as never;
    });

    const [first, second] = await Promise.all([getIndexContents(env, false, ctx), getIndexContents(env, false, ctx)]);

    expect(first.events).toEqual({ status: "error" });
    expect(second.events).toEqual({ status: "error" });
    expect(second.news).toEqual({ status: "success", data: [] });
    expect(second.raids.status).toBe("success");
  });
});

describe("getIndexContents recruitment groups", () => {
  // An event that stays ongoing for the test, listing the recruitment students it shows.
  function timelineEvent(uid: string, recruitmentStudentUids: string[] | null) {
    return {
      uid,
      name: uid,
      contentType: "event",
      startAt: "2020-01-01T00:00:00.000Z",
      endAt: "2099-01-01T00:00:00.000Z",
      imageUrl: null,
      recruitmentStudentUids,
    } as never;
  }

  function recruitment(studentUid: string) {
    return {
      student: { uid: studentUid, name: studentUid, attackType: "explode", defenseType: "pierce", role: "striker" },
      studentName: studentUid,
      recruitmentType: "usual",
      pickup: true,
      rerun: false,
      since: "2020-01-01T00:00:00.000Z",
      until: "2099-01-01T00:00:00.000Z",
    };
  }

  it("gives each student the event that lists the student when a group is shared by two events", async () => {
    healthySources();
    const eventA = timelineEvent("event-a", ["student-a"]);
    const eventB = timelineEvent("event-b", ["student-b"]);
    jest.mocked(getTimelineContentsByContentTypes).mockResolvedValue([eventA, eventB]);
    jest
      .mocked(groupTimelineContentsByRecruitmentGroupUid)
      .mockReturnValue(new Map([["group-1", [eventA, eventB]]]) as never);
    jest.mocked(findEventsForRecruitmentStudent).mockImplementation((events, studentUid) => {
      const matches = events.filter(
        (event) =>
          event.recruitmentStudentUids === null ||
          (studentUid !== null && event.recruitmentStudentUids.includes(studentUid)),
      );
      return matches.length > 0 ? matches : events;
    });
    jest
      .mocked(getRecruitmentGroupsOrThrow)
      .mockResolvedValue([
        { uid: "group-1", recruitments: [recruitment("student-a"), recruitment("student-b")] },
      ] as never);
    mockedFetchRouteCached.mockImplementation((_env, _ctx, _key, fn) => fn());

    const result = await getIndexContents(env, false, ctx);

    expect(result.recruitmentGroups.status).toBe("success");
    if (result.recruitmentGroups.status !== "success") return;
    const [group] = result.recruitmentGroups.data;
    // The group's display event follows its first student, as before.
    expect(group.eventUid).toBe("event-a");
    expect(group.recruitments.map((item) => [item.favoriteKey, item.contentUid])).toEqual([
      ["student-a", "event-a"],
      ["student-b", "event-b"],
    ]);
  });
});

describe("getHomeFavoritedCounts", () => {
  const groups = {
    status: "success",
    data: [{ groupUid: "group-1", recruitments: [{ favoriteKey: "student-a", contentUid: "event-a" }] }],
  } as never;

  it("reads the counts of the recruitments on screen, per request", async () => {
    jest.mocked(getFavoritedCounts).mockResolvedValue([
      { studentId: "student-a", contentId: "event-a", count: 3 },
      { studentId: "student-b", contentId: "event-b", count: 9 },
    ] as never);

    await expect(getHomeFavoritedCounts(env, groups, ctx)).resolves.toEqual({
      status: "success",
      data: [{ studentId: "student-a", contentId: "event-a", count: 3 }],
    });
    expect(getFavoritedCounts).toHaveBeenCalledWith(env, ["student-a"], { ctx });
  });

  it("reports only the counts as failed, and skips the read when the groups failed", async () => {
    jest.mocked(getFavoritedCounts).mockRejectedValue(new Error("D1 unavailable"));
    await expect(getHomeFavoritedCounts(env, groups, ctx)).resolves.toEqual({ status: "error" });
    expect(mockLogger.error).toHaveBeenCalledWith("Failed to load home favorited counts", expect.any(Error));

    jest.mocked(getFavoritedCounts).mockClear();
    await expect(getHomeFavoritedCounts(env, { status: "error" }, ctx)).resolves.toEqual({ status: "error" });
    expect(getFavoritedCounts).not.toHaveBeenCalled();
  });
});

describe("getHomeBirthdaySource", () => {
  const now = "2026-10-16T03:00:00.000Z";
  const options = { now, timeZone: "Asia/Seoul" };

  it("reads a string birthday from the cached BAQL payload as well as a Date, and merges skins by character UID", async () => {
    jest.mocked(getAllStudents).mockResolvedValue([
      { uid: "26002", name: "주리", birthday: "0000-10-20" },
      { uid: "10114", name: "주리(아르바이트)", birthday: "0000-10-20" },
      { uid: "16008", name: "후부키", birthday: new Date("0000-10-21T00:00:00.000Z") },
      { uid: "20037", name: "후부키(수영복)", birthday: new Date("0000-10-21T00:00:00.000Z") },
    ] as never);
    jest.mocked(getStudentCharacterUids).mockResolvedValue(
      new Map([
        ["26002", "26002"],
        ["10114", "26002"],
        ["16008", "16008"],
        ["20037", "16008"],
      ]),
    );

    await expect(getHomeBirthdaySource(env, options)).resolves.toEqual({
      status: "success",
      data: [
        { uid: "26002", name: "주리", monthDay: "10-20", daysUntil: 4 },
        { uid: "16008", name: "후부키", monthDay: "10-21", daysUntil: 5 },
      ],
    });
    expect(getStudentCharacterUids).toHaveBeenCalledWith(env, ["26002", "10114", "16008", "20037"]);
  });

  it("leaves out a student without a birthday and keeps the valid birthdays", async () => {
    jest.mocked(getAllStudents).mockResolvedValue([
      { uid: "no-birthday", name: "생일 없음", birthday: null },
      { uid: "26002", name: "주리", birthday: "0000-10-20" },
    ] as never);
    jest.mocked(getStudentCharacterUids).mockResolvedValue(new Map([["26002", "26002"]]));

    await expect(getHomeBirthdaySource(env, options)).resolves.toEqual({
      status: "success",
      data: [{ uid: "26002", name: "주리", monthDay: "10-20", daysUntil: 4 }],
    });
    expect(getStudentCharacterUids).toHaveBeenCalledWith(env, ["26002"]);
  });

  it("reports a birthday value that is not a date as a failed source", async () => {
    jest.mocked(getAllStudents).mockResolvedValue([{ uid: "bad", name: "잘못된", birthday: "unknown" }] as never);
    jest.mocked(getStudentCharacterUids).mockResolvedValue(new Map());
    await expect(getHomeBirthdaySource(env, options)).resolves.toEqual({ status: "error" });
  });

  it("looks up the 30-day window and keeps the nearest five entries after the character merge", async () => {
    jest.mocked(getAllStudents).mockResolvedValue([
      { uid: "10114", name: "주리(아르바이트)", birthday: "0000-10-16" },
      { uid: "26002", name: "주리", birthday: "0000-10-16" },
      { uid: "p1", name: "가", birthday: "0000-10-17" },
      { uid: "p2", name: "나", birthday: "0000-11-01" },
      { uid: "p3", name: "다", birthday: "0000-10-20" },
      { uid: "p4", name: "라", birthday: "0000-10-25" },
      { uid: "p5", name: "마", birthday: "0000-11-14" },
      { uid: "outside", name: "범위 밖", birthday: "0000-11-15" },
    ] as never);
    jest.mocked(getStudentCharacterUids).mockResolvedValue(
      new Map([
        ["10114", "26002"],
        ["26002", "26002"],
        ["p1", "p1"],
        ["p2", "p2"],
        ["p3", "p3"],
        ["p4", "p4"],
        ["p5", "p5"],
        ["outside", "outside"],
      ]),
    );

    await expect(getHomeBirthdaySource(env, options)).resolves.toEqual({
      status: "success",
      data: [
        { uid: "26002", name: "주리", monthDay: "10-16", daysUntil: 0 },
        { uid: "p1", name: "가", monthDay: "10-17", daysUntil: 1 },
        { uid: "p3", name: "다", monthDay: "10-20", daysUntil: 4 },
        { uid: "p4", name: "라", monthDay: "10-25", daysUntil: 9 },
        { uid: "p2", name: "나", monthDay: "11-01", daysUntil: 16 },
      ],
    });
    // Only students whose birthday falls inside the window are looked up; "outside" (11-15) is not.
    expect(getStudentCharacterUids).toHaveBeenCalledWith(env, ["10114", "26002", "p1", "p2", "p3", "p4", "p5"]);
  });
});
