import { describe, expect, it } from "@jest/globals";
import { parseStudentDetailVideoResult } from "~/domain/student-video-ocr";
import { buildStudentVideoApplyRequest, createReviewState } from "~/routes/scanner.student._components/StudentScanner";
import fixture from "../../fixtures/student-detail-video-result.v1.json";

describe("student scanner review", () => {
  const result = parseStudentDetailVideoResult(fixture);

  it("sends only selected students and confirmed recognized fields while preserving zero", () => {
    const review = createReviewState(result);
    review["10000"].included = true;
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

  it("does not submit unselected students", () => {
    expect(buildStudentVideoApplyRequest(result, createReviewState(result))).toEqual({ students: [] });
  });
});
