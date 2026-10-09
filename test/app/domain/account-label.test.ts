import { describe, expect, it } from "@jest/globals";
import {
  ACCOUNT_LABEL_PRESENTATIONS,
  ACCOUNT_LABELS,
  getPrimaryAccountLabel,
  hasAccountLabel,
} from "~/domain/account-label";

describe("account labels", () => {
  it("describes the official label and its logo avatar", () => {
    expect(ACCOUNT_LABELS).toEqual(["official"]);
    expect(ACCOUNT_LABEL_PRESENTATIONS.official).toEqual({
      label: "official",
      name: "공식 계정",
      profileImageUrl: "/android-chrome-192x192.png",
      profileImageAlt: "몰루로그 로고",
    });
  });

  it("checks whether a label is present", () => {
    expect(hasAccountLabel(["official"], "official")).toBe(true);
    expect(hasAccountLabel([], "official")).toBe(false);
    expect(hasAccountLabel(null, "official")).toBe(false);
  });

  it("chooses the first matching label by registry priority", () => {
    expect(getPrimaryAccountLabel(["unknown", "official"])).toBe("official");
  });

  it.each([[], ["unknown"], null, undefined])("returns null when there is no known label: %s", (labels) => {
    expect(getPrimaryAccountLabel(labels)).toBeNull();
  });
});
