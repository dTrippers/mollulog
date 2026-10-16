import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { HomeCampaign, HomeJointFiringDrill } from "~/domain/home-content";
import { fetchRouteCached } from "~/lib/cache";
import { getHomeCampaigns, getHomeJointFiringDrills } from "~/models/home-overview";
import { getHomeMainStoryContent } from "~/models/timeline-content.server";
import { getHomeOverviewSources } from "~/views/home";

const mockLogger = { error: jest.fn() };

jest.mock("~/lib/cache", () => ({
  cacheKey: (category: string, domain: string, version: number, query: string) =>
    `${category}::${domain}::v${version}::${query}`,
  cacheQuery: (params: Record<string, string | number | boolean | null | undefined>) =>
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("::") || "all",
  fetchRouteCached: jest.fn(),
}));

jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn(() => mockLogger) }));
jest.mock("~/models/home-overview", () => ({
  getHomeCampaigns: jest.fn(),
  getHomeJointFiringDrills: jest.fn(),
}));
jest.mock("~/models/timeline-content.server", () => ({
  findEventsForRecruitmentStudent: jest.fn(),
  getHomeMainStoryContent: jest.fn(),
  getTimelineContentsByContentTypes: jest.fn(),
  groupTimelineContentsByRecruitmentGroupUid: jest.fn(),
}));

const mockedGetHomeCampaigns = getHomeCampaigns as jest.MockedFunction<typeof getHomeCampaigns>;
const mockedGetHomeJointFiringDrills = getHomeJointFiringDrills as jest.MockedFunction<typeof getHomeJointFiringDrills>;
const mockedGetHomeMainStoryContent = getHomeMainStoryContent as jest.MockedFunction<typeof getHomeMainStoryContent>;
const mockedFetchRouteCached = fetchRouteCached as jest.MockedFunction<typeof fetchRouteCached>;
const env = {} as Env;
const ctx = {} as ExecutionContext;

afterEach(() => {
  jest.clearAllMocks();
});

describe("getHomeOverviewSources", () => {
  it("isolates a campaign source failure while keeping the other new sources available", async () => {
    const drills: HomeJointFiringDrill[] = [];
    const story = null;
    mockedGetHomeCampaigns.mockRejectedValue(new Error("BAQL unavailable"));
    mockedGetHomeJointFiringDrills.mockResolvedValue(drills);
    mockedGetHomeMainStoryContent.mockResolvedValue(story);

    await expect(getHomeOverviewSources(env)).resolves.toEqual({
      campaigns: { status: "error" },
      jointFiringDrills: { status: "success", data: drills },
      mainStoryContent: { status: "success", data: story },
    });
    expect(mockLogger.error).toHaveBeenCalledWith("Failed to load home campaigns", expect.any(Error));
    expect(mockedFetchRouteCached).not.toHaveBeenCalled();
  });

  it("isolates each new source failure and leaves successful sources available", async () => {
    const campaigns = [
      {
        uid: "campaign-1",
        category: ["schedule"],
        multiplier: 2,
        startAt: "2026-09-25T00:00:00.000Z",
        endAt: "2026-09-29T00:00:00.000Z",
      },
    ];
    const story = {
      uid: "story-1",
      name: "메인 스토리",
      startAt: "2026-09-15T00:00:00.000Z",
      endAt: "2026-09-29T00:00:00.000Z",
      imageUrl: null,
    };
    mockedGetHomeCampaigns.mockResolvedValue(campaigns);
    mockedGetHomeJointFiringDrills.mockRejectedValue(new Error("BAQL unavailable"));
    mockedGetHomeMainStoryContent.mockResolvedValue(story as never);

    await expect(getHomeOverviewSources(env, false, ctx)).resolves.toEqual({
      campaigns: { status: "success", data: campaigns },
      jointFiringDrills: { status: "error" },
      mainStoryContent: { status: "success", data: story },
    });
    expect(mockLogger.error).toHaveBeenCalledWith("Failed to load home joint firing drills", expect.any(Error));
    expect(mockedGetHomeCampaigns).toHaveBeenCalledWith(env, false);
    expect(mockedGetHomeJointFiringDrills).toHaveBeenCalledWith(env, false);
    expect(mockedGetHomeMainStoryContent).toHaveBeenCalledWith(env, expect.any(String), { ctx });
    expect(mockedFetchRouteCached).not.toHaveBeenCalled();
  });

  it("reports a failed main story source independently from other home overview sources", async () => {
    const campaigns: HomeCampaign[] = [];
    const drills: HomeJointFiringDrill[] = [];
    mockedGetHomeCampaigns.mockResolvedValue(campaigns);
    mockedGetHomeJointFiringDrills.mockResolvedValue(drills);
    mockedGetHomeMainStoryContent.mockRejectedValue(new Error("PostgreSQL unavailable"));

    await expect(getHomeOverviewSources(env)).resolves.toEqual({
      campaigns: { status: "success", data: campaigns },
      jointFiringDrills: { status: "success", data: drills },
      mainStoryContent: { status: "error" },
    });
    expect(mockLogger.error).toHaveBeenCalledWith("Failed to load home main story contents", expect.any(Error));
    expect(mockedFetchRouteCached).not.toHaveBeenCalled();
  });
});
