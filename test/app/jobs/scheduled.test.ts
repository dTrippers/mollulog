import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { syncEventContentsList } from "~/models/event-content";
import { getStudentGearData } from "~/models/growth-resource";
import { getItemCatalogResources } from "~/models/item-catalog";
import { getMainStories } from "~/models/main-story";
import { warmRaidCache } from "~/models/raid";
import { warmRecruitmentCache } from "~/models/recruitment";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import { getCampaignFarmingStages } from "~/models/stage";
import { getAllStudents, getStudentSkillItemsBatch, syncRawStudents } from "~/models/student";
import { syncAllTimelineContentsMeta } from "~/models/timeline-content";
import { syncYoutubeCommunityPosts } from "~/models/youtube";
import { warmActiveUpcomingEventContent } from "~/views/events";

jest.mock("~/models/main-story", () => ({
  getMainStories: jest.fn(),
}));

jest.mock("~/models/resource", () => ({
  getAllStudentsFavoriteItems: jest.fn(),
}));

jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
  getStudentSkillItemsBatch: jest.fn(),
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

jest.mock("~/views/events", () => ({
  warmActiveUpcomingEventContent: jest.fn(),
}));

jest.mock("~/models/item-catalog", () => ({
  getItemCatalogResources: jest.fn(),
}));

jest.mock("~/models/stage", () => ({
  getCampaignFarmingStages: jest.fn(),
}));

jest.mock("~/models/growth-resource", () => ({
  getStudentGearData: jest.fn(),
}));

jest.mock("~/models/recruitment", () => ({
  warmRecruitmentCache: jest.fn(),
}));

jest.mock("~/models/raid", () => ({
  warmRaidCache: jest.fn(),
}));

jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
  })),
}));

import { runScheduledJobs } from "~/jobs/scheduled";

const SOURCE_WARM_MARKER_KEY = "source::cron-source-warm::v1::name=students-events";

const mockedSyncYoutubeCommunityPosts = syncYoutubeCommunityPosts as jest.MockedFunction<
  typeof syncYoutubeCommunityPosts
>;
const mockedSyncRawStudents = syncRawStudents as jest.MockedFunction<typeof syncRawStudents>;
const mockedGetAllStudents = getAllStudents as jest.MockedFunction<typeof getAllStudents>;
const mockedGetStudentSkillItemsBatch = getStudentSkillItemsBatch as jest.MockedFunction<
  typeof getStudentSkillItemsBatch
>;
const mockedSyncAllTimelineContentsMeta = syncAllTimelineContentsMeta as jest.MockedFunction<
  typeof syncAllTimelineContentsMeta
>;
const mockedGetMainStories = getMainStories as jest.MockedFunction<typeof getMainStories>;
const mockedGetAllStudentsFavoriteItems = getAllStudentsFavoriteItems as jest.MockedFunction<
  typeof getAllStudentsFavoriteItems
>;
const mockedSyncEventContentsList = syncEventContentsList as jest.MockedFunction<typeof syncEventContentsList>;
const mockedWarmActiveUpcomingEventContent = warmActiveUpcomingEventContent as jest.MockedFunction<
  typeof warmActiveUpcomingEventContent
>;
const mockedGetItemCatalogResources = getItemCatalogResources as jest.MockedFunction<typeof getItemCatalogResources>;
const mockedGetCampaignFarmingStages = getCampaignFarmingStages as jest.MockedFunction<typeof getCampaignFarmingStages>;
const mockedGetStudentGearData = getStudentGearData as jest.MockedFunction<typeof getStudentGearData>;
const mockedWarmRecruitmentCache = warmRecruitmentCache as jest.MockedFunction<typeof warmRecruitmentCache>;
const mockedWarmRaidCache = warmRaidCache as jest.MockedFunction<typeof warmRaidCache>;

function createEnv(markerRaw: string | null = null) {
  const kv = {
    get: jest.fn(async (key: string) => (key === SOURCE_WARM_MARKER_KEY ? markerRaw : null)),
    put: jest.fn(async (_key: string, _value: string, _opts?: { expirationTtl?: number }) => undefined),
    delete: jest.fn(async (_key: string) => undefined),
    list: jest.fn(async (_opts?: { prefix?: string; cursor?: string }) => ({ keys: [], list_complete: true })),
  };

  return {
    env: { KV_CACHE: kv } as unknown as Env,
    kv,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedSyncYoutubeCommunityPosts.mockResolvedValue({ synced: 0 });
  mockedSyncRawStudents.mockResolvedValue([]);
  mockedGetAllStudents.mockResolvedValue([{ uid: "10000" }, { uid: "10001" }] as Awaited<
    ReturnType<typeof getAllStudents>
  >);
  mockedGetStudentSkillItemsBatch.mockResolvedValue(new Map());
  mockedGetStudentGearData.mockResolvedValue(new Map());
  mockedWarmRecruitmentCache.mockResolvedValue([]);
  mockedWarmRaidCache.mockResolvedValue([]);
  mockedGetMainStories.mockResolvedValue([]);
  mockedGetAllStudentsFavoriteItems.mockResolvedValue([]);
  mockedSyncAllTimelineContentsMeta.mockResolvedValue([]);
  mockedSyncEventContentsList.mockResolvedValue([]);
  mockedWarmActiveUpcomingEventContent.mockResolvedValue();
  mockedGetItemCatalogResources.mockResolvedValue([]);
  mockedGetCampaignFarmingStages.mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("runScheduledJobs", () => {
  it("runs scheduled sync jobs", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);
    const { env, kv } = createEnv();
    const ctx = {} as ExecutionContext;

    await runScheduledJobs(env, ctx);

    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledWith(env);
    expect(mockedSyncRawStudents).toHaveBeenCalledWith(env);
    expect(mockedWarmRecruitmentCache).toHaveBeenCalledWith(env);
    expect(mockedWarmRaidCache).toHaveBeenCalledWith(env);
    expect(mockedGetMainStories).toHaveBeenCalledWith(env, true);
    expect(mockedGetAllStudentsFavoriteItems).toHaveBeenCalledWith(env, true);
    expect(mockedSyncAllTimelineContentsMeta).toHaveBeenCalledWith(env);
    expect(mockedSyncEventContentsList).toHaveBeenCalledWith(env);
    expect(mockedGetAllStudents).toHaveBeenCalledWith(env, true);
    expect(mockedGetStudentSkillItemsBatch).toHaveBeenCalledWith(env, ["10000", "10001"], false);
    expect(mockedGetStudentGearData).toHaveBeenCalledWith(env, ["10000", "10001"], false);
    expect(mockedWarmActiveUpcomingEventContent).toHaveBeenCalledWith(env, false);
    expect(mockedGetItemCatalogResources).toHaveBeenCalledWith(env, true);
    expect(mockedGetCampaignFarmingStages).toHaveBeenCalledWith(env, true);
    expect(kv.put).toHaveBeenCalledWith(
      SOURCE_WARM_MARKER_KEY,
      JSON.stringify({ _ver: 2, data: true, cachedAt: now }),
      { expirationTtl: 30 * 24 * 60 * 60 },
    );
  });

  it("skips per-uid source warming when the cron marker is fresh", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);
    const { env, kv } = createEnv(JSON.stringify({ _ver: 2, data: true, cachedAt: now - 30 * 60 * 1000 }));

    await runScheduledJobs(env, {} as ExecutionContext);

    expect(kv.get).toHaveBeenCalledWith(SOURCE_WARM_MARKER_KEY);
    expect(kv.put).not.toHaveBeenCalled();
    expect(mockedGetAllStudents).not.toHaveBeenCalled();
    expect(mockedGetStudentSkillItemsBatch).not.toHaveBeenCalled();
    expect(mockedGetStudentGearData).not.toHaveBeenCalled();
    expect(mockedWarmActiveUpcomingEventContent).not.toHaveBeenCalled();
    expect(mockedSyncRawStudents).toHaveBeenCalledWith(env);
    expect(mockedSyncEventContentsList).toHaveBeenCalledWith(env);
  });

  it("runs per-uid source warming and updates the cron marker when the marker is stale", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);
    const { env, kv } = createEnv(JSON.stringify({ _ver: 2, data: true, cachedAt: now - 61 * 60 * 1000 }));

    await runScheduledJobs(env, {} as ExecutionContext);

    expect(kv.put).toHaveBeenCalledWith(
      SOURCE_WARM_MARKER_KEY,
      JSON.stringify({ _ver: 2, data: true, cachedAt: now }),
      { expirationTtl: 30 * 24 * 60 * 60 },
    );
    expect(mockedGetAllStudents).toHaveBeenCalledWith(env, true);
    expect(mockedGetStudentSkillItemsBatch).toHaveBeenCalledWith(env, ["10000", "10001"], false);
    expect(mockedGetStudentGearData).toHaveBeenCalledWith(env, ["10000", "10001"], false);
    expect(mockedWarmActiveUpcomingEventContent).toHaveBeenCalledWith(env, false);
  });

  it("raises scheduled job failures", async () => {
    mockedSyncYoutubeCommunityPosts.mockRejectedValue(new Error("youtube failed"));
    const { env } = createEnv();

    await expect(runScheduledJobs(env, {} as ExecutionContext)).rejects.toThrow("One or more scheduled jobs failed");
    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledTimes(1);
    expect(mockedSyncAllTimelineContentsMeta).toHaveBeenCalledTimes(1);
    expect(mockedSyncRawStudents).toHaveBeenCalledTimes(1);
  });
});
