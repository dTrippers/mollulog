import { describe, expect, it } from "@jest/globals";
import {
  applyMenuBadgeOverride,
  isMenuBadgeActive,
  isValidMenuBadgeDateRange,
  isValidMenuBadgeLabel,
  MENU_BADGE_MAX_LABEL_LENGTH,
  resolveMenuBadgeOverrides,
  type StoredMenuBadge,
} from "~/domain/navigation-menu-badges";

function badge(overrides: Partial<StoredMenuBadge> = {}): StoredMenuBadge {
  return {
    menuId: "raids",
    labelMode: "auto",
    label: null,
    redDotMode: "auto",
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

describe("navigation menu badge resolution", () => {
  it("accepts labels up to 12 code points and rejects blank or over-length labels", () => {
    expect(MENU_BADGE_MAX_LABEL_LENGTH).toBe(12);
    expect(isValidMenuBadgeLabel("열두글자라벨테스트문자예")).toBe(true);
    expect(isValidMenuBadgeLabel("열두글자라벨테스트문자예!")).toBe(false);
    expect(isValidMenuBadgeLabel("   ")).toBe(false);
  });

  it("validates optional date endpoints and requires the end after the start", () => {
    expect(isValidMenuBadgeDateRange(null, null)).toBe(true);
    expect(isValidMenuBadgeDateRange("2026-09-27T00:00:00.000Z", null)).toBe(true);
    expect(isValidMenuBadgeDateRange(null, "2026-10-01T00:00:00.000Z")).toBe(true);
    expect(isValidMenuBadgeDateRange("invalid", null)).toBe(false);
    expect(isValidMenuBadgeDateRange(null, "invalid")).toBe(false);
    expect(isValidMenuBadgeDateRange("2026-10-01T00:00:00.000Z", "2026-09-27T00:00:00.000Z")).toBe(false);
  });

  it("uses inclusive start and exclusive end boundaries and reevaluates expired rows", () => {
    const scheduled = badge({
      startsAt: "2026-09-27T00:00:00.000Z",
      endsAt: "2026-10-01T00:00:00.000Z",
    });

    expect(isMenuBadgeActive(scheduled, "2026-09-26T23:59:59.999Z")).toBe(false);
    expect(isMenuBadgeActive(scheduled, "2026-09-27T00:00:00.000Z")).toBe(true);
    expect(isMenuBadgeActive(scheduled, "2026-09-30T23:59:59.999Z")).toBe(true);
    expect(isMenuBadgeActive(scheduled, "2026-10-01T00:00:00.000Z")).toBe(false);
    expect(isMenuBadgeActive(badge(), "2026-09-27T00:00:00.000Z")).toBe(true);
  });

  it("applies custom and hidden modes independently for label and red dot", () => {
    const customLabel = resolveMenuBadgeOverrides(
      [badge({ labelMode: "custom", label: "새 시즌", redDotMode: "hidden" })],
      "2026-09-27T00:00:00.000Z",
    ).overrides.raids;
    const automaticDot = resolveMenuBadgeOverrides(
      [badge({ labelMode: "hidden", redDotMode: "show" })],
      "2026-09-27T00:00:00.000Z",
    ).overrides.raids;

    expect(applyMenuBadgeOverride("raids", { label: "진행중", showRedDot: true }, customLabel)).toEqual({
      label: "새 시즌",
      showRedDot: false,
    });
    expect(applyMenuBadgeOverride("raids", { label: "진행중", showRedDot: false }, automaticDot)).toEqual({
      label: undefined,
      showRedDot: true,
    });
    expect(applyMenuBadgeOverride("raids", { label: "진행중", showRedDot: true })).toEqual({
      label: "진행중",
      showRedDot: true,
    });
  });

  it("ignores an over-length stored label, warns, and retains the independent red-dot override", () => {
    const { overrides, warnings } = resolveMenuBadgeOverrides(
      [badge({ labelMode: "custom", label: "열두글자라벨테스트문자예!", redDotMode: "show" })],
      "2026-09-27T00:00:00.000Z",
    );

    expect(warnings).toEqual([{ menuId: "raids", reason: "invalid-label" }]);
    expect(overrides.raids).toMatchObject({ labelMode: "auto", label: null, redDotMode: "show" });
    expect(applyMenuBadgeOverride("raids", { label: "진행중", showRedDot: false }, overrides.raids)).toEqual({
      label: "진행중",
      showRedDot: true,
    });
  });

  it("falls back to automatic label state when a non-custom row contains a label", () => {
    const { overrides, warnings } = resolveMenuBadgeOverrides(
      [badge({ labelMode: "hidden", label: "stale label", redDotMode: "show" })],
      "2026-09-27T00:00:00.000Z",
    );

    expect(warnings).toEqual([{ menuId: "raids", reason: "invalid-label" }]);
    expect(overrides.raids).toMatchObject({ labelMode: "auto", label: null, redDotMode: "show" });
    expect(applyMenuBadgeOverride("raids", { label: "진행중", showRedDot: false }, overrides.raids)).toEqual({
      label: "진행중",
      showRedDot: true,
    });
  });

  it("falls back to automatic label state when a custom row has no valid label", () => {
    const { overrides, warnings } = resolveMenuBadgeOverrides(
      [badge({ labelMode: "custom", label: null, redDotMode: "hidden" })],
      "2026-09-27T00:00:00.000Z",
    );

    expect(warnings).toEqual([{ menuId: "raids", reason: "invalid-label" }]);
    expect(overrides.raids).toMatchObject({ labelMode: "auto", label: null, redDotMode: "hidden" });
  });

  it("falls back per field for unknown modes and warns even before a scheduled row starts", () => {
    const { overrides, warnings } = resolveMenuBadgeOverrides(
      [
        badge({ labelMode: "future-mode" as StoredMenuBadge["labelMode"], redDotMode: "hidden" }),
        badge({
          menuId: "events",
          labelMode: "custom",
          label: "정상 라벨",
          redDotMode: "future-mode" as StoredMenuBadge["redDotMode"],
        }),
        badge({
          menuId: "students",
          labelMode: "custom",
          label: "정상 라벨",
          redDotMode: "future-mode" as StoredMenuBadge["redDotMode"],
          startsAt: "2026-10-01T00:00:00.000Z",
        }),
      ],
      "2026-09-27T00:00:00.000Z",
    );

    expect(overrides.raids).toMatchObject({ labelMode: "auto", label: null, redDotMode: "hidden" });
    expect(overrides.events).toMatchObject({ labelMode: "custom", label: "정상 라벨", redDotMode: "auto" });
    expect(overrides.students).toBeUndefined();
    expect(warnings).toEqual([
      { menuId: "raids", reason: "invalid-mode" },
      { menuId: "events", reason: "invalid-mode" },
      { menuId: "students", reason: "invalid-mode" },
    ]);
  });

  it("warns and skips unknown IDs and invalid periods", () => {
    const { overrides, warnings } = resolveMenuBadgeOverrides(
      [badge({ menuId: "removed-menu" }), badge({ menuId: "students", startsAt: "invalid" })],
      "2026-09-27T00:00:00.000Z",
    );

    expect(overrides).toEqual({});
    expect(warnings).toEqual([
      { menuId: "removed-menu", reason: "unknown-menu" },
      { menuId: "students", reason: "invalid-period" },
    ]);
  });

  it("returns to automatic values after the configured end instant", () => {
    const { overrides } = resolveMenuBadgeOverrides(
      [badge({ labelMode: "custom", label: "새 시즌", redDotMode: "show", endsAt: "2026-09-27T00:00:00.000Z" })],
      "2026-09-27T00:00:00.000Z",
    );

    expect(overrides).toEqual({});
    expect(applyMenuBadgeOverride("raids", { label: "진행중", showRedDot: false }, overrides.raids)).toEqual({
      label: "진행중",
      showRedDot: false,
    });
  });
});
