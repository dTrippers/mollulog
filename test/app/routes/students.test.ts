import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createStudentFilterState } from "~/components/features/students/StudentFilter";
import { serializeStudentFilterStateCookie } from "~/components/features/students/student-filter-cookie";
import { Attack, Defense } from "~/graphql/graphql";
import { getStudentDirectoryStudents } from "~/models/student-directory";
import {
  loader,
  STUDENT_FILTER_COOKIE_NAME,
  STUDENT_FILTER_COOKIE_PATH,
  STUDENT_FILTER_DISPLAYS,
  STUDENT_FILTER_GROUPS,
  STUDENT_FILTER_SORTS,
} from "~/routes/students";

jest.mock("~/models/student-directory", () => ({
  getStudentDirectoryStudents: jest.fn(),
}));

const env = { HYPERDRIVE: { connectionString: "postgres://test" } } as unknown as Env;
const mockedGetStudentDirectoryStudents = getStudentDirectoryStudents as jest.MockedFunction<
  typeof getStudentDirectoryStudents
>;

function createLoaderArgs(cookie?: string) {
  return {
    context: { cloudflare: { env } },
    request: new Request("https://mollulog.test/students", {
      headers: cookie ? { Cookie: cookie } : undefined,
    }),
    params: {},
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetStudentDirectoryStudents.mockResolvedValue([]);
});

describe("students loader", () => {
  it("scopes the filter cookie to client-navigation data requests", () => {
    expect(STUDENT_FILTER_COOKIE_PATH).toBe("/");
  });

  it("uses no display and no grouping as the directory defaults", async () => {
    const result = await loader(createLoaderArgs());

    expect(result.filterState.groupBy).toBe("none");
    expect(result.filterState.displayBy).toBe("none");
    expect(STUDENT_FILTER_GROUPS).toContain("school");
    expect(STUDENT_FILTER_DISPLAYS).toContain("none");
    expect(STUDENT_FILTER_DISPLAYS).toContain("height");
  });

  it("seeds the first render from the general student filter cookie", async () => {
    const state = {
      ...createStudentFilterState("name"),
      defenseTypes: [Defense.Heavy],
      search: "시로코",
    };
    const cookieValue = serializeStudentFilterStateCookie(
      { defaultSort: "recent", allowedSorts: STUDENT_FILTER_SORTS },
      state,
    );
    mockedGetStudentDirectoryStudents.mockResolvedValueOnce([
      {
        uid: "student-a",
        name: "시로코",
        attackType: Attack.Explosive,
        defenseType: Defense.Heavy,
        role: "striker",
        position: "front",
        tacticRole: "attacker",
        order: 1,
        initialTier: 3,
      },
    ] as never);

    const result = await loader(createLoaderArgs(`${STUDENT_FILTER_COOKIE_NAME}=${cookieValue}`));

    expect(result.filterState).toEqual({
      ...createStudentFilterState("name"),
      defenseTypes: [Defense.Heavy],
    });
    expect(result.students).toHaveLength(1);
    expect(mockedGetStudentDirectoryStudents).toHaveBeenCalledWith(env, true);
  });

  it("accepts initial-tier sorting on the general student directory", async () => {
    const state = createStudentFilterState("tier");
    const cookieValue = serializeStudentFilterStateCookie(
      { defaultSort: "recent", allowedSorts: STUDENT_FILTER_SORTS },
      state,
    );

    const result = await loader(createLoaderArgs(`${STUDENT_FILTER_COOKIE_NAME}=${cookieValue}`));

    expect(result.filterState).toEqual(createStudentFilterState("tier"));
  });
});
