import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getPickupHistory } from "~/models/pickup-history";
import {
  getRecruitmentResult,
  getRecruitmentResultComment,
  upsertRecruitmentResult,
} from "~/models/recruitment-result";
import { getAllStudents } from "~/models/student";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content";
import { RecruitmentRepository } from "~/repositories";
import { action, loader } from "../../../app/routes/$username.pickups.edit.$id";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/models/pickup-history", () => ({
  getPickupHistory: jest.fn(),
}));

jest.mock("~/models/recruitment-result", () => ({
  getRecruitmentResult: jest.fn(),
  getRecruitmentResultComment: jest.fn(),
  createRecruitmentResultStudentsFromPickupHistory: jest.fn(),
  getRecruitmentResultTrialFromPickupHistory: jest.fn(),
  upsertRecruitmentResult: jest.fn(),
}));

jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
}));

jest.mock("~/models/timeline-content", () => ({
  getTimelineContentsByRecruitmentGroupUids: jest.fn(),
}));

const mockGetAllHistorical = jest.fn<() => Promise<unknown[]>>();
const mockGetAll = jest.fn<() => Promise<unknown[]>>();
const mockGetByUid = jest.fn<() => Promise<unknown | null>>();

jest.mock("~/repositories", () => ({
  RecruitmentRepository: jest.fn(() => ({
    getAll: mockGetAll,
    getAllHistorical: mockGetAllHistorical,
    getByUid: mockGetByUid,
  })),
}));

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetPickupHistory = getPickupHistory as jest.MockedFunction<typeof getPickupHistory>;
const mockedGetRecruitmentResult = getRecruitmentResult as jest.MockedFunction<typeof getRecruitmentResult>;
const mockedGetRecruitmentResultComment = getRecruitmentResultComment as jest.MockedFunction<
  typeof getRecruitmentResultComment
>;
const mockedUpsertRecruitmentResult = upsertRecruitmentResult as jest.MockedFunction<typeof upsertRecruitmentResult>;
const mockedGetAllStudents = getAllStudents as jest.MockedFunction<typeof getAllStudents>;
const mockedGetTimelineContentsByRecruitmentGroupUids =
  getTimelineContentsByRecruitmentGroupUids as jest.MockedFunction<typeof getTimelineContentsByRecruitmentGroupUids>;
const mockedRecruitmentRepository = RecruitmentRepository as jest.MockedClass<typeof RecruitmentRepository>;

const env = {} as Env;

function createGroup(uid: string, startAt: string) {
  return {
    uid,
    startAt,
    endAt: null,
    contentType: "event",
    contentUid: uid,
    recruitmentType: "usual",
    recruitments: [
      {
        recruitmentType: "usual",
        pickup: true,
        rerun: false,
        since: startAt,
        until: null,
        studentName: "스즈미(매지컬)",
        student: {
          uid: "10129",
          name: "스즈미(매지컬)",
          attackType: "explosive",
          defenseType: "light",
          role: "striker",
          schaleDbId: null,
          initialTier: 3,
          releaseAt: null,
          archiveAt: null,
        },
      },
    ],
  };
}

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("pickup history editor loader", () => {
  it("builds the selectable pickup list from historical recruitment groups", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-27T00:00:00.000Z").getTime());

    const historicalGroup = createGroup("magical-heavy-caliber", "2026-03-10T02:00:00Z");
    const recentGroup = createGroup("gojinraigou-rerun", "2026-05-12T02:00:00Z");
    mockGetAllHistorical.mockResolvedValue([historicalGroup, recentGroup]);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResult.mockResolvedValue(null);
    mockedGetRecruitmentResultComment.mockResolvedValue(null);
    mockedGetPickupHistory.mockResolvedValue(null);
    mockedGetAllStudents.mockResolvedValue([]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "magical-heavy-caliber",
        name: "마법소녀 이벤트",
        recruitmentGroupUid: "magical-heavy-caliber",
      },
      {
        uid: "gojinraigou-rerun",
        name: "고진뢰황 복각",
        recruitmentGroupUid: "gojinraigou-rerun",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader({
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.net/@sensei/pickups/edit/new"),
      params: { username: "@sensei", id: "new" },
    } as never);
    if (result instanceof Response) {
      throw new Error(`Expected pickup history editor data, got redirect to ${result.headers.get("Location")}`);
    }

    expect(mockedRecruitmentRepository).toHaveBeenCalledWith(env);
    expect(mockGetAllHistorical).toHaveBeenCalledTimes(1);
    expect(mockGetAll).not.toHaveBeenCalled();
    expect(result.events.map((event: { uid: string }) => event.uid)).toEqual([
      "gojinraigou-rerun",
      "magical-heavy-caliber",
    ]);
  });

  it("keeps given students out of exchangeable pickup candidates", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-27T00:00:00.000Z").getTime());

    const historicalGroup = createGroup("decagrammaton-armed", "2026-05-26T02:00:00Z");
    historicalGroup.recruitments.push({
      ...historicalGroup.recruitments[0],
      recruitmentType: "given",
      studentName: "토키(무장)",
      student: {
        ...historicalGroup.recruitments[0].student,
        uid: "16019",
        name: "토키(무장)",
        initialTier: 1,
      },
    });
    mockGetAllHistorical.mockResolvedValue([historicalGroup]);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResult.mockResolvedValue(null);
    mockedGetRecruitmentResultComment.mockResolvedValue(null);
    mockedGetPickupHistory.mockResolvedValue(null);
    mockedGetAllStudents.mockResolvedValue([]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-decagrammaton-armed",
        name: "데카그라마톤 무장",
        recruitmentGroupUid: "decagrammaton-armed",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader({
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.net/@sensei/pickups/edit/new"),
      params: { username: "@sensei", id: "new" },
    } as never);
    if (result instanceof Response) {
      throw new Error(`Expected pickup history editor data, got redirect to ${result.headers.get("Location")}`);
    }

    expect(result.events[0].recruitments).toEqual([
      {
        student: { uid: "10129", name: "스즈미(매지컬)" },
        pickup: true,
        recruitmentType: "usual",
      },
      {
        student: { uid: "16019", name: "토키(무장)" },
        pickup: true,
        recruitmentType: "given",
      },
    ]);
  });

  it("rejects given students submitted as exchange students", async () => {
    const historicalGroup = createGroup("decagrammaton-armed", "2026-05-26T02:00:00Z");
    historicalGroup.recruitments.push({
      ...historicalGroup.recruitments[0],
      recruitmentType: "given",
      studentName: "토키(무장)",
      student: {
        ...historicalGroup.recruitments[0].student,
        uid: "16019",
        name: "토키(무장)",
        initialTier: 1,
      },
    });
    mockGetByUid.mockResolvedValue(historicalGroup);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-decagrammaton-armed",
        name: "데카그라마톤 무장",
        recruitmentGroupUid: "decagrammaton-armed",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    await expect(
      action({
        context: { cloudflare: { env } },
        request: new Request("https://mollulog.net/@sensei/pickups/edit/new", {
          method: "POST",
          body: JSON.stringify({
            eventUid: "decagrammaton-armed",
            result: [{ trial: 200, tier3Count: 0, tier3StudentIds: [] }],
            exchangedStudentIds: ["16019"],
          }),
        }),
        params: { username: "@sensei", id: "new" },
      } as never),
    ).rejects.toMatchObject({
      type: "DataWithResponseInit",
      data: {
        error: {
          code: "pickup_history.exchange_student_invalid",
          details: {
            recruitmentGroupUid: "decagrammaton-armed",
            studentUid: "16019",
          },
        },
      },
      init: { status: 400 },
    });
    expect(mockedUpsertRecruitmentResult).not.toHaveBeenCalled();
  });

  it("fails loudly when a historical recruitment group has no timeline content row", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-27T00:00:00.000Z").getTime());

    const historicalGroup = createGroup("magical-heavy-caliber", "2026-03-10T02:00:00Z");
    mockGetAllHistorical.mockResolvedValue([historicalGroup]);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResult.mockResolvedValue(null);
    mockedGetRecruitmentResultComment.mockResolvedValue(null);
    mockedGetPickupHistory.mockResolvedValue(null);
    mockedGetAllStudents.mockResolvedValue([]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([]);

    await expect(
      loader({
        context: { cloudflare: { env } },
        request: new Request("https://mollulog.net/@sensei/pickups/edit/new"),
        params: { username: "@sensei", id: "new" },
      } as never),
    ).rejects.toMatchObject({
      type: "DataWithResponseInit",
      data: {
        error: {
          code: "pickup_history.timeline_content_missing",
          details: {
            recruitmentGroupUids: ["magical-heavy-caliber"],
          },
        },
      },
      init: { status: 500 },
    });
  });
});
