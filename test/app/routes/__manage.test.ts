import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { syncTimelineContents } from "~/jobs/sync-timeline-contents";
import { flushCacheAll } from "~/models/base";
import { getFutureContents, getNavigationBarContentsRaw } from "~/models/content";
import { getMainStories } from "~/models/main-story";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import type { Sensei } from "~/models/sensei";
import { syncRawStudents } from "~/models/student";
import { syncYoutubeCommunityPosts } from "~/models/youtube";
import { RaidRepository, RecruitmentRepository } from "~/repositories";

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

jest.mock("~/jobs/sync-timeline-contents", () => ({
  syncTimelineContents: jest.fn(),
}));

jest.mock("~/models/base", () => ({
  flushCacheAll: jest.fn(),
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

jest.mock("~/models/youtube", () => ({
  syncYoutubeCommunityPosts: jest.fn(),
}));

jest.mock("~/models/content", () => ({
  getFutureContents: jest.fn(),
  getNavigationBarContentsRaw: jest.fn(),
}));

const mockRecruitmentRefresh = jest.fn<() => Promise<unknown[]>>();
const mockRaidRefresh = jest.fn<() => Promise<unknown[]>>();

jest.mock("~/repositories", () => ({
  RecruitmentRepository: jest.fn().mockImplementation(() => ({ refresh: mockRecruitmentRefresh })),
  RaidRepository: jest.fn().mockImplementation(() => ({ refresh: mockRaidRefresh })),
}));

import { action, loader } from "../../../app/routes/[__manage]";

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedFlushCacheAll = flushCacheAll as jest.MockedFunction<typeof flushCacheAll>;
const mockedSyncTimelineContents = syncTimelineContents as jest.MockedFunction<typeof syncTimelineContents>;
const mockedSyncRawStudents = syncRawStudents as jest.MockedFunction<typeof syncRawStudents>;
const mockedSyncYoutubeCommunityPosts = syncYoutubeCommunityPosts as jest.MockedFunction<
  typeof syncYoutubeCommunityPosts
>;
const mockedGetFutureContents = getFutureContents as jest.MockedFunction<typeof getFutureContents>;
const mockedGetNavigationBarContentsRaw = getNavigationBarContentsRaw as jest.MockedFunction<
  typeof getNavigationBarContentsRaw
>;
const mockedGetMainStories = getMainStories as jest.MockedFunction<typeof getMainStories>;
const mockedGetAllStudentsFavoriteItems = getAllStudentsFavoriteItems as jest.MockedFunction<
  typeof getAllStudentsFavoriteItems
>;
const MockedRecruitmentRepository = RecruitmentRepository as jest.MockedClass<typeof RecruitmentRepository>;
const MockedRaidRepository = RaidRepository as jest.MockedClass<typeof RaidRepository>;

type ManageActionResponse = {
  intent: "cache.refresh" | "cache.flush" | "unknown";
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
  mockedFlushCacheAll.mockResolvedValue(undefined);
  mockedSyncTimelineContents.mockResolvedValue(undefined);
  mockedSyncYoutubeCommunityPosts.mockResolvedValue({ synced: 0 });
  mockedSyncRawStudents.mockResolvedValue([]);
  mockRecruitmentRefresh.mockResolvedValue([]);
  mockRaidRefresh.mockResolvedValue([]);
  mockedGetMainStories.mockResolvedValue([]);
  mockedGetAllStudentsFavoriteItems.mockResolvedValue([]);
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
          syncTimelineContents: expect.any(Number),
          syncYoutubeCommunityPosts: expect.any(Number),
          syncRawStudents: expect.any(Number),
          "RecruitmentRepository.refresh": expect.any(Number),
          "RaidRepository.refresh": expect.any(Number),
          getMainStories: expect.any(Number),
          getAllStudentsFavoriteItems: expect.any(Number),
          getFutureContents: expect.any(Number),
          getNavigationBarContentsRaw: expect.any(Number),
        },
      },
    });
    expect(body.result?.ranAt).toEqual(expect.any(String));
    expect(mockedSyncTimelineContents).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledWith(expect.anything());
    expect(mockedGetMainStories).toHaveBeenCalledWith(expect.anything(), true);
    expect(mockedGetAllStudentsFavoriteItems).toHaveBeenCalledWith(expect.anything(), true);
    expect(mockedGetFutureContents).toHaveBeenCalledWith(expect.anything(), true);
    expect(mockedGetNavigationBarContentsRaw).toHaveBeenCalledWith(expect.anything(), true);
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
    expect(mockedGetNavigationBarContentsRaw).not.toHaveBeenCalled();
  });

  it("flushes all cache entries for admins", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));

    const response = expectDataResult<ManageActionResponse>(await action(createActionArgs("cache.flush")));
    const body = response.data;

    expect(dataStatus(response)).toBe(200);
    expect(body).toMatchObject({
      intent: "cache.flush",
      result: {
        ok: true,
        ranAt: expect.any(String),
      },
    });
    expect(mockedFlushCacheAll).toHaveBeenCalledWith(expect.anything());
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
