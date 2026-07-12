import { describe, expect, it, jest } from "@jest/globals";
import { getAllTimelineContentsMeta } from "~/models/timeline-content";
import { loader } from "../../../app/routes/api.search";

jest.mock("~/components/features/layout/navigation-menu", () => ({
  getSearchableMenuItems: () => [],
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

jest.mock("~/models/timeline-content", () => ({
  getAllTimelineContentsMeta: jest.fn(() => Promise.resolve([])),
}));

const sessionDb = {} as D1DatabaseSession;
const primaryDb = { withSession: jest.fn(() => sessionDb) } as unknown as D1Database;
const env = { DB: primaryDb, KV_CACHE: {} } as Env;
const mockedGetAllTimelineContentsMeta = getAllTimelineContentsMeta as jest.MockedFunction<
  typeof getAllTimelineContentsMeta
>;

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
    expect(primaryDb.withSession).toHaveBeenCalledWith("first-unconstrained");
    expect(mockedGetAllTimelineContentsMeta.mock.calls[0][0].DB).toBe(sessionDb);
  });
});
