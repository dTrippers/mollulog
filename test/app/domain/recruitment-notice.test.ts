import { describe, expect, it } from "@jest/globals";
import { isFreeRecruitmentAvailable, isPickupUnavailableRecruitment } from "~/domain/recruitment-notice";
import { toUtcIso } from "~/lib/date-time";

const now = toUtcIso("2026-11-01T00:00:00Z");
const open = { until: toUtcIso("2026-11-10T00:00:00Z") };
const ended = { until: toUtcIso("2026-10-10T00:00:00Z") };

describe("isFreeRecruitmentAvailable", () => {
  it("needs the free recruit tag", () => {
    expect(isFreeRecruitmentAvailable({ tags: ["recruit_free_100"], recruitments: [open], now })).toBe(true);
    expect(isFreeRecruitmentAvailable({ tags: ["shop"], recruitments: [open], now })).toBe(false);
  });

  it("ends when any recruitment has ended or has no end", () => {
    expect(isFreeRecruitmentAvailable({ tags: ["recruit_free_100"], recruitments: [open, ended], now })).toBe(false);
    expect(isFreeRecruitmentAvailable({ tags: ["recruit_free_100"], recruitments: [{ until: null }], now })).toBe(
      false,
    );
  });
});

describe("isPickupUnavailableRecruitment", () => {
  it("covers a recruited student without a pickup", () => {
    expect(isPickupUnavailableRecruitment({ pickup: false, recruitmentType: "limited" })).toBe(true);
  });

  it("excludes pickups and given students", () => {
    expect(isPickupUnavailableRecruitment({ pickup: true, recruitmentType: "limited" })).toBe(false);
    expect(isPickupUnavailableRecruitment({ pickup: false, recruitmentType: "given" })).toBe(false);
  });
});
