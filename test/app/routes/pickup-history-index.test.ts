import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getRecruitmentGroupsByUids, getRecruitmentPoolStudents } from "~/models/recruitment";
import {
  deleteRecruitmentResult,
  getRecruitmentResultComments,
  getRecruitmentResults,
} from "~/models/recruitment-result.server";
import { getSenseiByUsername } from "~/models/sensei";
import { getAllStudentsMap } from "~/models/student";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content.server";
import { action, loader } from "../../../app/routes/$username.pickups._index";

jest.mock("~/components/features/layout", () => ({
  ErrorPage: jest.fn(() => null),
  Page: jest.fn(({ children }: { children?: unknown }) => children ?? null),
  ServerErrorPage: jest.fn(() => null),
}));

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/models/recruitment-result.server", () => ({
  getRecruitmentResults: jest.fn(),
  getRecruitmentResultComments: jest.fn(),
  deleteRecruitmentResult: jest.fn(),
}));

jest.mock("~/models/sensei", () => ({
  getSenseiByUsername: jest.fn(),
  isSenseiProfileVisibleTo: jest.fn(() => true),
}));

jest.mock("~/models/student", () => ({
  getAllStudentsMap: jest.fn(),
}));

jest.mock("~/models/timeline-content.server", () => ({
  ...jest.requireActual<typeof import("~/models/timeline-content.server")>("~/models/timeline-content.server"),
  getTimelineContentsByRecruitmentGroupUids: jest.fn(),
}));

jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupsByUids: jest.fn(),
  getRecruitmentPoolStudents: jest.fn(),
}));

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetRecruitmentResultComments = getRecruitmentResultComments as jest.MockedFunction<
  typeof getRecruitmentResultComments
>;
const mockedGetRecruitmentResults = getRecruitmentResults as jest.MockedFunction<typeof getRecruitmentResults>;
const mockedDeleteRecruitmentResult = deleteRecruitmentResult as jest.MockedFunction<typeof deleteRecruitmentResult>;
const mockedGetSenseiByUsername = getSenseiByUsername as jest.MockedFunction<typeof getSenseiByUsername>;
const mockedGetAllStudentsMap = getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>;
const mockedGetTimelineContentsByRecruitmentGroupUids =
  getTimelineContentsByRecruitmentGroupUids as jest.MockedFunction<typeof getTimelineContentsByRecruitmentGroupUids>;
const mockedGetRecruitmentGroupsByUids = getRecruitmentGroupsByUids as unknown as jest.MockedFunction<
  (...args: unknown[]) => Promise<unknown[]>
>;
const mockedGetRecruitmentPoolStudents = getRecruitmentPoolStudents as unknown as jest.MockedFunction<
  (...args: unknown[]) => Promise<unknown[]>
>;

const env = {
  KV_CACHE: {
    get: jest.fn(async () => null),
  },
  HYPERDRIVE: { connectionString: "postgres://test" },
} as unknown as Env;

function createLoaderArgs() {
  return {
    context: { cloudflare: { env } },
    request: new Request("https://mollulog.net/@sensei/pickups"),
    params: { username: "@sensei" },
  };
}

function createActionArgs(request: Request) {
  return {
    context: { cloudflare: { env } },
    request,
    params: { username: "@sensei" },
  };
}

beforeEach(() => {
  mockedGetRecruitmentPoolStudents.mockResolvedValue([]);
  mockedGetRecruitmentResultComments.mockResolvedValue(new Map());
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("pickup history index loader", () => {
  it("uses timeline content names from PostgreSQL-backed models", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResults.mockResolvedValue([
      {
        uid: "history-1",
        userId: 1,
        recruitmentGroupUid: "hidden-heritage-rerun",
        contentUid: "content-hidden-heritage-rerun",
        completedAt: "2025-03-04T02:00:00.000Z",
        recruitedStudents: [{ studentUid: "101", tier: 3, pickup: true }],
        exchangedStudents: [],
        trial: 10,
        rawResult: null,
        commentPostUid: null,
        createdAt: "2025-03-04T02:00:00.000Z",
        updatedAt: "2025-03-04T02:00:00.000Z",
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({
      "101": {
        uid: "101",
        name: "히나",
        initialTier: 3,
      },
    } as unknown as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "hidden-heritage-rerun",
        recruitmentType: "usual",
        recruitments: [{ pickup: true, student: { uid: "101" } }],
      },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-hidden-heritage-rerun",
        name: "숨겨진 유산을 찾아서 ~트리니티 과외 활동~",
        recruitmentGroupUid: "hidden-heritage-rerun",
        startAt: "2025-03-04T02:00:00.000Z",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader(createLoaderArgs() as never);

    expect(mockedGetRecruitmentGroupsByUids).toHaveBeenCalledWith(env, ["hidden-heritage-rerun"]);
    expect(result.recruitmentHistories[0].event.events).toEqual([
      { uid: "content-hidden-heritage-rerun", name: "숨겨진 유산을 찾아서 ~트리니티 과외 활동~" },
    ]);
  });

  it("lists every event sharing a recruitment group instead of dropping all but one", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResults.mockResolvedValue([
      {
        uid: "history-shared",
        userId: 1,
        recruitmentGroupUid: "shared-group",
        contentUid: null,
        completedAt: "2026-11-10T02:00:00.000Z",
        recruitedStudents: [{ studentUid: "a", tier: 3, pickup: true }],
        exchangedStudents: [],
        trial: 10,
        rawResult: null,
        commentPostUid: null,
        createdAt: "2026-11-10T02:00:00.000Z",
        updatedAt: "2026-11-10T02:00:00.000Z",
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({
      a: { uid: "a", name: "학생A", initialTier: 3 },
    } as unknown as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "shared-group",
        recruitmentType: "usual",
        recruitments: [{ pickup: true, student: { uid: "a" } }],
      },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "event-b",
        name: "이벤트B",
        recruitmentGroupUid: "shared-group",
        startAt: "2026-11-12T02:00:00.000Z",
      },
      {
        uid: "event-a",
        name: "이벤트A",
        recruitmentGroupUid: "shared-group",
        startAt: "2026-11-10T02:00:00.000Z",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader(createLoaderArgs() as never);

    expect(result.recruitmentHistories[0].event.events).toEqual([
      { uid: "event-a", name: "이벤트A" },
      { uid: "event-b", name: "이벤트B" },
    ]);
  });

  it("uses the student's initial tier for pickup history display", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResults.mockResolvedValue([
      {
        uid: "history-1",
        userId: 1,
        recruitmentGroupUid: "hidden-heritage-rerun",
        contentUid: "content-hidden-heritage-rerun",
        completedAt: "2025-03-04T02:00:00.000Z",
        recruitedStudents: [{ studentUid: "101", tier: 5, pickup: true }],
        exchangedStudents: [],
        trial: 10,
        rawResult: null,
        commentPostUid: null,
        createdAt: "2025-03-04T02:00:00.000Z",
        updatedAt: "2025-03-04T02:00:00.000Z",
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({
      "101": {
        uid: "101",
        name: "히나",
        initialTier: 3,
      },
    } as unknown as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "hidden-heritage-rerun",
        recruitmentType: "usual",
        recruitments: [{ pickup: true, student: { uid: "101" } }],
      },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-hidden-heritage-rerun",
        name: "숨겨진 유산을 찾아서 ~트리니티 과외 활동~",
        recruitmentGroupUid: "hidden-heritage-rerun",
        startAt: "2025-03-04T02:00:00.000Z",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader(createLoaderArgs() as never);

    expect(mockedGetAllStudentsMap).toHaveBeenCalledWith(env, true);
    expect(result.recruitmentHistories[0].recruitedStudents).toEqual([
      {
        uid: "101",
        name: "히나",
        tier: 3,
        pickup: true,
      },
    ]);
  });

  it("keeps explicit zero-tier3 recruitment results out of acquired counts", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResults.mockResolvedValue([
      {
        uid: "history-zero-tier3",
        userId: 1,
        recruitmentGroupUid: "decagrammaton-armed",
        contentUid: "content-decagrammaton-armed",
        completedAt: "2026-05-26T02:00:00.000Z",
        recruitedStudents: [],
        exchangedStudents: [],
        trial: 100,
        rawResult: null,
        commentPostUid: null,
        createdAt: "2026-05-26T02:00:00.000Z",
        updatedAt: "2026-05-26T02:00:00.000Z",
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({
      "101": {
        uid: "101",
        name: "히나",
        initialTier: 3,
      },
    } as unknown as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "decagrammaton-armed",
        recruitmentType: "usual",
        recruitments: [{ pickup: true, student: { uid: "101", name: "히나", initialTier: 3 } }],
      },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-decagrammaton-armed",
        name: "데카그라마톤 무장",
        recruitmentGroupUid: "decagrammaton-armed",
        startAt: "2026-05-26T02:00:00.000Z",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader(createLoaderArgs() as never);

    expect(result.recruitmentStats).toMatchObject({
      trial: 100,
      tier3Count: 0,
      tier3DrawCount: 0,
      pickupCount: 0,
      pickupDrawCount: 0,
    });
    expect(result.recruitmentHistories[0].recruitedStudents).toEqual([]);
  });

  it("counts explicit tier3 results even when the student list is omitted", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResults.mockResolvedValue([
      {
        uid: "history-tier3-count-only",
        userId: 1,
        recruitmentGroupUid: "decagrammaton-armed",
        contentUid: "content-decagrammaton-armed",
        completedAt: "2026-05-26T02:00:00.000Z",
        recruitedStudents: [],
        exchangedStudents: [],
        tier3Count: 4,
        trial: 100,
        rawResult: null,
        commentPostUid: null,
        createdAt: "2026-05-26T02:00:00.000Z",
        updatedAt: "2026-05-26T02:00:00.000Z",
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({} as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "decagrammaton-armed",
        recruitmentType: "usual",
        recruitments: [],
      },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-decagrammaton-armed",
        name: "데카그라마톤 무장",
        recruitmentGroupUid: "decagrammaton-armed",
        startAt: "2026-05-26T02:00:00.000Z",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader(createLoaderArgs() as never);

    expect(result.recruitmentStats).toMatchObject({
      trial: 100,
      tier3Count: 4,
      tier3DrawCount: 4,
      pickupCount: 0,
    });
    expect(result.recruitmentHistories[0]).toMatchObject({
      recruitedStudents: [],
      stats: { tier3Count: 4 },
    });
  });

  it("resolves stored recruited students from the recruitment pool when the student catalog has no matching row", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResults.mockResolvedValue([
      {
        uid: "history-1",
        userId: 1,
        recruitmentGroupUid: "hidden-heritage-rerun",
        contentUid: "content-hidden-heritage-rerun",
        completedAt: "2025-03-04T02:00:00.000Z",
        recruitedStudents: [{ studentUid: "101", tier: 3, pickup: true }],
        exchangedStudents: [],
        trial: 10,
        rawResult: null,
        commentPostUid: null,
        createdAt: "2025-03-04T02:00:00.000Z",
        updatedAt: "2025-03-04T02:00:00.000Z",
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({} as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetRecruitmentPoolStudents.mockResolvedValue([
      {
        uid: "101",
        name: "히나",
        initialTier: 3,
      },
    ]);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "hidden-heritage-rerun",
        recruitmentType: "usual",
        recruitments: [],
      },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-hidden-heritage-rerun",
        name: "숨겨진 유산을 찾아서 ~트리니티 과외 활동~",
        recruitmentGroupUid: "hidden-heritage-rerun",
        startAt: "2025-03-04T02:00:00.000Z",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader(createLoaderArgs() as never);

    expect(result.recruitmentStats).toMatchObject({
      tier3Count: 1,
      pickupCount: 1,
    });
    expect(result.recruitmentHistories[0].recruitedStudents).toEqual([
      {
        uid: "101",
        name: "히나",
        tier: 3,
        pickup: true,
      },
    ]);
  });

  it("fails loudly when a recruited student cannot be resolved", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResults.mockResolvedValue([
      {
        uid: "history-1",
        userId: 1,
        recruitmentGroupUid: "hidden-heritage-rerun",
        contentUid: "content-hidden-heritage-rerun",
        completedAt: "2025-03-04T02:00:00.000Z",
        recruitedStudents: [{ studentUid: "missing-student", tier: 3, pickup: false }],
        exchangedStudents: [],
        trial: 10,
        rawResult: null,
        commentPostUid: null,
        createdAt: "2025-03-04T02:00:00.000Z",
        updatedAt: "2025-03-04T02:00:00.000Z",
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({} as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "hidden-heritage-rerun",
        recruitmentType: "usual",
        recruitments: [],
      },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-hidden-heritage-rerun",
        name: "숨겨진 유산을 찾아서 ~트리니티 과외 활동~",
        recruitmentGroupUid: "hidden-heritage-rerun",
        startAt: "2025-03-04T02:00:00.000Z",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    await expect(loader(createLoaderArgs() as never)).rejects.toMatchObject({
      type: "DataWithResponseInit",
      data: {
        error: {
          code: "pickup_history.student_missing",
          details: {
            recruitmentResultUid: "history-1",
            recruitmentGroupUid: "hidden-heritage-rerun",
            studentUid: "missing-student",
          },
        },
      },
      init: { status: 500 },
    });
  });

  it("fails loudly when a pickup history has no timeline content row", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetRecruitmentResults.mockResolvedValue([
      {
        uid: "history-1",
        userId: 1,
        recruitmentGroupUid: "missing-recruitment-group",
        contentUid: null,
        completedAt: "2025-03-04T02:00:00.000Z",
        recruitedStudents: [],
        exchangedStudents: [],
        trial: null,
        rawResult: null,
        commentPostUid: null,
        createdAt: "2025-03-04T02:00:00.000Z",
        updatedAt: "2025-03-04T02:00:00.000Z",
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({} as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([]);

    await expect(loader(createLoaderArgs() as never)).rejects.toMatchObject({
      type: "DataWithResponseInit",
      data: {
        error: {
          code: "pickup_history.timeline_content_missing",
          details: {
            eventId: "missing-recruitment-group",
          },
        },
      },
      init: { status: 500 },
    });
  });

  it("excludes histories with missing trial from rate denominators", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResults.mockResolvedValue([
      {
        uid: "history-with-trial",
        userId: 1,
        recruitmentGroupUid: "known-trial-group",
        contentUid: "content-known-trial-group",
        completedAt: "2025-03-04T02:00:00.000Z",
        recruitedStudents: [{ studentUid: "101", tier: 3, pickup: true }],
        exchangedStudents: [],
        trial: 100,
        rawResult: null,
        commentPostUid: null,
        createdAt: "2025-03-04T02:00:00.000Z",
        updatedAt: "2025-03-04T02:00:00.000Z",
      },
      {
        uid: "history-missing-trial",
        userId: 1,
        recruitmentGroupUid: "missing-trial-group",
        contentUid: "content-missing-trial-group",
        completedAt: "2025-03-11T02:00:00.000Z",
        recruitedStudents: [{ studentUid: "102", tier: 3, pickup: true }],
        exchangedStudents: [],
        trial: null,
        rawResult: null,
        commentPostUid: null,
        createdAt: "2025-03-11T02:00:00.000Z",
        updatedAt: "2025-03-11T02:00:00.000Z",
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({
      "101": {
        uid: "101",
        name: "히나",
        initialTier: 3,
      },
      "102": {
        uid: "102",
        name: "아루",
        initialTier: 3,
      },
    } as unknown as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "known-trial-group",
        recruitmentType: "usual",
        recruitments: [{ pickup: true, student: { uid: "101" } }],
      },
      {
        uid: "missing-trial-group",
        recruitmentType: "usual",
        recruitments: [{ pickup: true, student: { uid: "102" } }],
      },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-known-trial-group",
        name: "총 횟수 입력됨",
        recruitmentGroupUid: "known-trial-group",
        startAt: "2025-03-04T02:00:00.000Z",
      },
      {
        uid: "content-missing-trial-group",
        name: "총 횟수 미입력",
        recruitmentGroupUid: "missing-trial-group",
        startAt: "2025-03-11T02:00:00.000Z",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader(createLoaderArgs() as never);

    expect(result.recruitmentStats).toMatchObject({
      trial: 100,
      tier3Count: 2,
      tier3RateCount: 1,
      pickupCount: 2,
      pickupRateCount: 1,
      missingTrialCount: 1,
    });
    expect(result.recruitmentHistories.find((history) => history.uid === "history-missing-trial")?.trial).toBeNull();
  });

  it("excludes exchanged students from acquired counts and recruitment rates", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResults.mockResolvedValue([
      {
        uid: "history-1",
        userId: 1,
        recruitmentGroupUid: "armed-rio-group",
        contentUid: "content-armed-rio-group",
        completedAt: "2026-05-26T02:00:00.000Z",
        recruitedStudents: [{ studentUid: "himari-armed", tier: 3, pickup: true }],
        exchangedStudents: [{ studentUid: "rio-armed", tier: 3, pickup: true }],
        trial: 200,
        rawResult: null,
        commentPostUid: null,
        createdAt: "2026-05-26T02:00:00.000Z",
        updatedAt: "2026-05-26T02:00:00.000Z",
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({
      "himari-armed": {
        uid: "himari-armed",
        name: "히마리(무장)",
        initialTier: 3,
      },
      "rio-armed": {
        uid: "rio-armed",
        name: "리오(무장)",
        initialTier: 3,
      },
    } as unknown as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "armed-rio-group",
        recruitmentType: "usual",
        recruitments: [
          { pickup: true, student: { uid: "himari-armed" } },
          { pickup: true, student: { uid: "rio-armed" } },
        ],
      },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-armed-rio-group",
        name: "1부 Ex. 데카그라마톤 편",
        recruitmentGroupUid: "armed-rio-group",
        startAt: "2026-05-26T02:00:00.000Z",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader(createLoaderArgs() as never);

    expect(result.recruitmentStats).toMatchObject({
      trial: 200,
      tier3Count: 1,
      tier3RateCount: 1,
      pickupCount: 1,
      pickupRateCount: 1,
    });
    expect(result.recruitmentHistories[0].exchangedStudents).toEqual([
      {
        uid: "rio-armed",
        name: "리오(무장)",
        tier: 3,
        pickup: true,
      },
    ]);
  });

  it("uses shared counting rules for given pickups, stored tier drift, and exchanged students", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 3211,
      uid: "sensei-3211",
      username: "MiddleNymph20",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetActiveSensei.mockResolvedValue({
      id: 3211,
      uid: "sensei-3211",
      username: "MiddleNymph20",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResults.mockResolvedValue([
      {
        uid: "meJlgf16",
        userId: 3211,
        recruitmentGroupUid: "main-story-decagrammaton-3-2",
        contentUid: "main-story-decagrammaton-3-2",
        completedAt: "2026-06-08T02:15:41.690Z",
        recruitedStudents: [
          { studentUid: "20054", tier: 3, pickup: false },
          { studentUid: "10070", tier: 3, pickup: false },
          { studentUid: "10127", tier: 3, pickup: false },
          { studentUid: "10035", tier: 3, pickup: false },
          { studentUid: "10121", tier: 3, pickup: false },
          { studentUid: "10036", tier: 3, pickup: false },
          { studentUid: "20039", tier: 3, pickup: false },
          { studentUid: "16019", tier: 3, pickup: true },
        ],
        exchangedStudents: [{ studentUid: "10133", tier: 3, pickup: true }],
        trial: 200,
        rawResult: null,
        commentPostUid: "1AE4Yp1K",
        createdAt: "2026-06-08T02:15:41.690Z",
        updatedAt: "2026-06-08T02:15:41.690Z",
      },
    ]);
    mockedGetAllStudentsMap.mockResolvedValue({
      "10035": { uid: "10035", name: "우이", initialTier: 3 },
      "10036": { uid: "10036", name: "히나타", initialTier: 3 },
      "10070": { uid: "10070", name: "미나", initialTier: 3 },
      "10121": { uid: "10121", name: "유카리(수영복)", initialTier: 3 },
      "10127": { uid: "10127", name: "미요", initialTier: 3 },
      "10133": { uid: "10133", name: "리오(무장)", initialTier: 3 },
      "16019": { uid: "16019", name: "토키(무장)", initialTier: 1 },
      "20039": { uid: "20039", name: "키사키", initialTier: 3 },
      "20054": { uid: "20054", name: "히마리(무장)", initialTier: 3 },
    } as unknown as Awaited<ReturnType<typeof getAllStudentsMap>>);
    mockedGetRecruitmentGroupsByUids.mockResolvedValue([
      {
        uid: "main-story-decagrammaton-3-2",
        recruitmentType: "usual",
        recruitments: [
          {
            pickup: true,
            recruitmentType: "limited",
            student: { uid: "10133", name: "리오(무장)", initialTier: 3 },
          },
          {
            pickup: true,
            recruitmentType: "limited",
            student: { uid: "20054", name: "히마리(무장)", initialTier: 3 },
          },
          {
            pickup: true,
            recruitmentType: "given",
            student: { uid: "16019", name: "토키(무장)", initialTier: 1 },
          },
        ],
      },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "main-story-decagrammaton-3-2",
        name: "1부 Ex. 데카그라마톤 편",
        recruitmentGroupUid: "main-story-decagrammaton-3-2",
        startAt: "2026-05-27T02:00:00.000Z",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader({
      ...createLoaderArgs(),
      request: new Request("https://mollulog.net/@MiddleNymph20/pickups"),
      params: { username: "@MiddleNymph20" },
    } as never);

    expect(result.recruitmentStats).toMatchObject({
      trial: 200,
      tier3Count: 7,
      tier3RateCount: 7,
      pickupCount: 1,
      pickupRateCount: 1,
    });
    expect(result.recruitmentHistories[0].recruitedStudents.find((student) => student.uid === "16019")).toMatchObject({
      tier: 1,
      pickup: false,
    });
  });
});

describe("pickup history index action", () => {
  it("deletes the requested pickup history for the route owner", async () => {
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);

    const formData = new FormData();
    formData.set("uid", "history-1");
    const result = await action(
      createActionArgs(
        new Request("https://mollulog.net/@sensei/pickups?index", {
          method: "DELETE",
          body: formData,
        }),
      ) as never,
    );

    expect(mockedDeleteRecruitmentResult).toHaveBeenCalledWith(env, 1, "history-1");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe("/@sensei/pickups");
  });

  it("rejects deletion when uid is missing", async () => {
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);

    await expect(
      action(
        createActionArgs(
          new Request("https://mollulog.net/@sensei/pickups?index", {
            method: "DELETE",
            body: new FormData(),
          }),
        ) as never,
      ),
    ).rejects.toMatchObject({
      type: "DataWithResponseInit",
      data: {
        error: {
          code: "pickup_history.uid_missing",
        },
      },
      init: { status: 400 },
    });
    expect(mockedDeleteRecruitmentResult).not.toHaveBeenCalled();
  });
});
