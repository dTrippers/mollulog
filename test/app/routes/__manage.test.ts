import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getFutureContents, getIndexContents, getNavigationBarContentsRaw } from "~/models/content";
import { getEventList, syncEventContentsList } from "~/models/event-content";
import { getMainStories } from "~/models/main-story";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import type { Sensei } from "~/models/sensei";
import { syncRawStudents } from "~/models/student";
import { syncAllTimelineContentsMeta } from "~/models/timeline-content";
import { syncYoutubeCommunityPosts } from "~/models/youtube";
import { RaidRepository, RecruitmentRepository } from "~/repositories";
import { getItemCatalogResources } from "~/repositories/item-catalog";
import { getCampaignFarmingStages } from "~/repositories/stage";

function makeSensei(overrides: Partial<Sensei>): Sensei {
  return {
    id: 0,
    uid: "test-uid",
    username: "tester",
    friendCode: null,
    profileStudentId: null,
    bio: null,
    active: true,
    role: "guest",
    ...overrides,
  };
}

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

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

jest.mock("~/models/content", () => ({
  getFutureContents: jest.fn(),
  getIndexContents: jest.fn(),
  getNavigationBarContentsRaw: jest.fn(),
}));

jest.mock("~/models/event-content", () => ({
  getEventList: jest.fn(),
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

import { action, loader } from "../../../app/routes/[__manage]";

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedSyncRawStudents = syncRawStudents as jest.MockedFunction<typeof syncRawStudents>;
const mockedSyncYoutubeCommunityPosts = syncYoutubeCommunityPosts as jest.MockedFunction<
  typeof syncYoutubeCommunityPosts
>;
const mockedGetFutureContents = getFutureContents as jest.MockedFunction<typeof getFutureContents>;
const mockedGetIndexContents = getIndexContents as jest.MockedFunction<typeof getIndexContents>;
const mockedGetNavigationBarContentsRaw = getNavigationBarContentsRaw as jest.MockedFunction<
  typeof getNavigationBarContentsRaw
>;
const mockedGetEventList = getEventList as jest.MockedFunction<typeof getEventList>;
const mockedSyncEventContentsList = syncEventContentsList as jest.MockedFunction<typeof syncEventContentsList>;
const mockedGetMainStories = getMainStories as jest.MockedFunction<typeof getMainStories>;
const mockedGetAllStudentsFavoriteItems = getAllStudentsFavoriteItems as jest.MockedFunction<
  typeof getAllStudentsFavoriteItems
>;
const mockedSyncAllTimelineContentsMeta = syncAllTimelineContentsMeta as jest.MockedFunction<
  typeof syncAllTimelineContentsMeta
>;
const mockedGetItemCatalogResources = getItemCatalogResources as jest.MockedFunction<typeof getItemCatalogResources>;
const mockedGetCampaignFarmingStages = getCampaignFarmingStages as jest.MockedFunction<typeof getCampaignFarmingStages>;
const MockedRecruitmentRepository = RecruitmentRepository as jest.MockedClass<typeof RecruitmentRepository>;
const MockedRaidRepository = RaidRepository as jest.MockedClass<typeof RaidRepository>;

type ManageActionResponse = {
  intent: "cache.refresh" | "unknown";
  result?: {
    ok: boolean;
    ranAt: string;
    durations?: Record<string, number>;
    errors?: Record<string, string>;
  };
  error?: string;
};

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
type DataResult<T> = {
  type: "DataWithResponseInit";
  data: T;
  init: ResponseInit | null;
};

function createLoaderArgs(): LoaderArgs {
  return {
    request: new Request("https://mollulog.net/__manage", { method: "GET" }),
    context: { cloudflare: { env: {} as Env, ctx: {} as ExecutionContext } },
    params: {},
  } as unknown as LoaderArgs;
}

function createActionArgs(intent = "cache.refresh"): ActionArgs {
  return {
    request: new Request("https://mollulog.net/__manage", {
      method: "POST",
      body: new URLSearchParams({ intent }),
    }),
    context: { cloudflare: { env: {} as Env, ctx: {} as ExecutionContext } },
    params: {},
  } as unknown as ActionArgs;
}

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

function dataStatus(result: DataResult<unknown>): number {
  return result.init?.status ?? 200;
}

function expectResponse(result: unknown): Response {
  expect(result).toBeInstanceOf(Response);
  return result as Response;
}

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
  mockedGetEventList.mockResolvedValue([]);
  mockedGetIndexContents.mockResolvedValue({
    mainEvent: null,
    currentRaids: [],
    currentRecruitments: [],
    favoritedCounts: [],
  });
  mockedGetFutureContents.mockResolvedValue([]);
  mockedGetNavigationBarContentsRaw.mockResolvedValue({
    eventCandidates: [],
    latestNewsTime: null,
    couponActivePeriods: [],
  });
});

describe("__manage route", () => {
  it("allows admins to load the manage page", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));

    const response = expectDataResult(await loader(createLoaderArgs()));

    expect(dataStatus(response)).toBe(200);
  });

  it("runs refresh tasks for admins and returns task durations", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));

    const response = expectDataResult<ManageActionResponse>(await action(createActionArgs("cache.refresh")));
    const body = response.data;

    expect(dataStatus(response)).toBe(200);
    expect(body).toMatchObject({
      intent: "cache.refresh",
      result: {
        ok: true,
        durations: {
          syncYoutubeCommunityPosts: expect.any(Number),
          syncRawStudents: expect.any(Number),
          "RecruitmentRepository.refresh": expect.any(Number),
          "RaidRepository.refresh": expect.any(Number),
          getMainStories: expect.any(Number),
          getAllStudentsFavoriteItems: expect.any(Number),
          syncAllTimelineContentsMeta: expect.any(Number),
          syncEventContentsList: expect.any(Number),
          getItemCatalogResources: expect.any(Number),
          getCampaignFarmingStages: expect.any(Number),
          getEventList: expect.any(Number),
          getIndexContents: expect.any(Number),
          getFutureContents: expect.any(Number),
          getNavigationBarContentsRaw: expect.any(Number),
        },
      },
    });
    expect(body.result?.ranAt).toEqual(expect.any(String));
    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledWith(expect.anything());
    expect(mockedGetMainStories).toHaveBeenCalledWith(expect.anything(), true);
    expect(mockedGetAllStudentsFavoriteItems).toHaveBeenCalledWith(expect.anything(), true);
    expect(mockedSyncAllTimelineContentsMeta).toHaveBeenCalledWith(expect.anything());
    expect(mockedSyncEventContentsList).toHaveBeenCalledWith(expect.anything());
    expect(mockedGetItemCatalogResources).toHaveBeenCalledWith(expect.anything(), true);
    expect(mockedGetCampaignFarmingStages).toHaveBeenCalledWith(expect.anything(), true);
    expect(mockedGetEventList).toHaveBeenCalledWith(expect.anything(), undefined, true, expect.anything());
    expect(mockedGetIndexContents).toHaveBeenCalledWith(expect.anything(), true, expect.anything());
    expect(mockedGetFutureContents).toHaveBeenCalledWith(expect.anything(), true, expect.anything());
    expect(mockedGetNavigationBarContentsRaw).toHaveBeenCalledWith(expect.anything(), true, expect.anything());
    expect(MockedRecruitmentRepository).toHaveBeenCalledWith(expect.anything());
    expect(MockedRaidRepository).toHaveBeenCalledWith(expect.anything());
  });

  it("captures elapsed duration and skips composite refresh when a leaf task fails", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));
    mockRaidRefresh.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("raid refresh failed")), 5);
        }),
    );

    const response = expectDataResult<ManageActionResponse>(await action(createActionArgs("cache.refresh")));
    const body = response.data;

    expect(dataStatus(response)).toBe(200);
    expect(body.result?.ok).toBe(false);
    expect(body.result?.errors).toEqual({ "RaidRepository.refresh": "raid refresh failed" });
    expect(body.result?.durations?.["RaidRepository.refresh"]).toBeGreaterThan(0);
    expect(mockedGetFutureContents).not.toHaveBeenCalled();
    expect(mockedGetEventList).not.toHaveBeenCalled();
    expect(mockedGetIndexContents).not.toHaveBeenCalled();
    expect(mockedGetNavigationBarContentsRaw).not.toHaveBeenCalled();
  });

  it("rejects non-admin users from loader and action", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 2, role: "guest" }));

    await expect(loader(createLoaderArgs())).resolves.toHaveProperty("status", 403);
    await expect(action(createActionArgs())).resolves.toHaveProperty("status", 403);
  });

  it("redirects anonymous requests from loader and action", async () => {
    mockedGetActiveSensei.mockResolvedValue(null);

    const loaderResponse = expectResponse(await loader(createLoaderArgs()));
    const actionResponse = expectResponse(await action(createActionArgs()));

    expect(loaderResponse.status).toBe(302);
    expect(loaderResponse.headers.get("Location")).toBe("/unauthorized");
    expect(actionResponse.status).toBe(302);
    expect(actionResponse.headers.get("Location")).toBe("/unauthorized");
  });

  it("returns 400 for unknown intents", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));

    const response = expectDataResult<ManageActionResponse>(await action(createActionArgs("unknown")));
    const body = response.data;

    expect(dataStatus(response)).toBe(400);
    expect(body).toEqual({ intent: "unknown", error: "Unsupported intent: unknown" });
  });
});
