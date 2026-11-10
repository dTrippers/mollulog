import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getFollowershipSummary } from "~/models/followership";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRecruitmentResults } from "~/models/recruitment-result.server";
import { loader } from "~/routes/$username";
import { getRouteSensei } from "~/routes/$username._components/route-sensei.server";
import {
  buildUserScreenItems,
  formatUserCount,
  getUserScreen,
  getVisibilityLine,
} from "~/routes/$username._components/user-layout";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/followership", () => ({ getFollowershipSummary: jest.fn() }));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: jest.fn() }));
jest.mock("~/models/recruitment-result.server", () => ({ getRecruitmentResults: jest.fn() }));
jest.mock("~/routes/$username._components/route-sensei.server", () => ({ getRouteSensei: jest.fn() }));

const mockedGetActiveSensei = jest.mocked(getActiveSensei);
const mockedGetRouteSensei = jest.mocked(getRouteSensei);
const mockedGetFollowershipSummary = jest.mocked(getFollowershipSummary);
const mockedGetRecruitedStudents = jest.mocked(getRecruitedStudents);
const mockedGetRecruitmentResults = jest.mocked(getRecruitmentResults);
const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };

const env = {} as Env;
const args = {
  context: { cloudflare: { env, ctx: {} as ExecutionContext } },
  request: new Request("https://mollulog.test/@sensei"),
  params: { username: "@sensei" },
} as never;

function recorded(overrides: Record<string, unknown> = {}) {
  return { completedAt: null, recruitedStudents: [], exchangedStudents: [], ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getLogger).mockReturnValue(logger as unknown as ReturnType<typeof getLogger>);
  mockedGetActiveSensei.mockResolvedValue({ id: 1, username: "sensei" } as Awaited<ReturnType<typeof getActiveSensei>>);
  mockedGetRouteSensei.mockResolvedValue({
    id: 1,
    username: "sensei",
    profileStudentId: "student-a",
    profileVisibility: "public",
    growthVisibility: false,
    labels: [],
  } as unknown as Awaited<ReturnType<typeof getRouteSensei>>);
  mockedGetFollowershipSummary.mockResolvedValue({
    followed: false,
    following: true,
    followerCount: 0,
    followingCount: 0,
  });
  mockedGetRecruitedStudents.mockResolvedValue([{}, {}, {}] as Awaited<ReturnType<typeof getRecruitedStudents>>);
  mockedGetRecruitmentResults.mockResolvedValue([
    recorded({ completedAt: new Date() }),
    recorded({ recruitedStudents: [{ studentUid: "a" }] }),
    recorded(),
  ] as unknown as Awaited<ReturnType<typeof getRecruitmentResults>>);
});

describe("@username layout loader", () => {
  it("returns the owner header data and counts without loading the relationship", async () => {
    const result = await loader(args);

    expect(result).toEqual({
      username: "sensei",
      labels: [],
      profileStudentId: "student-a",
      profileVisibility: "public",
      growthVisibility: false,
      isOwner: true,
      signedIn: true,
      following: false,
      recruitedStudentCount: 3,
      // Only a result that is completed or has a recorded student is a pickup record, as in the pickups list.
      pickupCount: 2,
    });
    expect(mockedGetFollowershipSummary).not.toHaveBeenCalled();
  });

  it("reads the relationship for a signed-in visitor", async () => {
    mockedGetActiveSensei.mockResolvedValue({ id: 2, username: "other" } as Awaited<
      ReturnType<typeof getActiveSensei>
    >);

    const result = await loader(args);

    expect(result).toMatchObject({ isOwner: false, signedIn: true, following: true });
    expect(mockedGetFollowershipSummary).toHaveBeenCalledWith(env, 1, 2, { ctx: expect.anything() });
  });

  it("treats a signed-out visitor as not following without a lookup", async () => {
    mockedGetActiveSensei.mockResolvedValue(null);

    const result = await loader(args);

    expect(result).toMatchObject({ isOwner: false, signedIn: false, following: false });
    expect(mockedGetFollowershipSummary).not.toHaveBeenCalled();
  });

  it("drops a count that fails to load instead of showing zero", async () => {
    mockedGetRecruitmentResults.mockRejectedValue(new Error("database unavailable"));

    const result = await loader(args);

    expect(result).toMatchObject({ recruitedStudentCount: 3, pickupCount: null });
    expect(logger.error).toHaveBeenCalledWith("User layout pickup record count failed", expect.any(Error));
  });

  it("lets a private or unknown profile error reach the layout error boundary", async () => {
    mockedGetRouteSensei.mockRejectedValue(new Error("sensei.profile_private"));

    await expect(loader(args)).rejects.toThrow("sensei.profile_private");
  });
});

describe("@username layout screens", () => {
  it("maps paths to screens and ignores other segments and other users", () => {
    expect(getUserScreen("/@sensei", "sensei")).toBe("profile");
    expect(getUserScreen("/@sensei/", "sensei")).toBe("profile");
    expect(getUserScreen("/@sensei/students", "sensei")).toBe("students");
    expect(getUserScreen("/@sensei/pickups/edit/1", "sensei")).toBe("pickups");
    expect(getUserScreen("/@sensei/friends", "sensei")).toBe("profile");
    expect(getUserScreen("/@sensei/futures", "sensei")).toBeNull();
    expect(getUserScreen("/@sensei/studentsx", "sensei")).toBeNull();
    expect(getUserScreen("/@other/students", "sensei")).toBeNull();
  });

  it("builds the same three menu items for the owner and a visitor, with counts", () => {
    const Icon = () => null;
    const items = buildUserScreenItems({
      username: "sensei",
      pathname: "/@sensei/pickups",
      recruitedStudentCount: 1234,
      pickupCount: 56,
      icons: { profile: Icon, students: Icon, pickups: Icon },
    });

    expect(items.map(({ text, label, link, active }) => [text, label, link, active])).toEqual([
      ["프로필", undefined, "/@sensei", false],
      ["모집한 학생", "1,234", "/@sensei/students", false],
      ["모집 기록", "56", "/@sensei/pickups", true],
    ]);
  });

  it("omits a count that is unknown and keeps a real zero", () => {
    expect(formatUserCount(null)).toBeUndefined();
    expect(formatUserCount(0)).toBe("0");
  });

  it.each([
    [{ profileVisibility: "public", growthVisibility: false }, "프로필 공개 · 학생 성장도 나만 보기"],
    [{ profileVisibility: "public", growthVisibility: true }, "프로필 공개 · 학생 성장도 공개"],
    [{ profileVisibility: "private", growthVisibility: false }, "프로필 비공개 · 학생 성장도 나만 보기"],
    [{ profileVisibility: "private", growthVisibility: true }, "프로필 비공개 · 학생 성장도 공개"],
  ] as const)("writes the owner's visibility line for %j", (input, line) => {
    expect(getVisibilityLine(input)).toBe(line);
  });
});
