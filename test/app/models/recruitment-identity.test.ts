import { describe, expect, it } from "@jest/globals";
import {
  filterRecruitmentsByStudentUids,
  getProvisionalRecruitmentStudentKey,
  getRecruitmentFavoriteKey,
  normalizeRecruitmentStudentName,
} from "~/domain/recruitment-identity";

describe("recruitment identity", () => {
  it("normalizes recruitment student names before deriving provisional keys", () => {
    const compact = getProvisionalRecruitmentStudentKey("리오(무장)");
    const spaced = getProvisionalRecruitmentStudentKey("  리오(무장)  ");

    expect(normalizeRecruitmentStudentName("  리오(무장)  ")).toBe("리오(무장)");
    expect(spaced).toBe(compact);
    expect(compact).toMatch(/^provisional:[0-9a-z]+$/);
  });

  it("prefers the canonical student uid when student data exists", () => {
    expect(getRecruitmentFavoriteKey({ student: { uid: "rio-armed" }, studentName: "리오(무장)" })).toBe("rio-armed");
  });

  it("falls back to a deterministic provisional key when student data is missing", () => {
    expect(getRecruitmentFavoriteKey({ student: null, studentName: "리오(무장)" })).toBe(
      getProvisionalRecruitmentStudentKey("리오(무장)"),
    );
  });
});

describe("filterRecruitmentsByStudentUids", () => {
  const recruitmentA = { student: { uid: "a" } };
  const recruitmentB = { student: { uid: "b" } };
  const recruitmentNoStudent = { student: null };

  it("returns every recruitment unchanged when studentUids is null", () => {
    const recruitments = [recruitmentA, recruitmentB, recruitmentNoStudent];
    expect(filterRecruitmentsByStudentUids(recruitments, null)).toBe(recruitments);
  });

  it("keeps only recruitments whose student uid is listed", () => {
    const recruitments = [recruitmentA, recruitmentB, recruitmentNoStudent];
    expect(filterRecruitmentsByStudentUids(recruitments, ["a"])).toEqual([recruitmentA]);
  });

  it("drops student-less recruitments once a filter is active", () => {
    expect(filterRecruitmentsByStudentUids([recruitmentNoStudent], ["a"])).toEqual([]);
  });

  it("returns an empty array when no recruitment matches the filter", () => {
    expect(filterRecruitmentsByStudentUids([recruitmentA], ["c"])).toEqual([]);
  });
});
