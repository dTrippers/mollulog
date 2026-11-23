import { describe, expect, it, jest } from "@jest/globals";
import { meta } from "~/routes/students.$id.statistics";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));

const parentMatch = {
  id: "routes/students.$id",
  data: { student: { uid: "10155", name: "미카", familyName: "미소노" } },
};

function metaFor(studentMeta: { uid: string; name: string; familyName: string } | null) {
  return meta({
    data: { studentMeta, primaryStudentUid: "10155" },
    location: { pathname: "/students/10155/statistics" },
    matches: [{ id: "root", data: null }, parentMatch],
  } as never);
}

describe("student statistics meta", () => {
  it("names the student from the cached student list", () => {
    expect(metaFor({ uid: "10155", name: "미카", familyName: "미소노" })).toEqual(
      expect.arrayContaining([{ property: "og:title", content: "미소노 미카 - 총력전/대결전 통계" }]),
    );
  });

  // A newly added student reaches the detail header before the cached student list.
  it("falls back to the student detail header when the cached list lacks the student", () => {
    expect(metaFor(null)).toEqual(
      expect.arrayContaining([
        { title: "미소노 미카 - 총력전/대결전 통계 | 몰루로그" },
        { property: "og:title", content: "미소노 미카 - 총력전/대결전 통계" },
        { property: "og:url", content: "https://mollulog.net/students/10155/statistics" },
      ]),
    );
  });
});
