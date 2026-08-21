import { describe, expect, it } from "@jest/globals";
import { getScannerQuotaError, isScannerQuotaEnabled } from "~/routes/scanner._components/useScannerQuota";

describe("scanner quota route decisions", () => {
  it("keeps video quota disabled on the item scanner while retaining image quota", () => {
    expect(isScannerQuotaEnabled("/scanner/resource", "image")).toBe(true);
    expect(isScannerQuotaEnabled("/scanner/resource", "video")).toBe(false);
    expect(isScannerQuotaEnabled("/scanner/student", "image")).toBe(true);
    expect(isScannerQuotaEnabled("/scanner/student", "video")).toBe(true);
  });

  it("does not surface a hidden video quota error on the item scanner", () => {
    expect(
      getScannerQuotaError({ imageError: null, videoError: "영상 quota를 불러오지 못했어요.", showVideoQuota: false }),
    ).toBeNull();
    expect(
      getScannerQuotaError({ imageError: "이미지 quota 오류", videoError: "영상 quota 오류", showVideoQuota: false }),
    ).toBe("이미지 quota 오류");
    expect(getScannerQuotaError({ imageError: null, videoError: "영상 quota 오류", showVideoQuota: true })).toBe(
      "영상 quota 오류",
    );
  });
});
