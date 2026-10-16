import { describe, expect, it } from "@jest/globals";
import {
  formatContentPeriod,
  formatFavoriteCount,
  formatOpenEndedStart,
  formatThousands,
  getCautionText,
  getDayDividerParts,
  getFaceStack,
  getFavoriteLabelState,
  getFilterSummary,
  getFutureContentLink,
  getFutureFavoriteKeyForStudentAnalysis,
  getFuturePendingStudentFavoriteKey,
  getFutureSpecialCases,
  getRemainingTime,
  groupRecruitmentsByPeriod,
  isContentFilterActive,
  isFutureContentLinkable,
  isNewRecruitment,
  isStoryContentType,
  matchesContentFilter,
  selectFutureMediaSource,
} from "~/domain/futures/futures-view-model";
import { RecruitmentTypeEnum } from "~/graphql/graphql";
import { recruitmentLabelLocale } from "~/locales/ko";

const timeZone = "Asia/Seoul";
// 2026-10-15 12:00 KST
const now = "2026-10-15T03:00:00.000Z";

describe("formatFavoriteCount", () => {
  it("groups thousands and switches to 만 units from 10,000", () => {
    expect(formatFavoriteCount(0)).toBe("0");
    expect(formatFavoriteCount(999)).toBe("999");
    expect(formatFavoriteCount(1284)).toBe("1,284");
    expect(formatFavoriteCount(9999)).toBe("9,999");
    expect(formatFavoriteCount(10000)).toBe("1.0만");
    expect(formatFavoriteCount(12345)).toBe("1.2만");
  });

  it("keeps the exact count for the accessible name", () => {
    expect(formatThousands(12345)).toBe("12,345");
  });
});

describe("getFavoriteLabelState", () => {
  it("shows the check only for a completed student, even when also a favorite", () => {
    const state = getFavoriteLabelState({ count: 2876, favorited: true, completed: true, signedIn: true });
    expect(state.icon).toBe("completed");
    expect(state.visible).toBe(true);
    expect(state.countText).toBe("2,876");
    expect(state.accessibleName).toBe("관심 학생 2,876명, 모집 완료");
  });

  it("uses the filled favorite state for the viewer's own favorite", () => {
    const state = getFavoriteLabelState({ count: 1284, favorited: true, completed: false, signedIn: true });
    expect(state.icon).toBe("favorited");
    expect(state.accessibleName).toBe("관심 학생 1,284명, 내 관심 등록");
  });

  it("hides the label when nobody follows and nothing is completed", () => {
    const state = getFavoriteLabelState({ count: 0, favorited: false, completed: false, signedIn: true });
    expect(state.visible).toBe(false);
    expect(state.countText).toBeNull();
  });

  it("reads no personal state for guests, so a guest sees only the public count", () => {
    const state = getFavoriteLabelState({ count: 188, favorited: true, completed: true, signedIn: false });
    expect(state.icon).toBe("unfavorited");
    expect(state.accessibleName).toBe("관심 학생 188명");
  });

  it("keeps a completed check visible without a count", () => {
    const state = getFavoriteLabelState({ count: 0, favorited: false, completed: true, signedIn: true });
    expect(state.visible).toBe(true);
    expect(state.countText).toBeNull();
  });

  it("shows no count for an unknown count, and keeps the viewer's own favorite state", () => {
    const favorited = getFavoriteLabelState({ count: null, favorited: true, completed: false, signedIn: true });
    expect(favorited.visible).toBe(true);
    expect(favorited.icon).toBe("favorited");
    expect(favorited.countText).toBeNull();
    expect(favorited.accessibleName).toBe("관심 학생, 내 관심 등록");
  });

  it("hides an unknown count from a viewer who has no state for the student", () => {
    const quiet = getFavoriteLabelState({ count: null, favorited: false, completed: false, signedIn: true });
    expect(quiet.visible).toBe(false);
    expect(quiet.countText).toBeNull();
    expect(quiet.accessibleName).toBe("관심 학생");

    const guest = getFavoriteLabelState({ count: null, favorited: true, completed: true, signedIn: false });
    expect(guest.visible).toBe(false);
    expect(guest.icon).toBe("unfavorited");
  });
});

describe("selectFutureMediaSource", () => {
  it("shows an empty placeholder for a hidden spoiler", () => {
    expect(selectFutureMediaSource({ hidden: true, isRaid: false, boss: "A", logoContentUid: "x" })).toEqual({
      kind: "placeholder",
    });
  });

  it("uses the boss image for a raid and the type icon when the boss is missing", () => {
    expect(selectFutureMediaSource({ hidden: false, isRaid: true, boss: "Hoshino", logoContentUid: null })).toEqual({
      kind: "boss",
      boss: "Hoshino",
    });
    expect(selectFutureMediaSource({ hidden: false, isRaid: true, boss: null, logoContentUid: null })).toEqual({
      kind: "type",
    });
  });

  it("uses the event logo when one exists and the type icon otherwise", () => {
    expect(selectFutureMediaSource({ hidden: false, isRaid: false, boss: null, logoContentUid: "uid-1" })).toEqual({
      kind: "logo",
      contentUid: "uid-1",
    });
    expect(selectFutureMediaSource({ hidden: false, isRaid: false, boss: null, logoContentUid: null })).toEqual({
      kind: "type",
    });
  });
});

describe("links and filters", () => {
  it("links only linkable types, and never a hidden spoiler", () => {
    expect(isFutureContentLinkable({ contentType: "event" })).toBe(true);
    expect(isFutureContentLinkable({ contentType: "event", isSpoiler: true, spoilerRevealed: false })).toBe(false);
    expect(isFutureContentLinkable({ contentType: "event", isSpoiler: true, spoilerRevealed: true })).toBe(true);
    expect(isFutureContentLinkable({ contentType: "unlimit", raidInfo: { raidType: "unlimit" } })).toBe(false);
    expect(isFutureContentLinkable({ contentType: "total_assault", raidInfo: { raidType: "total_assault" } })).toBe(
      true,
    );
  });

  it("links raids to their season and falls back to the raid list", () => {
    expect(
      getFutureContentLink({ contentType: "raid", uid: "r1", raidInfo: { raidType: "total_assault", seasonIndex: 3 } }),
    ).toBe("/raids/total-assault/3");
    expect(getFutureContentLink({ contentType: "raid", uid: "r1", raidInfo: { raidType: "total_assault" } })).toBe(
      "/raids",
    );
    expect(getFutureContentLink({ contentType: "event", uid: "e1" })).toBe("/events/e1");
  });

  it("matches the raid type before the content type and requires a pickup for the pickup-only switch", () => {
    const raid = { contentType: "raid" as const, raidInfo: { raidType: "elimination" as const }, recruitments: [] };
    expect(matchesContentFilter(raid, { types: ["elimination"], onlyPickups: false })).toBe(true);
    expect(matchesContentFilter(raid, { types: ["total_assault"], onlyPickups: false })).toBe(false);

    const noPickup = { contentType: "event" as const, recruitments: [{ pickup: false }] };
    expect(matchesContentFilter(noPickup, { types: [], onlyPickups: true })).toBe(false);
    expect(isContentFilterActive({ types: [], onlyPickups: false })).toBe(false);
    expect(isContentFilterActive({ types: [], onlyPickups: true })).toBe(true);
  });

  it("withholds the count when the list failed to load", () => {
    expect(getFilterSummary({ total: null, shown: 0, active: false })).toBeNull();
    expect(getFilterSummary({ total: 28, shown: 28, active: false })).toEqual({ kind: "all", total: 28 });
    expect(getFilterSummary({ total: 28, shown: 5, active: true })).toEqual({ kind: "filtered", total: 28, shown: 5 });
  });
});

describe("getFutureSpecialCases", () => {
  it("reports the free-100 benefit only while every recruitment is still open", () => {
    const base = {
      contentType: "event" as const,
      tags: ["recruit_free_100"],
      recruitmentGroupUid: null,
      recruitmentPeriod: null,
      since: "2026-11-17T00:00:00.000Z",
      until: "2026-12-01T00:00:00.000Z",
      endless: false,
      now,
      timeZone,
    };
    expect(getFutureSpecialCases({ ...base, recruitments: [{ until: "2026-12-01T00:00:00.000Z" }] })).toEqual([
      { kind: "perk-free-100" },
    ]);
    expect(getFutureSpecialCases({ ...base, recruitments: [{ until: null }] })).toEqual([]);
  });

  it("shows the period caution with its range when the recruitment period differs", () => {
    const cases = getFutureSpecialCases({
      contentType: "event",
      tags: [],
      recruitments: [],
      recruitmentGroupUid: "group-1",
      recruitmentPeriod: { startAt: "2026-11-17T00:00:00.000Z", endAt: "2026-11-24T00:00:00.000Z" },
      since: "2026-11-17T00:00:00.000Z",
      until: "2026-12-01T00:00:00.000Z",
      endless: false,
      now,
      timeZone,
    });
    expect(cases).toEqual([{ kind: "caution-period", range: "11/17 ~ 11/24" }]);
  });

  it("shows the ended caution once the recruitment period has closed", () => {
    const cases = getFutureSpecialCases({
      contentType: "event",
      tags: [],
      recruitments: [],
      recruitmentGroupUid: "group-1",
      recruitmentPeriod: { startAt: "2026-09-01T00:00:00.000Z", endAt: "2026-09-10T00:00:00.000Z" },
      since: "2026-11-17T00:00:00.000Z",
      until: "2026-12-01T00:00:00.000Z",
      endless: false,
      now,
      timeZone,
    });
    expect(cases).toEqual([{ kind: "caution-ended" }]);
    expect(getCautionText(cases[0])).toBe("모집 종료");
  });

  it("adds no case for a fes content, since no restriction notice is shown", () => {
    const cases = getFutureSpecialCases({
      contentType: "fes",
      tags: [],
      recruitments: [],
      recruitmentGroupUid: null,
      recruitmentPeriod: null,
      since: "2026-11-17T00:00:00.000Z",
      until: null,
      endless: true,
      now,
      timeZone,
    });
    expect(cases).toEqual([]);
  });

  it("words the period caution with its range, and has no caution text for a perk", () => {
    expect(getCautionText({ kind: "caution-period", range: "11/17 ~ 11/24" })).toBe("모집 기간 · 11/17 ~ 11/24");
    expect(getCautionText({ kind: "perk-free-100" })).toBeNull();
  });
});

describe("formatContentPeriod", () => {
  const since = "2026-10-27T00:00:00.000Z";

  it("reads a dated range as one period rule for the timeline and the list", () => {
    expect(
      formatContentPeriod({ since, until: "2026-11-10T00:00:00.000Z", endless: false, contentType: "event", timeZone }),
    ).toBe("10/27 ~ 11/10");
  });

  it("reads an open-ended start by content type", () => {
    expect(formatContentPeriod({ since, until: null, endless: false, contentType: "event", timeZone })).toBe(
      "10/27부터",
    );
    expect(formatContentPeriod({ since, until: null, endless: true, contentType: "main_story", timeZone })).toBe(
      "10/27 공개",
    );
  });
});

describe("dates and remaining time", () => {
  it("labels the current day as 오늘 and other days as N일 후 with the weekday", () => {
    expect(getDayDividerParts("2026-10-15T00:00:00.000Z", now, timeZone)).toEqual({
      dateText: "10/15 (목)",
      relativeText: "오늘",
    });
    expect(getDayDividerParts("2026-10-20T00:00:00.000Z", now, timeZone)).toEqual({
      dateText: "10/20 (화)",
      relativeText: "5일 후",
    });
  });

  it("reports days for two or more days, tomorrow for one, and hours with the soon flag under a day", () => {
    expect(getRemainingTime("2026-10-27T00:00:00.000Z", now, timeZone)).toEqual({
      kind: "days",
      days: 12,
      soon: false,
    });
    expect(getRemainingTime("2026-10-16T00:00:00.000Z", now, timeZone)).toEqual({ kind: "tomorrow", soon: false });
    expect(getRemainingTime("2026-10-15T10:00:00.000Z", now, timeZone)).toEqual({
      kind: "hours",
      hours: 7,
      soon: true,
    });
  });
});

describe("isNewRecruitment", () => {
  const types = Object.values(RecruitmentTypeEnum);

  it("agrees with the recruitment label for every type and rerun flag", () => {
    for (const recruitmentType of types) {
      for (const rerun of [false, true]) {
        const label = recruitmentLabelLocale({ recruitmentType, rerun });
        expect([recruitmentType, rerun, isNewRecruitment({ recruitmentType, rerun })]).toEqual([
          recruitmentType,
          rerun,
          label.includes("신규"),
        ]);
      }
    }
  });
});

describe("open-ended start labels", () => {
  it("labels story releases as a release date and other open-ended content as a start", () => {
    expect(isStoryContentType("main_story")).toBe(true);
    expect(isStoryContentType("mini_story")).toBe(true);
    expect(isStoryContentType("event")).toBe(false);
    expect(formatOpenEndedStart("05/13", "main_story")).toBe("05/13 공개");
    expect(formatOpenEndedStart("05/13", "mini_story")).toBe("05/13 공개");
    expect(formatOpenEndedStart("05/13", "event")).toBe("05/13부터");
  });
});

describe("students", () => {
  it("lists pickup students first and shows at most three faces with the rest as +N", () => {
    const stack = getFaceStack([
      { id: "a", pickup: false },
      { id: "b", pickup: true },
      { id: "c", pickup: false },
      { id: "d", pickup: true },
      { id: "e", pickup: false },
    ]);
    expect(stack.shown.map((item) => item.id)).toEqual(["b", "d", "a"]);
    expect(stack.extra).toBe(2);
  });

  it("groups recruitments by their own period in first-seen order", () => {
    const groups = groupRecruitmentsByPeriod(
      [
        { id: "a", since: "2026-11-17T00:00:00.000Z", until: "2026-11-24T00:00:00.000Z" },
        { id: "b", since: "2026-11-24T00:00:00.000Z", until: null },
        { id: "c", since: "2026-11-17T00:00:00.000Z", until: "2026-11-24T00:00:00.000Z" },
      ],
      timeZone,
    );
    expect(groups.map((group) => group.recruitments.map((item) => item.id))).toEqual([["a", "c"], ["b"]]);
  });

  it("picks the earliest upcoming pickup for the analysis banner and the first pending student", () => {
    const key = getFutureFavoriteKeyForStudentAnalysis(
      [
        { pickup: true, since: "2026-11-01T00:00:00.000Z", favoriteKey: "late", student: "s1" },
        { pickup: true, since: "2026-10-20T00:00:00.000Z", favoriteKey: "early", student: "s2" },
        { pickup: true, since: "2026-10-01T00:00:00.000Z", favoriteKey: "past", student: "s3" },
      ],
      now,
    );
    expect(key).toBe("early");
    expect(
      getFuturePendingStudentFavoriteKey([
        { student: "s1", favoriteKey: "known" },
        { student: null, favoriteKey: "pending" },
      ]),
    ).toBe("pending");
  });
});
