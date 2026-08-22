import { describe, expect, it } from "@jest/globals";
import { parseStudentDetailImagesResult } from "~/domain/student-image-ocr";
import { parseStudentDetailVideoResult } from "~/domain/student-video-ocr";
import { getScannerTerminalJobDescription } from "~/routes/scanner._components/scanner-messages";
import {
  buildStudentVideoApplyRequest,
  createReviewState,
  getFieldComparison,
  getStudentFailedImagesDescription,
  getStudentJobTransition,
} from "~/routes/scanner.student._components/StudentScanner";
import fixture from "../../fixtures/student-detail-video-result.v1.json";

describe("student scanner review", () => {
  const result = parseStudentDetailVideoResult(fixture);
  const imageResult = parseStudentDetailImagesResult({
    schemaVersion: 1,
    jobType: "student_detail_images_v1",
    executionProvider: "cpu",
    images: [{ imageUid: "image-1", filename: "student.png", width: 1040, height: 480, studentUids: ["10000"] }],
    students: fixture.students.map(
      ({ sourceFrames: _sourceFrames, sourceTimestampsSeconds: _sourceTimestampsSeconds, ...student }) => ({
        ...student,
        sourceImageUids: ["image-1"],
      }),
    ),
    unresolvedCount: fixture.unresolvedCount,
    elapsedMs: fixture.elapsedMs,
  });

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

  it("uses the same review and apply normalization for student image results", () => {
    const review = createReviewState(imageResult);
    expect(buildStudentVideoApplyRequest(imageResult, review, new Set(["10000"])).students[0]).toEqual(
      expect.objectContaining({
        studentUid: "10000",
        current: expect.objectContaining({ tier: 7, bond: 32 }),
        confirmedFields: expect.arrayContaining(["tier", "bond"]),
      }),
    );
  });

  it("identifies oversized images in partial and all-failed states", () => {
    const oversizedImage = {
      uid: "image-large",
      filename: "large.png",
      status: "failed",
      error: {
        code: "image_dimensions_exceeded",
        message: "이미지 해상도가 너무 커요. 4K급 이미지를 사용해 주세요.",
      },
    };

    expect(getStudentFailedImagesDescription([oversizedImage])).toContain(
      "large.png · 이미지 해상도가 너무 커요. 4K급 이미지를 사용해 주세요.",
    );
    expect(getScannerTerminalJobDescription("failed", "student_detail_images_v1", [oversizedImage])).toBe(
      "이미지 해상도가 너무 커요. 4K급 이미지를 사용해 주세요.",
    );
    expect(
      getScannerTerminalJobDescription("failed", "student_detail_images_v1", [
        { ...oversizedImage, error: { code: "recognition_failed", message: "이미지를 인식하지 못했어요" } },
      ]),
    ).toBe("학생 상세 화면이 보이는 이미지나 영상을 선택해 다시 시도해 주세요.");
  });

  it("leaves the unavailable-result message to the completion state", () => {
    expect(getStudentJobTransition({ status: "review_ready", result: null, application: null })).toEqual({
      phase: "idle",
      error: "인식 결과를 안전하게 확인하지 못했어요. 새로 업로드해 주세요.",
    });
  });

  it("marks unsupported job states as an explicit unavailable result", () => {
    expect(getStudentJobTransition({ status: "unexpected", result: null, application: null })).toEqual({
      phase: "idle",
      error: "인식 결과를 안전하게 확인하지 못했어요. 새로 업로드해 주세요.",
    });
  });
});
