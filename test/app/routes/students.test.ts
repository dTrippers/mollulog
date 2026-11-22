import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { defaultStudentDirectoryFilterState } from "~/domain/student-directory";
import { Attack, Defense } from "~/graphql/graphql";
import { getStudentDirectoryStudents } from "~/models/student-directory";
import { loader, STUDENT_FILTER_COOKIE_NAME, STUDENT_FILTER_COOKIE_PATH } from "~/routes/students";
import { serializeStudentDirectoryFilterStateCookie } from "~/routes/students._components/student-directory-cookie";
import { loadStudentDirectoryPersonalState } from "~/views/student-directory";

const mockLoggerError = jest.fn();
jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/models/student-directory", () => ({ getStudentDirectoryStudents: jest.fn() }));
jest.mock("~/views/student-directory", () => ({ loadStudentDirectoryPersonalState: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({
  getLogger: () => ({ error: mockLoggerError }),
  captureServerError: jest.fn(),
}));

const env = { HYPERDRIVE: { connectionString: "postgres://test" } } as unknown as Env;
const ctx = {} as ExecutionContext;
const mockedGetStudentDirectoryStudents = getStudentDirectoryStudents as jest.MockedFunction<
  typeof getStudentDirectoryStudents
>;
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedLoadPersonalState = loadStudentDirectoryPersonalState as jest.MockedFunction<
  typeof loadStudentDirectoryPersonalState
>;

const students = [
  {
    uid: "student-a",
    name: "학생",
    familyName: null,
    altNames: [],
    school: "millennium",
    initialTier: 3,
    order: 1,
    releaseAt: "2024-01-01T00:00:00.000Z",
    attackType: Attack.Explosive,
    defenseType: Defense.Light,
    weaponType: "ar",
    acquisitionType: "regular",
    canUseCover: true,
    skillEffectTags: [],
    club: { uid: "club-1", name: "게임개발부" },
    studentVariant: { primaryStudent: { uid: "student-a" } },
    position: "front",
    tacticRole: "attacker",
    birthday: null,
    role: "striker",
    equipments: ["hat", "bag", "shoes"],
    released: true,
    catalog: null,
  },
] as never;

function createLoaderArgs(path = "/students", cookie?: string) {
  return {
    context: { cloudflare: { env, ctx } },
    request: new Request(`https://mollulog.test${path}`, { headers: cookie ? { Cookie: cookie } : undefined }),
    params: {},
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetStudentDirectoryStudents.mockResolvedValue(students);
  mockedGetActiveSensei.mockResolvedValue(null);
  mockedLoadPersonalState.mockResolvedValue({ state: { status: "loaded", byPrimaryUid: {} } });
});

describe("students directory loader", () => {
  it("keeps the shared cookie name and root path", () => {
    expect(STUDENT_FILTER_COOKIE_NAME).toBe("mollulog_students_filter");
    expect(STUDENT_FILTER_COOKIE_PATH).toBe("/");
  });

  it("loads unreleased students and uses directory defaults", async () => {
    const result = await loader(createLoaderArgs());
    expect(result.listStatus).toBe("loaded");
    expect(result.filterState).toEqual(defaultStudentDirectoryFilterState);
    expect(mockedGetStudentDirectoryStudents).toHaveBeenCalledWith(env, true);
    expect(result.personalState.status).toBe("signed-out");
  });

  it("seeds the directory filter from its SSR cookie and never restores search", async () => {
    const cookieValue = serializeStudentDirectoryFilterStateCookie(
      { ...defaultStudentDirectoryFilterState, sort: "myTier", recruitment: ["unrecruited"], search: "학생" },
      students,
    );
    const result = await loader(createLoaderArgs("/students", `${STUDENT_FILTER_COOKIE_NAME}=${cookieValue}`));
    expect(result.filterState).toMatchObject({ sort: "myTier", recruitment: ["unrecruited"], search: "" });
  });

  it("composes private records for a signed-in viewer", async () => {
    mockedGetActiveSensei.mockResolvedValue({ id: 42 } as never);
    mockedLoadPersonalState.mockResolvedValue({
      state: {
        status: "loaded",
        byPrimaryUid: { "student-a": { status: "unrecruited", tier: null, level: null, bondLevel: null } },
      },
    });

    const result = await loader(createLoaderArgs());

    expect(mockedLoadPersonalState).toHaveBeenCalledWith(env, 42, students);
    expect(result.personalState.status).toBe("loaded");
  });

  it("keeps public results when private records fail", async () => {
    const failure = new Error("private data unavailable");
    mockedGetActiveSensei.mockResolvedValue({ id: 42 } as never);
    mockedLoadPersonalState.mockResolvedValue({ state: { status: "failed" }, error: failure });

    const result = await loader(createLoaderArgs());

    expect(result.listStatus).toBe("loaded");
    expect(result.students).toBe(students);
    expect(result.personalState).toEqual({ status: "failed" });
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Failed to load student directory data",
      failure,
      expect.objectContaining({ operation: "personal_records" }),
    );
  });

  it("returns an in-route list failure state instead of throwing", async () => {
    mockedGetStudentDirectoryStudents.mockRejectedValueOnce(new Error("list unavailable"));

    const result = await loader(createLoaderArgs());

    expect(result.listStatus).toBe("failed");
    expect(result.students).toEqual([]);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Failed to load student directory data",
      expect.any(Error),
      expect.objectContaining({ operation: "student_list" }),
    );
  });

  it("leaves child routes on the existing outlet-only branch", async () => {
    const result = await loader(createLoaderArgs("/students/123"));
    expect(result.listStatus).toBe("loaded");
    expect(mockedGetStudentDirectoryStudents).not.toHaveBeenCalled();
    expect(mockedGetActiveSensei).not.toHaveBeenCalled();
  });
});
