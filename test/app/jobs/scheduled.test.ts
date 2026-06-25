import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { syncEventContentsList } from "~/models/event-content";
import { getMainStories } from "~/models/main-story";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import { syncRawStudents } from "~/models/student";
import { syncAllTimelineContentsMeta } from "~/models/timeline-content";
import { syncYoutubeCommunityPosts } from "~/models/youtube";
import { RaidRepository, RecruitmentRepository } from "~/repositories";
import { getItemCatalogResources } from "~/repositories/item-catalog";
import { getCampaignFarmingStages } from "~/repositories/stage";

jest.mock("~/models/main-story", () => ({
  getMainStories: jest.fn(),
}));

jest.mock("~/models/resource", () => ({
  getAllStudentsFavoriteItems: jest.fn(),
}));

jest.mock("~/models/student", () => ({
  syncRawStudents: jest.fn(),
}));

jest.mock("~/models/timeline-content", () => ({
  syncAllTimelineContentsMeta: jest.fn(),
}));

jest.mock("~/models/youtube", () => ({
  syncYoutubeCommunityPosts: jest.fn(),
}));

jest.mock("~/models/event-content", () => ({
  syncEventContentsList: jest.fn(),
}));

jest.mock("~/repositories/item-catalog", () => ({
  getItemCatalogResources: jest.fn(),
}));

jest.mock("~/repositories/stage", () => ({
  getCampaignFarmingStages: jest.fn(),
}));

const mockRecruitmentRefresh = jest.fn<() => Promise<unknown[]>>();
const mockRaidRefresh = jest.fn<() => Promise<unknown[]>>();

jest.mock("~/repositories", () => ({
  RecruitmentRepository: jest.fn().mockImplementation(() => ({ refresh: mockRecruitmentRefresh })),
  RaidRepository: jest.fn().mockImplementation(() => ({ refresh: mockRaidRefresh })),
}));

jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
  })),
}));

import { runScheduledJobs } from "~/jobs/scheduled";

const mockedSyncYoutubeCommunityPosts = syncYoutubeCommunityPosts as jest.MockedFunction<
  typeof syncYoutubeCommunityPosts
>;
const mockedSyncRawStudents = syncRawStudents as jest.MockedFunction<typeof syncRawStudents>;
const mockedSyncAllTimelineContentsMeta = syncAllTimelineContentsMeta as jest.MockedFunction<
  typeof syncAllTimelineContentsMeta
>;
const mockedGetMainStories = getMainStories as jest.MockedFunction<typeof getMainStories>;
const mockedGetAllStudentsFavoriteItems = getAllStudentsFavoriteItems as jest.MockedFunction<
  typeof getAllStudentsFavoriteItems
>;
const mockedSyncEventContentsList = syncEventContentsList as jest.MockedFunction<typeof syncEventContentsList>;
const mockedGetItemCatalogResources = getItemCatalogResources as jest.MockedFunction<typeof getItemCatalogResources>;
const mockedGetCampaignFarmingStages = getCampaignFarmingStages as jest.MockedFunction<typeof getCampaignFarmingStages>;
const MockedRecruitmentRepository = RecruitmentRepository as jest.MockedClass<typeof RecruitmentRepository>;
const MockedRaidRepository = RaidRepository as jest.MockedClass<typeof RaidRepository>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedSyncYoutubeCommunityPosts.mockResolvedValue({ synced: 0 });
  mockedSyncRawStudents.mockResolvedValue([]);
  mockRecruitmentRefresh.mockResolvedValue([]);
  mockRaidRefresh.mockResolvedValue([]);
  mockedGetMainStories.mockResolvedValue([]);
  mockedGetAllStudentsFavoriteItems.mockResolvedValue([]);
  mockedSyncAllTimelineContentsMeta.mockResolvedValue([]);
  mockedSyncEventContentsList.mockResolvedValue([]);
  mockedGetItemCatalogResources.mockResolvedValue([]);
  mockedGetCampaignFarmingStages.mockResolvedValue([]);
});

describe("runScheduledJobs", () => {
  it("runs scheduled sync jobs", async () => {
    const env = {} as Env;
    const ctx = {} as ExecutionContext;

    await runScheduledJobs(env, ctx);

    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledWith(env);
    expect(mockedSyncRawStudents).toHaveBeenCalledWith(env);
    expect(MockedRecruitmentRepository).toHaveBeenCalledWith(env);
    expect(mockRecruitmentRefresh).toHaveBeenCalledWith();
    expect(MockedRaidRepository).toHaveBeenCalledWith(env);
    expect(mockRaidRefresh).toHaveBeenCalledWith();
    expect(mockedGetMainStories).toHaveBeenCalledWith(env, true);
    expect(mockedGetAllStudentsFavoriteItems).toHaveBeenCalledWith(env, true);
    expect(mockedSyncAllTimelineContentsMeta).toHaveBeenCalledWith(env);
    expect(mockedSyncEventContentsList).toHaveBeenCalledWith(env);
    expect(mockedGetItemCatalogResources).toHaveBeenCalledWith(env, true);
    expect(mockedGetCampaignFarmingStages).toHaveBeenCalledWith(env, true);
  });

  it("raises scheduled job failures", async () => {
    mockedSyncYoutubeCommunityPosts.mockRejectedValue(new Error("youtube failed"));

    await expect(runScheduledJobs({} as Env, {} as ExecutionContext)).rejects.toThrow(
      "One or more scheduled jobs failed",
    );
    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledTimes(1);
    expect(mockedSyncAllTimelineContentsMeta).toHaveBeenCalledTimes(1);
    expect(mockedSyncRawStudents).toHaveBeenCalledTimes(1);
  });
});
