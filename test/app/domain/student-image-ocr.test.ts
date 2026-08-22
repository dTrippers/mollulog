import { describe, expect, it } from "@jest/globals";
import { parseStudentDetailImagesResult } from "~/domain/student-image-ocr";
import fixture from "../../fixtures/student-detail-images-result.v1.json";

describe("student image result contract", () => {
  it("parses the AOI final result without rebuilding its merge semantics", () => {
    const result = parseStudentDetailImagesResult(fixture);

    expect(result).toEqual(fixture);
    expect(result.images).toEqual([expect.objectContaining({ imageUid: "image-1", studentUids: ["10000"] })]);
    expect(result.students).toEqual([
      expect.objectContaining({
        studentUid: "10000",
        sourceImageUids: ["image-1"],
        fieldDetails: expect.objectContaining({
          equip3: expect.objectContaining({ state: "conflict", value: null }),
          skillSub: expect.objectContaining({ state: "unknown", value: null }),
        }),
      }),
    ]);
  });
});
