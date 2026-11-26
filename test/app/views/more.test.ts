import { describe, expect, it, jest } from "@jest/globals";

const mockGetNavigationBarContents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPyroxenePlannerContents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitmentResultsByRecruitmentGroupUids = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitedStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitmentResults = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPyroxeneUserState = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetUserFavoritedStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRelationshipLevels = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCountUnregisteredActiveCoupons = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAllStudentsMap = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/views/navigation", () => ({ getNavigationBarContents: mockGetNavigationBarContents }));
jest.mock("~/views/pyroxene", () => ({ getPyroxenePlannerContents: mockGetPyroxenePlannerContents }));
jest.mock("~/models/recruitment-result.server", () => ({
  getRecruitmentResults: mockGetRecruitmentResults,
  getRecruitmentResultsByRecruitmentGroupUids: mockGetRecruitmentResultsByRecruitmentGroupUids,
}));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: mockGetRecruitedStudents }));
jest.mock("~/models/pyroxene-planner", () => ({ getPyroxeneUserState: mockGetPyroxeneUserState }));
jest.mock("~/models/favorite-students", () => ({ getUserFavoritedStudents: mockGetUserFavoritedStudents }));
jest.mock("~/models/relationship-level", () => ({ getRelationshipLevels: mockGetRelationshipLevels }));
jest.mock("~/models/coupon", () => ({ countUnregisteredActiveCoupons: mockCountUnregisteredActiveCoupons }));
jest.mock("~/models/student", () => ({ getAllStudentsMap: mockGetAllStudentsMap }));

import { getMoreViewData } from "~/views/more";

mockGetAllStudentsMap.mockResolvedValue({ "student-0": { uid: "student-0", name: "무츠키(드레스)" } });

describe("More view relationship summary", () => {
  it("counts all target students while showing at most three chips", async () => {
    mockGetNavigationBarContents.mockResolvedValue({
      upcomingEvent: null,
      hasRecentNews: false,
      hasOngoingRaid: false,
      hasUnconsumedCoupons: false,
      hasUnreadFeedbackReplies: false,
    });
    mockGetPyroxenePlannerContents.mockResolvedValue([]);
    mockGetRecruitmentResultsByRecruitmentGroupUids.mockResolvedValue([]);
    mockGetRecruitedStudents.mockResolvedValue([]);
    mockGetRecruitmentResults.mockResolvedValue([]);
    mockGetPyroxeneUserState.mockResolvedValue({
      latestResources: null,
      options: {},
      eventData: [],
      timelineItems: [],
      collectedSourceKeys: [],
    });
    mockGetUserFavoritedStudents.mockResolvedValue([]);
    mockGetRelationshipLevels.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        studentId: `student-${index}`,
        currentLevel: 10,
        currentExp: null,
        targetLevel: 20,
        items: {},
      })),
    );
    mockCountUnregisteredActiveCoupons.mockResolvedValue(0);

    const result = await getMoreViewData(
      {} as Env,
      {} as ExecutionContext,
      {
        id: 1,
        username: "sensei",
        profileStudentId: null,
      } as never,
    );

    expect(result.summary?.relationship).toEqual({
      savedCount: 5,
      targetStudentCount: 5,
      targetStudents: [
        { uid: "student-0", name: "무츠키(드레스)", currentLevel: 10 },
        { uid: "student-1", name: null, currentLevel: 10 },
        { uid: "student-2", name: null, currentLevel: 10 },
      ],
    });
  });

  it("counts recorded recruitment results as pickup history", async () => {
    mockGetRelationshipLevels.mockResolvedValue([]);
    mockGetRecruitmentResults.mockResolvedValue([
      { completedAt: "2026-10-01T00:00:00Z", recruitedStudents: [], exchangedStudents: [] },
      { completedAt: null, recruitedStudents: [{ studentUid: "student-0" }], exchangedStudents: [] },
      { completedAt: null, recruitedStudents: [], exchangedStudents: [{ studentUid: "student-1" }] },
      { completedAt: null, recruitedStudents: [], exchangedStudents: [] },
    ]);

    const result = await getMoreViewData(
      {} as Env,
      {} as ExecutionContext,
      {
        id: 1,
        username: "sensei",
        profileStudentId: null,
      } as never,
    );

    expect(result.summary?.pickupHistoryCount).toBe(3);
  });
});

describe("More view account", () => {
  it("returns no account and no summary for a guest", async () => {
    const callsBefore = mockGetRecruitedStudents.mock.calls.length;

    const result = await getMoreViewData({} as Env, {} as ExecutionContext, null);

    expect(result).toEqual({ account: null, summary: null });
    expect(mockGetRecruitedStudents.mock.calls.length).toBe(callsBefore);
  });

  it("keeps the account and drops only the summary when a summary query fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      mockGetRecruitedStudents.mockRejectedValueOnce(new Error("database unavailable"));

      const result = await getMoreViewData(
        {} as Env,
        {} as ExecutionContext,
        { id: 1, username: "sensei", profileStudentId: "10000" } as never,
      );

      expect(result).toEqual({ account: { username: "sensei", profileStudentId: "10000" }, summary: null });
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("More view next recruitment pyroxene", () => {
  it("counts a purchase recorded on the day a recruitment opened before that recruitment", async () => {
    const recordedAt = "2026-11-21T12:15:00.000Z"; // 21:15 KST on 11/21
    jest.useFakeTimers({ now: new Date(recordedAt), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    try {
      mockGetNavigationBarContents.mockResolvedValue({
        upcomingEvent: null,
        hasRecentNews: false,
        hasOngoingRaid: false,
        hasUnconsumedCoupons: false,
        hasUnreadFeedbackReplies: false,
      });
      // A recruitment that opened at 11:00 KST on 11/21.
      mockGetPyroxenePlannerContents.mockResolvedValue([
        {
          kind: "event",
          uid: "recruitment",
          name: "같은 날 열린 모집",
          imageUrl: null,
          since: "2026-11-21T02:00:00.000Z",
          until: "2026-11-28T02:00:00.000Z",
          earnablePyroxene: null,
          tags: [],
          recruitmentGroupUid: null,
          recruitments: [
            {
              recruitmentType: "usual",
              pickup: true,
              rerun: false,
              until: "2026-11-28T02:00:00.000Z",
              student: { uid: "student-0", imageUid: "student-image-0", name: "학생", initialTier: 3 },
            },
          ],
        },
      ]);
      mockGetRecruitmentResultsByRecruitmentGroupUids.mockResolvedValue([]);
      mockGetRecruitedStudents.mockResolvedValue([]);
      mockGetRecruitmentResults.mockResolvedValue([]);
      mockGetUserFavoritedStudents.mockResolvedValue([{ contentId: "recruitment", studentId: "student-0" }]);
      mockGetRelationshipLevels.mockResolvedValue([]);
      mockCountUnregisteredActiveCoupons.mockResolvedValue(0);
      const expectedPyroxene = async (timelineItems: unknown[]) => {
        mockGetPyroxeneUserState.mockResolvedValue({
          // Inventory entered at 22:00 KST the day before.
          latestResources: {
            userId: 1,
            inputAt: "2026-11-20T13:00:00.000Z",
            pyroxene: 11000,
            oneTimeTicket: 0,
            tenTimeTicket: 0,
          },
          options: {
            event: { pickupChance: "average" },
            raid: { tier: "platinum" },
            tactical: { level: "in100" },
            consumption: { apChargeCount: 0, apChargeExceptions: [] },
            timeline: { display: [] },
          },
          eventData: [],
          timelineItems,
          collectedSourceKeys: [],
        });
        const result = await getMoreViewData(
          {} as Env,
          {} as ExecutionContext,
          { id: 1, username: "sensei", profileStudentId: null } as never,
        );
        return result.summary?.pyroxene?.expectedPyroxene;
      };
      const purchase = {
        uid: "purchase",
        userId: 1,
        eventAt: recordedAt,
        source: "buy",
        repeatType: "fixed_days",
        repeatIntervalDays: null,
        repeatCount: null,
        autoRepurchase: false,
        description: "청휘석 구매",
        pyroxeneDelta: 6600,
        oneTimeTicketDelta: 0,
        tenTimeTicketDelta: 0,
      };

      expect(await expectedPyroxene([])).toBe(11000);
      expect(await expectedPyroxene([purchase])).toBe(17600);

      // The portrait uses the catalog image, not the favorite key, and relationship names include unreleased students.
      const result = await getMoreViewData(
        {} as Env,
        {} as ExecutionContext,
        { id: 1, username: "sensei", profileStudentId: null } as never,
      );
      expect(result.summary?.pyroxene?.nextStudents).toEqual([
        { uid: "student-0", imageUid: "student-image-0", name: "학생" },
      ]);
      expect(mockGetAllStudentsMap).toHaveBeenCalledWith(expect.anything(), true);
    } finally {
      jest.useRealTimers();
    }
  });
});
