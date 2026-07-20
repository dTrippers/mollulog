import { describe, expect, it } from "@jest/globals";
import { OCR_MAX_IMAGE_BYTES, parseOcrResultEnvelope, parseOcrTaskMessage, parseOcrUploadInputs } from "~/domain/ocr";

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

  it.each([
    [{ images: [] }, "1장부터"],
    [{ images: [{ ...validImage, contentType: "image/gif" }] }, "PNG, JPEG, WebP"],
    [{ images: [{ ...validImage, byteSize: OCR_MAX_IMAGE_BYTES + 1 }] }, "10MB"],
    [{ images: [{ ...validImage, sha256: "bad" }] }, "SHA-256"],
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
});
