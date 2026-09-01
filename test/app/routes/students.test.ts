import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createStudentFilterState } from "~/components/features/students/StudentFilter";
import { serializeStudentFilterStateCookie } from "~/components/features/students/student-filter-cookie";
import { Attack, Defense } from "~/graphql/graphql";
import { getAllStudents } from "~/models/student";
import { loader, STUDENT_FILTER_COOKIE_NAME, STUDENT_FILTER_SORTS } from "~/routes/students";

jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
}));

const env = { HYPERDRIVE: { connectionString: "postgres://test" } } as unknown as Env;
const mockedGetAllStudents = getAllStudents as jest.MockedFunction<typeof getAllStudents>;

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
  mockedGetAllStudents.mockResolvedValue([]);
});

describe("students loader", () => {
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
    mockedGetAllStudents.mockResolvedValueOnce([
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
  });

  it("uses the general allowlist when a user-only sort is present", async () => {
    const state = createStudentFilterState("tier");
    const cookieValue = serializeStudentFilterStateCookie(
      { defaultSort: "recent", allowedSorts: ["recent", "old", "name"] },
      state,
    );

    const result = await loader(createLoaderArgs(`${STUDENT_FILTER_COOKIE_NAME}=${cookieValue}`));

    expect(result.filterState).toEqual(createStudentFilterState("recent"));
  });
});
