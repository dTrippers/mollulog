import { describe, expect, it } from "@jest/globals";
import { isStudentReleased } from "~/domain/student-release";

describe("isStudentReleased", () => {
  const releaseAt = "2026-11-17T02:00:00.000Z";
  const releaseTime = Date.parse(releaseAt);

  it("treats a student as released once its GL release time has passed", () => {
    expect(isStudentReleased(releaseAt, releaseTime + 1)).toBe(true);
  });

  it("keeps a student unreleased before and exactly at its release time, as BAQL does", () => {
    expect(isStudentReleased(releaseAt, releaseTime - 1)).toBe(false);
    expect(isStudentReleased(releaseAt, releaseTime)).toBe(false);
  });

  it("keeps a student without a GL release time unreleased", () => {
    expect(isStudentReleased(null, releaseTime)).toBe(false);
  });
});
