import { describe, expect, it } from "@jest/globals";
import {
  OCR_MAX_IMAGE_BYTES,
  OCR_MAX_VIDEO_BYTES,
  OcrPublicError,
  parseOcrArtifactPreparationRequest,
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
        trainingConsent: true,
      }),
    ).toEqual({
      jobKind: "student_detail_video_v1",
      video: {
        filename: "students.mp4",
        contentType: "video/mp4",
        byteSize: 1024,
        sha256: "a".repeat(64),
      },
      trainingConsent: true,
    });
    expect(() => parseOcrUploadRequest({ jobKind: "future" })).toThrow("현재 사용할 수 없어요");
  });

  it("parses student image batches and rejects mixed media", () => {
    expect(
      parseOcrUploadRequest({
        jobKind: "student_detail_images_v1",
        images: [validImage],
        trainingConsent: false,
      }),
    ).toEqual({
      jobKind: "student_detail_images_v1",
      images: [validImage],
      trainingConsent: false,
    });
    expect(() =>
      parseOcrUploadRequest({
        jobKind: "student_detail_images_v1",
        images: [validImage],
        video: {
          filename: "student.mp4",
          contentType: "video/mp4",
          byteSize: 1024,
          sha256: "a".repeat(64),
        },
      }),
    ).toThrow("함께 제출할 수 없어요");
    expect(() =>
      parseOcrUploadRequest({
        jobKind: "student_detail_video_v1",
        images: [validImage],
        video: {
          filename: "student.mp4",
          contentType: "video/mp4",
          byteSize: 1024,
          sha256: "a".repeat(64),
        },
      }),
    ).toThrow("함께 제출할 수 없어요");
  });

  it("accepts MOV student videos with the QuickTime content type", () => {
    const video = {
      filename: "students.MOV",
      contentType: "video/quicktime" as const,
      byteSize: 1024,
      sha256: "a".repeat(64),
    };

    expect(parseOcrUploadRequest({ jobKind: "student_detail_video_v1", video })).toEqual(
      expect.objectContaining({ video }),
    );
    expect(() =>
      parseOcrUploadRequest({
        jobKind: "student_detail_video_v1",
        video: { ...video, contentType: "video/mp4" },
      }),
    ).toThrow("확장자와 형식");
  });

  it("limits student video uploads to 250MB", () => {
    const video = {
      filename: "students.mp4",
      contentType: "video/mp4",
      byteSize: OCR_MAX_VIDEO_BYTES,
      sha256: "a".repeat(64),
    };

    expect(parseOcrUploadRequest({ jobKind: "student_detail_video_v1", video })).toEqual(
      expect.objectContaining({ video }),
    );
    expect(() =>
      parseOcrUploadRequest({
        jobKind: "student_detail_video_v1",
        video: { ...video, byteSize: OCR_MAX_VIDEO_BYTES + 1 },
      }),
    ).toThrow("250MB");
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

  it("validates bounded per-student WebP artifact manifests", () => {
    const artifact = {
      studentUid: "10000",
      sourceFrame: 12,
      timestampSeconds: 0.4,
      contentType: "image/webp",
      byteSize: 4096,
      sha256: "a".repeat(64),
      width: 1040,
      height: 480,
    };

    expect(
      parseOcrArtifactPreparationRequest({
        attemptUid: "attempt-1",
        artifacts: [artifact],
      }),
    ).toEqual({ attemptUid: "attempt-1", artifacts: [artifact] });
    expect(() =>
      parseOcrArtifactPreparationRequest({
        attemptUid: "attempt-1",
        artifacts: [artifact, artifact],
      }),
    ).toThrow("중복");
    expect(() =>
      parseOcrArtifactPreparationRequest({
        attemptUid: "attempt-1",
        artifacts: [{ ...artifact, contentType: "image/png" }],
      }),
    ).toThrow("content type");
  });

  it("accepts only explicit artifact UID and student UID result references", () => {
    const result = parseOcrResultEnvelope({
      attemptUid: "attempt",
      status: "succeeded",
      inputSha256: "hash",
      modelVersion: "model",
      catalogVersion: "catalog",
      schemaVersion: "1",
      result: {},
      artifacts: [{ artifactUid: "artifact-1", studentUid: "10000" }],
    });

    expect(result).toEqual(
      expect.objectContaining({
        artifacts: [{ artifactUid: "artifact-1", studentUid: "10000" }],
      }),
    );
    expect(() =>
      parseOcrResultEnvelope({
        attemptUid: "attempt",
        status: "succeeded",
        inputSha256: "hash",
        modelVersion: "model",
        catalogVersion: "catalog",
        schemaVersion: "1",
        result: {},
        artifacts: [
          { artifactUid: "same", studentUid: "10000" },
          { artifactUid: "same", studentUid: "10001" },
        ],
      }),
    ).toThrow("중복");
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
