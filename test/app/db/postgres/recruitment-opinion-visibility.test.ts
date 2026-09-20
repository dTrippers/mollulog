import { describe, expect, it } from "@jest/globals";
import { type PostgresCommunityOptions, recruitmentOpinionVisibleForRow } from "~/db/postgres/community";

const startAt = "2026-09-01T00:00:00.000Z";

function row(overrides: Partial<Parameters<typeof recruitmentOpinionVisibleForRow>[0]> = {}) {
  return {
    userId: 2,
    subjectContentUid: "content-1",
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    recruitmentPeriodStartAt: new Date(startAt),
    recruitmentOpinionClassificationStatus: "completed" as const,
    recruitmentOpinionClassification: "RESULT_RELATED" as const,
    ...overrides,
  };
}

const enabled: PostgresCommunityOptions = { hideRecruitmentOpinions: true };

describe("recruitment opinion visibility", () => {
  it("hides another user's completed result-related opinion while preserving other cases", () => {
    expect(recruitmentOpinionVisibleForRow(row(), 1, enabled)).toBe(false);
    expect(recruitmentOpinionVisibleForRow(row({ recruitmentOpinionClassification: "OTHER" }), 1, enabled)).toBe(true);
    expect(recruitmentOpinionVisibleForRow(row({ userId: 1 }), 1, enabled)).toBe(true);
    expect(recruitmentOpinionVisibleForRow(row({ createdAt: new Date("2026-08-31T23:59:59.000Z") }), 1, enabled)).toBe(
      true,
    );
  });

  it("shows pending, failed, missing, and unknown rows and uses the content-period fallback", () => {
    expect(
      recruitmentOpinionVisibleForRow(
        row({
          recruitmentPeriodStartAt: null,
          recruitmentOpinionClassificationStatus: "pending",
          recruitmentOpinionClassification: null,
        }),
        1,
        { ...enabled, recruitmentPeriodStartAtByContentId: { "content-1": startAt } },
      ),
    ).toBe(true);
    expect(
      recruitmentOpinionVisibleForRow(
        row({ recruitmentOpinionClassificationStatus: "failed", recruitmentOpinionClassification: null }),
        1,
        enabled,
      ),
    ).toBe(true);
    expect(
      recruitmentOpinionVisibleForRow(
        row({
          recruitmentOpinionClassificationStatus: null,
          recruitmentOpinionClassification: null,
        }),
        1,
        enabled,
      ),
    ).toBe(true);
    expect(
      recruitmentOpinionVisibleForRow(
        row({
          recruitmentOpinionClassificationStatus: "completed",
          recruitmentOpinionClassification: null,
        }),
        1,
        enabled,
      ),
    ).toBe(true);
    expect(recruitmentOpinionVisibleForRow(row(), 1, {})).toBe(true);
  });
});
