import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getPostgresWalkthroughTimelineLikeSummaries } from "~/db/postgres/walkthrough-timeline-likes";
import { listPostgresVisibleWalkthroughTimelines } from "~/db/postgres/walkthrough-timelines";
import { getAllRaidSchedules } from "~/models/raid";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getVisibleSenseisById } from "~/models/sensei";
import { getAllStudentsMap } from "~/models/student";
import { loader } from "~/routes/timelines._index";

const mockGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockGetAllRaidSchedules = getAllRaidSchedules as jest.MockedFunction<typeof getAllRaidSchedules>;
const mockGetAllStudentsMap = getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>;
const mockListTimelines = listPostgresVisibleWalkthroughTimelines as jest.MockedFunction<
  typeof listPostgresVisibleWalkthroughTimelines
>;
const mockGetVisibleSenseis = getVisibleSenseisById as jest.MockedFunction<typeof getVisibleSenseisById>;
const mockGetLikeSummaries = getPostgresWalkthroughTimelineLikeSummaries as jest.MockedFunction<
  typeof getPostgresWalkthroughTimelineLikeSummaries
>;
const mockGetRecruitedTiers = getRecruitedStudentTiers as jest.MockedFunction<typeof getRecruitedStudentTiers>;

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/db/postgres/walkthrough-timeline-likes", () => ({
  getPostgresWalkthroughTimelineLikeSummaries: jest.fn(),
}));
jest.mock("~/db/postgres/walkthrough-timelines", () => ({ listPostgresVisibleWalkthroughTimelines: jest.fn() }));
jest.mock("~/models/raid", () => ({ getAllRaidSchedules: jest.fn() }));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudentTiers: jest.fn() }));
jest.mock("~/models/sensei", () => ({ getVisibleSenseisById: jest.fn() }));
jest.mock("~/models/student", () => ({ getAllStudentsMap: jest.fn() }));

const env = {} as Env;
const ctx = {} as ExecutionContext;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue(null);
  mockGetAllRaidSchedules.mockResolvedValue([
    { raidType: "total_assault", raidBoss: { uid: "boss-1", name: "보스" } },
  ] as never);
  mockGetAllStudentsMap.mockResolvedValue({} as never);
  mockListTimelines.mockResolvedValue([]);
  mockGetVisibleSenseis.mockResolvedValue([] as never);
  mockGetLikeSummaries.mockResolvedValue({});
  mockGetRecruitedTiers.mockResolvedValue({});
});

function loaderArgs(url: string) {
  return {
    request: new Request(url),
    context: { cloudflare: { env, ctx } },
  } as never;
}

describe("walkthrough timeline catalog auto filter", () => {
  it("applies auto=1 on the server alongside the existing filters for anonymous readers", async () => {
    const result = await loader(
      loaderArgs(
        "https://mollulog.test/timelines?auto=1&bossUid=boss-1&terrain=indoor&defenseType=heavy&difficulty=torment",
      ),
    );

    expect(mockListTimelines).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        isAuto: true,
        bossUid: "boss-1",
        terrain: "indoor",
        defenseType: "heavy",
        maxDifficulty: "torment",
      }),
      { ctx },
    );
    expect(result).toMatchObject({ signedIn: false, filters: { autoOnly: true } });
  });

  it("does not treat other URL values as an auto declaration", async () => {
    const result = await loader(loaderArgs("https://mollulog.test/timelines?auto=true"));

    expect(result).toMatchObject({ filters: { autoOnly: false } });
    expect(mockListTimelines).toHaveBeenCalledWith(env, expect.not.objectContaining({ isAuto: true }), { ctx });
  });
});
