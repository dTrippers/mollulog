import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getPickupHistory } from "~/models/pickup-history";
import { getAllStudents } from "~/models/student";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content";
import { RecruitmentRepository } from "~/repositories";
import { loader } from "../../../app/routes/$username.pickups.edit.$id";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/models/pickup-history", () => ({
  getPickupHistory: jest.fn(),
  createPickupHistory: jest.fn(),
  updatePickupHistory: jest.fn(),
}));

jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
}));

jest.mock("~/models/timeline-content", () => ({
  getTimelineContentsByRecruitmentGroupUids: jest.fn(),
}));

const mockGetAllHistorical = jest.fn<() => Promise<unknown[]>>();
const mockGetAll = jest.fn<() => Promise<unknown[]>>();

jest.mock("~/repositories", () => ({
  RecruitmentRepository: jest.fn(() => ({
    getAll: mockGetAll,
    getAllHistorical: mockGetAllHistorical,
  })),
}));

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetPickupHistory = getPickupHistory as jest.MockedFunction<typeof getPickupHistory>;
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
