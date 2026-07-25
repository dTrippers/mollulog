import { describe, expect, it } from "@jest/globals";
import type { OcrResultEnvelope } from "~/domain/ocr";
import {
  getRecognizedStudentFields,
  parseStudentDetailVideoEnvelope,
  parseStudentDetailVideoResult,
} from "~/domain/student-video-ocr";
import fixture from "../../fixtures/student-detail-video-result.v1.json";

describe("student detail video result contract", () => {
  it("parses the AOI fixture and preserves recognized zero values", () => {
    const result = parseStudentDetailVideoResult(fixture);
    const student = result.students[0];

    expect(getRecognizedStudentFields(student)).toMatchObject({
      weaponLevel: 0,
      abilityHp: 0,
      abilityAtk: 0,
      abilityHeal: 0,
    });
    expect(getRecognizedStudentFields(student)).not.toHaveProperty("skillEnhanced");
    expect(getRecognizedStudentFields(student)).not.toHaveProperty("skillSub");
    expect(getRecognizedStudentFields(student)).not.toHaveProperty("equip3");
    expect(getRecognizedStudentFields(student)).not.toHaveProperty("equipSpecial");
  });

  it("rejects out-of-range values for all server-authoritative details", () => {
    const invalid = JSON.parse(JSON.stringify(fixture));
    invalid.students[0].fieldDetails.equipSpecial = {
      state: "recognized",
      value: 3,
      confidence: 1,
      evidence: [],
    };
    invalid.students[0].fields.equipSpecial = 3;

    expect(() => parseStudentDetailVideoResult(invalid)).toThrow("equipSpecial");
  });

  it("rejects a value attached to unknown, conflict, or not-applicable state", () => {
    for (const state of ["unknown", "conflict", "not_applicable"] as const) {
      const invalid = JSON.parse(JSON.stringify(fixture));
      invalid.students[0].fieldDetails.skillSub = { state, value: 1, confidence: 0, evidence: [] };
      invalid.students[0].fields.skillSub = 1;
      expect(() => parseStudentDetailVideoResult(invalid)).toThrow("판독 불가 값은 null");
    }
  });

  it("rejects unknown envelope schema and model versions", () => {
    const envelope = {
      attemptUid: "attempt",
      status: "succeeded",
      inputSha256: "a".repeat(64),
      modelVersion: "0.1.0",
      catalogVersion: "catalog",
      schemaVersion: "student-detail-video-result.v1",
      result: fixture,
    } satisfies OcrResultEnvelope;

    expect(parseStudentDetailVideoEnvelope(envelope).result.students).toHaveLength(1);
    expect(() => parseStudentDetailVideoEnvelope({ ...envelope, schemaVersion: "v2" })).toThrow(
      "지원하지 않는 학생 영상 결과 schema",
    );
    expect(() => parseStudentDetailVideoEnvelope({ ...envelope, modelVersion: "future" })).toThrow(
      "지원하지 않는 학생 영상 인식 모델",
    );
  });

  it("does not impose duration or resolution limits on valid video metadata", () => {
    const result = JSON.parse(JSON.stringify(fixture));
    result.video.width = 7680;
    result.video.height = 4320;
    result.video.fps = 30;
    result.video.frameCount = 30 * 60 * 60;
    result.video.durationSeconds = 60 * 60;

    expect(parseStudentDetailVideoResult(result).video).toEqual(
      expect.objectContaining({
        width: 7680,
        height: 4320,
        durationSeconds: 60 * 60,
      }),
    );
  });

  it("accepts MOV container metadata", () => {
    const result = JSON.parse(JSON.stringify(fixture));
    result.video.filename = "student-roster.mov";
    result.video.container = "mov";

    expect(parseStudentDetailVideoResult(result).video.container).toBe("mov");
  });
});
