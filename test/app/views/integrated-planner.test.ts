import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { EventShopState } from "~/domain/event-shop-state";

const mockGetEventContentSchedule = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetEventMetadata = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetEventShopContent = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetShopAvailableEvents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetEventShopStates = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetUserFavoritedStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitmentResults = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitedStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitmentGroupsByUids = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPyroxeneUserState = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPyroxenePlannerContents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetTimelineContentDatesByContentUid = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/models/event-content", () => ({
  getEventContentSchedule: mockGetEventContentSchedule,
  getEventMetadata: mockGetEventMetadata,
  getEventShopContent: mockGetEventShopContent,
  getShopAvailableEvents: mockGetShopAvailableEvents,
}));
jest.mock("~/models/event-shop-state", () => ({ getEventShopStates: mockGetEventShopStates }));
jest.mock("~/models/favorite-students", () => ({ getUserFavoritedStudents: mockGetUserFavoritedStudents }));
jest.mock("~/models/recruitment-result.server", () => ({
  getRecruitmentResultsByRecruitmentGroupUids: mockGetRecruitmentResults,
}));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: mockGetRecruitedStudents }));
jest.mock("~/models/recruitment", () => ({ getRecruitmentGroupsByUids: mockGetRecruitmentGroupsByUids }));
jest.mock("~/models/pyroxene-planner", () => ({ getPyroxeneUserState: mockGetPyroxeneUserState }));
jest.mock("~/views/pyroxene", () => ({ getPyroxenePlannerContents: mockGetPyroxenePlannerContents }));
jest.mock("~/models/timeline-content.server", () => ({
  getTimelineContentDatesByContentUid: mockGetTimelineContentDatesByContentUid,
}));

import { getIntegratedPlannerData } from "~/views/integrated-planner";

const env = {} as Env;
const ctx = {} as ExecutionContext;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetEventContentSchedule.mockResolvedValue(null);
  mockGetEventMetadata.mockResolvedValue({
    name: "Event",
    contentType: "event",
    runType: "first",
    since: "2026-09-01T00:00:00.000Z",
    until: "2026-09-30T00:00:00.000Z",
    contentUid: "content-1",
    shopContentUid: "canonical-shop-1",
  });
  mockGetEventShopContent.mockResolvedValue({ shopResources: [{}] });
  mockGetShopAvailableEvents.mockResolvedValue([{ uid: "timeline-event-1", name: "Event" }]);
  mockGetUserFavoritedStudents.mockResolvedValue([]);
  mockGetEventShopStates.mockResolvedValue({});
  mockGetRecruitmentResults.mockResolvedValue([]);
  mockGetRecruitedStudents.mockResolvedValue([]);
  mockGetRecruitmentGroupsByUids.mockResolvedValue([]);
  mockGetPyroxeneUserState.mockResolvedValue({
    latestResources: null,
    timelineItems: [],
    options: null,
    eventData: [],
    collectedSourceKeys: new Set(),
  });
  mockGetPyroxenePlannerContents.mockResolvedValue([]);
  mockGetTimelineContentDatesByContentUid.mockResolvedValue({
    startAt: "2026-09-01T00:00:00.000Z",
    endAt: "2026-09-30T00:00:00.000Z",
  });
});

describe("integrated planner view", () => {
  it("batch-loads multiple shop states, preferring canonical records and using legacy fallbacks", async () => {
    mockGetShopAvailableEvents.mockResolvedValue([
      { uid: "timeline-event-1", name: "Event 1" },
      { uid: "timeline-event-2", name: "Event 2" },
      { uid: "timeline-event-3", name: "Event 3" },
      { uid: "timeline-event-missing", name: "Missing event" },
    ]);
    mockGetEventMetadata.mockImplementation(async (...args) => {
      const timelineUid = args[1];
      if (timelineUid === "timeline-event-missing") return null;
      if (typeof timelineUid !== "string") return null;
      const shopContentUid =
        timelineUid === "timeline-event-1"
          ? "canonical-shop-1"
          : timelineUid === "timeline-event-2"
            ? "canonical-shop-2"
            : "canonical-shop-3";
      return {
        name: timelineUid,
        contentType: "event",
        runType: "first",
        since: "2026-09-01T00:00:00.000Z",
        until: "2026-09-30T00:00:00.000Z",
        contentUid: timelineUid,
        shopContentUid,
      };
    });
    const canonicalState = { id: "canonical" } as unknown as EventShopState;
    const legacyState = { id: "legacy" } as unknown as EventShopState;
    const fallbackState = { id: "fallback" } as unknown as EventShopState;
    mockGetEventShopStates.mockResolvedValue({
      "canonical-shop-1": canonicalState,
      "timeline-event-1": legacyState,
      "timeline-event-2": fallbackState,
    });

    const result = await getIntegratedPlannerData(env, 7, ctx);

    expect(mockGetEventShopStates).toHaveBeenCalledTimes(1);
    expect(mockGetEventShopStates).toHaveBeenCalledWith(
      env,
      7,
      [
        "canonical-shop-1",
        "timeline-event-1",
        "canonical-shop-2",
        "timeline-event-2",
        "canonical-shop-3",
        "timeline-event-3",
      ],
      { ctx },
    );
    expect(result.shopEvents[0]?.accountState).toBe(canonicalState);
    expect(result.shopEvents[0]?.accountStateStatus).toBe("available");
    expect(result.shopEvents[1]?.accountState).toBe(fallbackState);
    expect(result.shopEvents[2]?.accountState).toBeNull();
    expect(result.shopEvents[2]?.accountStateStatus).toBe("available");
    expect(result.shopEvents[3]).toMatchObject({ status: "unavailable", accountStateStatus: "unavailable" });
  });

  it("keeps account shop state explicitly unavailable when the batch read fails", async () => {
    mockGetEventShopStates.mockRejectedValue(new Error("database unavailable"));

    const result = await getIntegratedPlannerData(env, 7, ctx);

    expect(result.shopEvents[0]).toMatchObject({
      status: "available",
      accountState: null,
      accountStateStatus: "unavailable",
    });
  });

  it("does not read account shop states for guests", async () => {
    const result = await getIntegratedPlannerData(env, null, ctx);

    expect(mockGetEventShopStates).not.toHaveBeenCalled();
    expect(result.shopEvents[0]).toMatchObject({ accountState: null, accountStateStatus: "available" });
  });
});
