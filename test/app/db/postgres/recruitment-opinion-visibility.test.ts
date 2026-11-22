import { describe, expect, it } from "@jest/globals";
import { recruitmentOpinionVisibleForRow } from "~/db/postgres/community";

const enabled = { hideRecruitmentOpinions: true };

describe("recruitment opinion visibility", () => {
  it("hides only another user's result when the viewer enabled filtering", () => {
    const row = { userId: 2, recruitmentClassification: "result" as const };
    expect(recruitmentOpinionVisibleForRow(row, 1, enabled)).toBe(false);
    expect(recruitmentOpinionVisibleForRow(row, 2, enabled)).toBe(true);
    expect(recruitmentOpinionVisibleForRow(row, undefined, enabled)).toBe(false);
    expect(recruitmentOpinionVisibleForRow(row, 1, {})).toBe(true);
  });

  it.each([null, "pending", "failed", "other"] as const)("shows %s opinions", (state) => {
    expect(recruitmentOpinionVisibleForRow({ userId: 2, recruitmentClassification: state }, 1, enabled)).toBe(true);
  });
});
