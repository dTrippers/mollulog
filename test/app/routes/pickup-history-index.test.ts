import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getRecruitmentResultComments, getRecruitmentResults } from "~/models/recruitment-result";
import { getSenseiByUsername } from "~/models/sensei";
import { getAllStudentsMap } from "~/models/student";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content";
import { RecruitmentRepository } from "~/repositories";
import { loader } from "../../../app/routes/$username.pickups._index";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/models/recruitment-result", () => ({
  getRecruitmentResults: jest.fn(),
  getRecruitmentResultComments: jest.fn(),
  deleteRecruitmentResult: jest.fn(),
}));

jest.mock("~/models/sensei", () => ({
  getSenseiByUsername: jest.fn(),
}));

jest.mock("~/models/student", () => ({
  getAllStudentsMap: jest.fn(),
}));

jest.mock("~/models/timeline-content", () => ({
  getTimelineContentsByRecruitmentGroupUids: jest.fn(),
}));

const mockGetByUids = jest.fn<() => Promise<unknown[]>>();
const mockGetPoolStudents = jest.fn<() => Promise<unknown[]>>();

jest.mock("~/repositories", () => ({
  RecruitmentRepository: jest.fn(() => ({
    getByUids: mockGetByUids,
    getPoolStudents: mockGetPoolStudents,
  })),
}));

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetRecruitmentResultComments = getRecruitmentResultComments as jest.MockedFunction<
  typeof getRecruitmentResultComments
>;
const mockedGetRecruitmentResults = getRecruitmentResults as jest.MockedFunction<typeof getRecruitmentResults>;
const mockedGetSenseiByUsername = getSenseiByUsername as jest.MockedFunction<typeof getSenseiByUsername>;
const mockedGetAllStudentsMap = getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>;
const mockedGetTimelineContentsByRecruitmentGroupUids =
  getTimelineContentsByRecruitmentGroupUids as jest.MockedFunction<typeof getTimelineContentsByRecruitmentGroupUids>;
const mockedRecruitmentRepository = RecruitmentRepository as jest.MockedClass<typeof RecruitmentRepository>;

const env = {} as Env;

function createLoaderArgs() {
  return {
    context: { cloudflare: { env } },
    request: new Request("https://mollulog.net/@sensei/pickups"),
    params: { username: "@sensei" },
  };
}

beforeEach(() => {
  mockGetPoolStudents.mockResolvedValue([]);
  mockedGetRecruitmentResultComments.mockResolvedValue(new Map());
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("pickup history index loader", () => {
  it("uses timeline content names from D1", async () => {
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
    mockGetByUids.mockResolvedValue([
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

    expect(mockedRecruitmentRepository).toHaveBeenCalledWith(env);
    expect(result.recruitmentHistories[0].event.name).toBe("숨겨진 유산을 찾아서 ~트리니티 과외 활동~");
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
    mockGetByUids.mockResolvedValue([
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
    mockGetByUids.mockResolvedValue([
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
    mockGetPoolStudents.mockResolvedValue([
      {
        uid: "101",
        name: "히나",
        initialTier: 3,
      },
    ]);
    mockGetByUids.mockResolvedValue([
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
    mockGetByUids.mockResolvedValue([
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
    mockGetByUids.mockResolvedValue([]);
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
    mockGetByUids.mockResolvedValue([
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

  it("includes exchanged students in acquired counts but excludes them from recruitment rates", async () => {
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
    mockGetByUids.mockResolvedValue([
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
      tier3Count: 2,
      tier3RateCount: 1,
      pickupCount: 2,
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
});
