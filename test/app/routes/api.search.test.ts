import { describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getAllTimelineContentsMeta } from "~/models/timeline-content.server";
import { loader } from "../../../app/routes/api.search";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(() => Promise.resolve(null)),
}));

jest.mock("~/components/features/layout/navigation-menu", () => ({
  getSearchableMenuItems: ({ currentUsername }: { currentUsername?: string | null } = {}) =>
    currentUsername ? [{ id: "profile", name: "내 프로필", to: `/@${currentUsername}` }] : [],
}));

jest.mock("~/models/student", () => ({
  formatStudentFullName: ({ name, familyName }: { name: string; familyName?: string | null }) =>
    familyName ? `${familyName} ${name}` : name,
  getAllStudents: jest.fn(() =>
    Promise.resolve([
      {
        uid: "10001",
        name: "출시학생",
        familyName: null,
        released: true,
      },
      {
        uid: "10002",
        name: "미출시학생",
        familyName: null,
        released: false,
      },
    ]),
  ),
}));

jest.mock("~/models/timeline-content.server", () => ({
  getAllTimelineContentsMeta: jest.fn(() => Promise.resolve([])),
}));

const env = { KV_CACHE: {} } as Env;
const mockedGetAllTimelineContentsMeta = getAllTimelineContentsMeta as jest.MockedFunction<
  typeof getAllTimelineContentsMeta
>;
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;

async function callLoader(q: string) {
  return loader({
    request: new Request(`https://mollulog.net/api/search?q=${encodeURIComponent(q)}`),
    context: { cloudflare: { env } },
    params: {},
  } as never);
}

describe("api.search", () => {
  it("includes unreleased students in global search results", async () => {
    const response = await callLoader("미출시학생");

    expect(response.results).toContainEqual({
      type: "student",
      name: "미출시학생",
      uid: "10002",
      to: "/students/10002",
    });
    expect(mockedGetAllTimelineContentsMeta).toHaveBeenCalledWith(env, { ctx: undefined });
  });

  it("adds the signed-in user's profile to the cached search index", async () => {
    mockedGetActiveSensei.mockResolvedValue({ username: "sensei" } as never);

    const response = await callLoader("내 프로필");

    expect(response.results).toContainEqual({ type: "menu", name: "내 프로필", to: "/@sensei" });
  });
});
