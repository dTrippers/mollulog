import { describe, expect, it } from "@jest/globals";
import {
  OCR_MAX_IMAGE_BYTES,
  OcrPublicError,
  parseOcrResultEnvelope,
  parseOcrTaskMessage,
  parseOcrUploadInputs,
  parseOcrUploadRequest,
  toPublicOcrError,
} from "~/domain/ocr";

const validImage = {
  filename: "inventory.png",
  contentType: "image/png",
  byteSize: 1024,
  sha256: "a".repeat(64),
};

describe("OCR contract validation", () => {
  it("accepts supported images without depending on resolution or aspect ratio", () => {
    expect(parseOcrUploadInputs({ images: [validImage] })).toEqual([validImage]);
  });

  it("treats training consent as an explicit opt-in", () => {
    expect(parseOcrUploadRequest({ images: [validImage], trainingConsent: true })).toEqual({
      jobKind: "item_inventory_images_v1",
      images: [validImage],
      trainingConsent: true,
    });
    expect(parseOcrUploadRequest({ images: [validImage], trainingConsent: "true" }).trainingConsent).toBe(false);
  });

  it.each([
    [{ images: [] }, "1장부터"],
    [{ images: [{ ...validImage, contentType: "image/gif" }] }, "PNG, JPEG, WebP"],
    [{ images: [{ ...validImage, byteSize: OCR_MAX_IMAGE_BYTES + 1 }] }, "10MB"],
    [{ images: [{ ...validImage, sha256: "bad" }] }, "파일 정보를 다시 확인"],
  ])("rejects an invalid upload contract", (value, message) => {
    expect(() => parseOcrUploadInputs(value)).toThrow(message);
  });

  it("parses both versioned task types", () => {
    expect(parseOcrTaskMessage({ type: "ocr.job.finalize.v1", taskUid: "job", generation: 2 })).toEqual({
      type: "ocr.job.finalize.v1",
      taskUid: "job",
      generation: 2,
    });
  });

  it("parses the student video upload as a discriminated request", () => {
    expect(
      parseOcrUploadRequest({
        jobKind: "student_detail_video_v1",
        video: {
          filename: "students.mp4",
          contentType: "video/mp4",
          byteSize: 1024,
          sha256: "a".repeat(64),
        },
      }),
    ).toEqual({
      jobKind: "student_detail_video_v1",
      video: {
        filename: "students.mp4",
        contentType: "video/mp4",
        byteSize: 1024,
        sha256: "a".repeat(64),
      },
      trainingConsent: false,
    });
    expect(() => parseOcrUploadRequest({ jobKind: "future" })).toThrow("현재 사용할 수 없어요");
  });

  it("parses the video task type without changing image task parsing", () => {
    expect(
      parseOcrTaskMessage({
        type: "ocr.student_detail_video.recognize.v1",
        taskUid: "job",
        generation: 1,
      }),
    ).toEqual({
      type: "ocr.student_detail_video.recognize.v1",
      taskUid: "job",
      generation: 1,
    });
  });

  it("requires provenance and input hash for successful results", () => {
    expect(() => parseOcrResultEnvelope({ attemptUid: "attempt", status: "succeeded", result: {} })).toThrow(
      "modelVersion",
    );
    expect(
      parseOcrResultEnvelope({
        attemptUid: "attempt",
        status: "succeeded",
        inputSha256: "hash",
        modelVersion: "model",
        catalogVersion: "catalog",
        schemaVersion: "1",
        result: {},
      }),
    ).toEqual(expect.objectContaining({ status: "succeeded" }));
  });

  it("exposes only explicitly public errors at API boundaries", () => {
    expect(toPublicOcrError(new OcrPublicError("영상 형식을 확인해주세요"), "처리하지 못했어요")).toEqual({
      message: "영상 형식을 확인해주세요",
      status: 400,
      expected: true,
    });
    expect(toPublicOcrError(new Error("OCR Queue binding is missing"), "처리하지 못했어요")).toEqual({
      message: "처리하지 못했어요",
      status: 500,
      expected: false,
    });
  });
});
