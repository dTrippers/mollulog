import { describe, expect, it } from "@jest/globals";
import {
  getScannerTerminalJobDescription,
  getScannerTerminalJobTitle,
} from "~/routes/scanner._components/scanner-messages";

describe("shared scanner terminal messages", () => {
  it("keeps status and job-kind copy explicit without exposing internal identifiers", () => {
    expect(getScannerTerminalJobTitle("cancelled", "item_inventory_images_v1")).toBe(
      "아이템 스크린샷 인식 작업이 취소됐어요",
    );
    expect(getScannerTerminalJobDescription("expired", "item_inventory_images_v1")).toBe(
      "보관 기간이 지난 작업이에요. 새로 업로드해 다시 시도해 주세요.",
    );
    expect(getScannerTerminalJobTitle("failed", "student_detail_images_v1")).toBe("학생 이미지를 인식하지 못했어요");
    expect(getScannerTerminalJobDescription("failed", "student_detail_video_v1")).toBe(
      "학생 기본 정보 화면을 확인할 수 있는 이미지나 영상을 선택해 다시 시도해 주세요.",
    );
  });

  it("preserves the student image dimension failure message", () => {
    expect(
      getScannerTerminalJobDescription("failed", "student_detail_images_v1", [
        {
          status: "failed",
          error: { code: "image_dimensions_exceeded" },
        },
      ]),
    ).toBe("이미지 해상도가 너무 커요. 4K급 이미지를 사용해 주세요.");
  });
});
