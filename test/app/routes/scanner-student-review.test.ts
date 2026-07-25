import { describe, expect, it } from "@jest/globals";
import { parseStudentDetailVideoResult } from "~/domain/student-video-ocr";
import {
  buildStudentVideoApplyRequest,
  createReviewState,
  getFieldComparison,
} from "~/routes/scanner.student._components/StudentScanner";
import fixture from "../../fixtures/student-detail-video-result.v1.json";

describe("student scanner review", () => {
  const result = parseStudentDetailVideoResult(fixture);

  it("sends every student with a confirmed tier while preserving zero", () => {
    const review = createReviewState(result);
    review["10000"].confirmed.level = false;

    expect(buildStudentVideoApplyRequest(result, review)).toEqual({
      students: [
        {
          studentUid: "10000",
          current: {
            tier: 7,
            weaponLevel: 0,
            abilityHp: 0,
            abilityAtk: 0,
            abilityHeal: 0,
            skillEx: 5,
            skillNormal: 10,
            equip1: 10,
            equip2: 9,
            bond: 32,
          },
          confirmedFields: [
            "tier",
            "weaponLevel",
            "abilityHp",
            "abilityAtk",
            "abilityHeal",
            "skillEx",
            "skillNormal",
            "equip1",
            "equip2",
            "bond",
          ],
        },
      ],
    });
  });

  it("excludes students that are not in the current catalog", () => {
    expect(buildStudentVideoApplyRequest(result, createReviewState(result), new Set())).toEqual({ students: [] });
  });

  it("excludes a student until a failed tier has been corrected", () => {
    const review = createReviewState(result);
    review["10000"].confirmed.tier = false;
    review["10000"].values.tier = "";

    expect(buildStudentVideoApplyRequest(result, review)).toEqual({ students: [] });
  });

  it("classifies recognized values relative to the saved value", () => {
    const level = result.students[0].fieldDetails.level;
    const conflict = result.students[0].fieldDetails.equip3;

    expect(getFieldComparison(level, "90", 90)).toBe("same");
    expect(getFieldComparison(level, "89", 90)).toBe("decreased");
    expect(getFieldComparison(level, "90", 89)).toBeNull();
    expect(getFieldComparison(level, "90", null)).toBeNull();
    expect(getFieldComparison(conflict, "8", 9)).toBeNull();
    expect(getFieldComparison(conflict, "8", 9, true)).toBe("decreased");
  });

  it("submits a failed field after the user enters a replacement value", () => {
    const review = createReviewState(result);
    review["10000"].confirmed.equip3 = true;
    review["10000"].values.equip3 = "8";

    expect(buildStudentVideoApplyRequest(result, review).students[0]).toEqual(
      expect.objectContaining({
        current: expect.objectContaining({ equip3: 8 }),
        confirmedFields: expect.arrayContaining(["equip3"]),
      }),
    );
  });
});
