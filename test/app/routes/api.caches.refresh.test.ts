import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { syncTimelineContents } from "~/jobs/sync-timeline-contents";
import { getFutureContents, getNavigationBarContentsRaw } from "~/models/content";
import { getMainStories } from "~/models/main-story";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import type { Sensei } from "~/models/sensei";
import { syncRawStudents } from "~/models/student";
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

jest.mock("~/models/main-story", () => ({
  getMainStories: jest.fn(),
}));

jest.mock("~/models/resource", () => ({
  getAllStudentsFavoriteItems: jest.fn(),
}));

jest.mock("~/models/student", () => ({
  syncRawStudents: jest.fn(),
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

import { action } from "../../../app/routes/api.caches.$command";

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedSyncTimelineContents = syncTimelineContents as jest.MockedFunction<typeof syncTimelineContents>;
const mockedSyncRawStudents = syncRawStudents as jest.MockedFunction<typeof syncRawStudents>;
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

type RefreshActionResponse = {
  ok: boolean;
  ranAt: string;
  durations: Record<string, number>;
  errors?: Record<string, string>;
};

type ActionArgs = Parameters<typeof action>[0];

function createActionArgs(command = "refresh"): ActionArgs {
  // React Router's ActionFunctionArgs includes internal fields such as unstable_*,
  // but this test only uses request/context/params. Use one unknown bridge to allow a partial mock.
  return {
    request: new Request(`https://mollulog.net/api/caches/${command}`, { method: "POST" }),
    context: { cloudflare: { env: {} as Env, ctx: {} as ExecutionContext } },
    params: { command },
  } as unknown as ActionArgs;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedSyncTimelineContents.mockResolvedValue(undefined);
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

describe("api.caches refresh action", () => {
  it("runs refresh tasks for admins and returns task durations", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));

    const response = await action(createActionArgs());
    const body = (await response.json()) as RefreshActionResponse;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      durations: {
        syncTimelineContents: expect.any(Number),
        syncRawStudents: expect.any(Number),
        "RecruitmentRepository.refresh": expect.any(Number),
        "RaidRepository.refresh": expect.any(Number),
        getMainStories: expect.any(Number),
        getAllStudentsFavoriteItems: expect.any(Number),
        getFutureContents: expect.any(Number),
        getNavigationBarContentsRaw: expect.any(Number),
      },
    });
    expect(body.ranAt).toEqual(expect.any(String));
    expect(mockedSyncTimelineContents).toHaveBeenCalledWith(expect.anything(), expect.anything());
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

    const response = await action(createActionArgs());
    const body = (await response.json()) as RefreshActionResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.errors).toEqual({ "RaidRepository.refresh": "raid refresh failed" });
    expect(body.durations["RaidRepository.refresh"]).toBeGreaterThan(0);
    expect(mockedGetFutureContents).not.toHaveBeenCalled();
    expect(mockedGetNavigationBarContentsRaw).not.toHaveBeenCalled();
  });

  it("rejects non-admin users", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 2, role: "guest" }));

    const response = await action(createActionArgs());

    expect(response.status).toBe(403);
  });

  it("redirects anonymous requests", async () => {
    mockedGetActiveSensei.mockResolvedValue(null);

    const response = await action(createActionArgs());

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/unauthorized");
  });

  it("returns 400 for unknown commands", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));

    const response = await action(createActionArgs("unknown"));

    expect(response.status).toBe(400);
  });
});
