import { describe, expect, it, jest } from "@jest/globals";

const mockGetNavigationBarContents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPyroxenePlannerContents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitmentResultsByRecruitmentGroupUids = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitedStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPickupHistories = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPyroxeneUserState = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetUserFavoritedStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRelationshipLevels = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCountUnregisteredActiveCoupons = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/views/navigation", () => ({ getNavigationBarContents: mockGetNavigationBarContents }));
jest.mock("~/views/pyroxene", () => ({ getPyroxenePlannerContents: mockGetPyroxenePlannerContents }));
jest.mock("~/models/recruitment-result.server", () => ({
  getRecruitmentResultsByRecruitmentGroupUids: mockGetRecruitmentResultsByRecruitmentGroupUids,
}));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: mockGetRecruitedStudents }));
jest.mock("~/models/pickup-history.server", () => ({ getPickupHistories: mockGetPickupHistories }));
jest.mock("~/models/pyroxene-planner", () => ({ getPyroxeneUserState: mockGetPyroxeneUserState }));
jest.mock("~/models/favorite-students", () => ({ getUserFavoritedStudents: mockGetUserFavoritedStudents }));
jest.mock("~/models/relationship-level", () => ({ getRelationshipLevels: mockGetRelationshipLevels }));
jest.mock("~/models/coupon", () => ({ countUnregisteredActiveCoupons: mockCountUnregisteredActiveCoupons }));

import { getMoreViewData } from "~/views/more";

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
    mockGetPickupHistories.mockResolvedValue([]);
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

    expect(result.currentUser?.relationship).toEqual({
      savedCount: 5,
      targetStudentCount: 5,
      targetStudents: [
        { uid: "student-0", currentLevel: 10 },
        { uid: "student-1", currentLevel: 10 },
        { uid: "student-2", currentLevel: 10 },
      ],
    });
  });
});
