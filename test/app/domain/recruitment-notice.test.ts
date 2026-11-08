import { describe, expect, it } from "@jest/globals";
import {
  getAvailableFreeRecruitmentPulls,
  getFreeRecruitmentNotice,
  getTaggedFreeRecruitmentPulls,
  isPickupUnavailableRecruitment,
  withoutFreeRecruitmentTags,
} from "~/domain/recruitment-notice";
import { toUtcIso } from "~/lib/date-time";

const now = toUtcIso("2026-11-01T00:00:00Z");
const open = { until: toUtcIso("2026-11-10T00:00:00Z") };
const ended = { until: toUtcIso("2026-10-10T00:00:00Z") };

describe("getAvailableFreeRecruitmentPulls", () => {
  it("needs a free recruit tag and returns its count", () => {
    expect(getAvailableFreeRecruitmentPulls({ tags: ["recruit_free_100"], recruitments: [open], now })).toBe(100);
    expect(getAvailableFreeRecruitmentPulls({ tags: ["recruit_free_200"], recruitments: [open], now })).toBe(200);
    expect(getAvailableFreeRecruitmentPulls({ tags: ["shop"], recruitments: [open], now })).toBe(0);
  });

  it("ends when any recruitment has ended or has no end", () => {
    for (const tag of ["recruit_free_100", "recruit_free_200"]) {
      expect(getAvailableFreeRecruitmentPulls({ tags: [tag], recruitments: [open, ended], now })).toBe(0);
      expect(getAvailableFreeRecruitmentPulls({ tags: [tag], recruitments: [{ until: null }], now })).toBe(0);
    }
  });
});

describe("getTaggedFreeRecruitmentPulls", () => {
  it("applies the largest grant when several free recruit tags are set", () => {
    expect(getTaggedFreeRecruitmentPulls(["recruit_free_100", "recruit_free_200"])).toBe(200);
    expect(getTaggedFreeRecruitmentPulls([])).toBe(0);
  });
});

describe("withoutFreeRecruitmentTags", () => {
  it("removes every free recruit tag and keeps the others", () => {
    expect(withoutFreeRecruitmentTags(["shop", "recruit_free_100", "recruit_free_200"])).toEqual(["shop"]);
  });
});

describe("getFreeRecruitmentNotice", () => {
  it("names the free recruit count", () => {
    expect(getFreeRecruitmentNotice(200).description).toBe(
      "200회 무료 모집은 픽업 기간 종료 시 소멸되며 이월되지 않아요. 기간 내 사용해주세요.",
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
