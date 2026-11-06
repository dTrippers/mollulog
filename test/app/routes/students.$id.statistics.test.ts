import { describe, expect, it, jest } from "@jest/globals";
import { meta, shouldShowMergedStatisticsNote } from "~/routes/students.$id.statistics";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));

describe("shouldShowMergedStatisticsNote", () => {
  it("shows the note only on a non-primary page with representative response rows", () => {
    expect(
      shouldShowMergedStatisticsNote({
        pageUid: "10144",
        primaryUid: "10098",
        statistics: [{ studentUid: "10098" }],
      }),
    ).toBe(true);
  });

  it("hides the note on the primary page, for empty responses, and for unmerged rows", () => {
    expect(
      shouldShowMergedStatisticsNote({
        pageUid: "10098",
        primaryUid: "10098",
        statistics: [{ studentUid: "10098" }],
      }),
    ).toBe(false);
    expect(shouldShowMergedStatisticsNote({ pageUid: "10144", primaryUid: "10098", statistics: [] })).toBe(false);
    expect(
      shouldShowMergedStatisticsNote({
        pageUid: "10144",
        primaryUid: "10098",
        statistics: [{ studentUid: "10144" }],
      }),
    ).toBe(false);
  });
});

describe("student statistics canonical", () => {
  it("points a second form page to the representative statistics URL", () => {
    const result = meta({
      data: {
        studentMeta: null,
        primaryStudentUid: "10143",
      },
      location: { pathname: "/students/10144/statistics" },
    } as Parameters<typeof meta>[0]);

    expect(result?.find((item) => "rel" in item && item.rel === "canonical")).toMatchObject({
      href: "https://mollulog.net/students/10143/statistics",
    });
    expect(result?.[0]).toEqual({ title: "학생 통계 | 몰루로그" });
  });

  it("keeps a primary form canonical self-referencing", () => {
    const result = meta({
      data: {
        studentMeta: { uid: "10143", name: "슈에링(수영복)", familyName: null },
        primaryStudentUid: "10143",
      },
      location: { pathname: "/students/10143/statistics" },
    } as Parameters<typeof meta>[0]);

    expect(result?.find((item) => "rel" in item && item.rel === "canonical")).toMatchObject({
      href: "https://mollulog.net/students/10143/statistics",
    });
  });

  it("keeps a regular student's statistics canonical self-referencing", () => {
    const result = meta({
      data: {
        studentMeta: { uid: "10001", name: "학생", familyName: null },
        primaryStudentUid: "10001",
      },
      location: { pathname: "/students/10001/statistics" },
    } as Parameters<typeof meta>[0]);

    expect(result?.find((item) => "rel" in item && item.rel === "canonical")).toMatchObject({
      href: "https://mollulog.net/students/10001/statistics",
    });
  });

  it("keeps the request pathname canonical when loader data is undefined", () => {
    const result = meta({
      data: undefined,
      location: { pathname: "/students/10144/statistics" },
    } as Parameters<typeof meta>[0]);

    expect(result?.find((item) => "rel" in item && item.rel === "canonical")).toMatchObject({
      href: "https://mollulog.net/students/10144/statistics",
    });
  });
});
