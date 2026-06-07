import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getPickupHistories } from "~/models/pickup-history";
import { getSenseiByUsername } from "~/models/sensei";
import { getAllStudentsMap } from "~/models/student";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content";
import { RecruitmentRepository } from "~/repositories";
import { loader } from "../../../app/routes/$username.pickups._index";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/models/pickup-history", () => ({
  getPickupHistories: jest.fn(),
  deletePickupHistory: jest.fn(),
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

jest.mock("~/repositories", () => ({
  RecruitmentRepository: jest.fn(() => ({
    getByUids: mockGetByUids,
  })),
}));

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetPickupHistories = getPickupHistories as jest.MockedFunction<typeof getPickupHistories>;
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
    mockedGetPickupHistories.mockResolvedValue([
      {
        uid: "history-1",
        userId: 1,
        eventId: "hidden-heritage-rerun",
        result: [{ trial: 10, tier3Count: 1, tier3StudentIds: ["101"] }],
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

  it("fails loudly when a pickup history has no timeline content row", async () => {
    mockedGetSenseiByUsername.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getSenseiByUsername>>);
    mockedGetPickupHistories.mockResolvedValue([
      {
        uid: "history-1",
        userId: 1,
        eventId: "missing-recruitment-group",
        result: [],
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
});
