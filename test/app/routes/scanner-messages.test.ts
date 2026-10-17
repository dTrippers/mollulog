import { describe, expect, it } from "@jest/globals";
import {
  getScannerJobStatusLabel,
  getScannerTerminalJobDescription,
  getScannerTerminalJobTitle,
} from "~/routes/scanner._components/scanner-messages";

describe("shared scanner terminal messages", () => {
  it("keeps status and job-kind copy explicit without exposing internal identifiers", () => {
    expect(getScannerTerminalJobTitle("cancelled", "item_inventory_images_v1")).toBe("삭제한 인식 결과예요");
    expect(getScannerTerminalJobTitle("expired", "item_inventory_images_v1")).toBe("업로드에 실패했어요");
    expect(getScannerTerminalJobDescription("expired", "item_inventory_images_v1")).toBe(
      "업로드가 15분 안에 끝나지 않아 작업이 만료됐어요. 파일을 다시 선택해 업로드해 주세요.",
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

  it("splits an upload expiry from a recognition failure in the job list", () => {
    expect(getScannerJobStatusLabel("expired", false)).toBe("업로드 실패");
    expect(getScannerJobStatusLabel("failed", false)).toBe("인식 실패");
    expect(getScannerJobStatusLabel("review_ready", true)).toBe("반영 완료");
    expect(getScannerJobStatusLabel("review_ready", false)).toBe("검토 필요");
  });
});

describe("scanner job list labels", () => {
  it("labels a cancelled job as deleted", () => {
    expect(getScannerJobStatusLabel("cancelled", false)).toBe("삭제됨");
  });
});
