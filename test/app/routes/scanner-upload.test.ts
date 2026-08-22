import { describe, expect, it } from "@jest/globals";
import {
  ITEM_SCANNER_ACCEPT_SPEC,
  mergeScannerFiles,
  STUDENT_SCANNER_ACCEPT_SPEC,
  validateScannerFiles,
} from "~/routes/scanner._components/scanner-upload";

function file(name: string, type: string, size = 1, lastModified = 1): File {
  return { name, type, size, lastModified } as File;
}

describe("shared scanner upload validation", () => {
  it("deduplicates identical selections while preserving distinct files", () => {
    const original = file("screen.png", "image/png");
    const duplicate = file("screen.png", "image/png");
    const other = file("screen-2.png", "image/png");

    expect(mergeScannerFiles([original], [duplicate, other])).toEqual([original, other]);
  });

  it("keeps item image limits and total-size validation", () => {
    expect(
      validateScannerFiles(
        Array.from({ length: 31 }, (_, index) => file(`screen-${index}.png`, "image/png")),
        ITEM_SCANNER_ACCEPT_SPEC,
      ).error,
    ).toBe("이미지는 1장부터 30장까지 선택할 수 있어요.");

    expect(
      validateScannerFiles(
        Array.from({ length: 13 }, (_, index) => file(`screen-${index}.png`, "image/png", 10 * 1024 * 1024)),
        ITEM_SCANNER_ACCEPT_SPEC,
      ).error,
    ).toBe("한 작업의 이미지 전체 용량은 120MB를 넘을 수 없어요.");
  });

  it("rejects unsupported MIME types and accepts extension-only media", () => {
    expect(validateScannerFiles([file("screen.gif", "image/gif")], STUDENT_SCANNER_ACCEPT_SPEC).error).toBe(
      "지원하는 파일은 PNG, JPEG, WebP 이미지와 MP4, MOV 영상이에요.",
    );
    expect(validateScannerFiles([file("screen.png", "")], ITEM_SCANNER_ACCEPT_SPEC)).toEqual({
      images: [expect.objectContaining({ name: "screen.png" })],
      video: null,
      error: null,
    });
  });

  it("preserves the single-video limit for mixed student uploads", () => {
    const selection = validateScannerFiles(
      [file("screen.png", "image/png"), file("first.mp4", "video/mp4"), file("second.mov", "video/quicktime")],
      STUDENT_SCANNER_ACCEPT_SPEC,
    );
    expect(selection.error).toBe("영상은 한 번에 한 개만 선택할 수 있어요.");
  });

  it("keeps an empty selection valid for the disabled upload action", () => {
    expect(validateScannerFiles([], ITEM_SCANNER_ACCEPT_SPEC)).toEqual({ images: [], video: null, error: null });
  });

  it("derives size messages from the active accept specification", () => {
    expect(
      validateScannerFiles([file("screen.png", "image/png", 3 * 1024)], {
        images: { max: 3, maxBytes: 2 * 1024, totalMaxBytes: 4 * 1024 },
      }).error,
    ).toBe("이미지 한 장은 2KB를 넘을 수 없어요.");
    expect(
      validateScannerFiles([file("screen.png", "image/png", 5 * 1024)], {
        images: { max: 3, maxBytes: 10 * 1024, totalMaxBytes: 4 * 1024 },
      }).error,
    ).toBe("한 작업의 이미지 전체 용량은 4KB를 넘을 수 없어요.");
    expect(
      validateScannerFiles([file("capture.mp4", "video/mp4", 3 * 1024 * 1024)], {
        video: { max: 1, maxBytes: 2 * 1024 * 1024 },
      }).error,
    ).toBe("영상은 2MB를 넘을 수 없어요.");
  });
});
