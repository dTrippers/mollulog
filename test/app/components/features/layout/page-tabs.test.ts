import { describe, expect, it } from "@jest/globals";
import {
  getMobileTabItemClassName,
  getVerticalDesktopTabItemClassName,
  shouldShowMobileTabText,
} from "../../../../../app/components/features/layout/Page";

describe("Page vertical tabs", () => {
  it("keeps mobile tab labels visible so icon-only filters do not lose meaning", () => {
    expect(shouldShowMobileTabText({ active: false })).toBe(true);
    expect(shouldShowMobileTabText({ active: true })).toBe(true);
  });

  it("keeps the existing neutral active treatment instead of introducing a blue accent", () => {
    expect(getMobileTabItemClassName({ active: true, disabled: false })).toContain("bg-neutral-900");
    expect(getVerticalDesktopTabItemClassName({ active: true, disabled: false })).toContain("bg-neutral-900");
  });
});
