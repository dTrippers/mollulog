import { describe, expect, it } from "@jest/globals";
import {
  getRecruitmentPeriodNotice,
  type RecruitmentPeriod,
  type RecruitmentPeriodNoticeContent,
} from "~/domain/recruitment-period-notice";

const now = "2026-09-07T00:00:00.000Z";

function content(overrides: Partial<RecruitmentPeriodNoticeContent> = {}): RecruitmentPeriodNoticeContent {
  return {
    recruitmentGroupUid: "group-a",
    contentType: "event",
    startAt: "2026-09-10T00:00:00.000Z",
    endAt: "2026-09-20T00:00:00.000Z",
    endless: false,
    ...overrides,
  };
}

function period(overrides: Partial<RecruitmentPeriod> = {}): RecruitmentPeriod {
  return {
    startAt: "2026-09-10T00:00:00.000Z",
    endAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("getRecruitmentPeriodNotice", () => {
  it("compares exact instants rather than timestamp formatting", () => {
    expect(
      getRecruitmentPeriodNotice(
        content({ startAt: "2026-09-10T09:00:00+09:00", endAt: "2026-09-20T09:00:00+09:00" }),
        period(),
        now,
      ),
    ).toBeNull();
  });

  it("notices a content start instant mismatch before recruitment ends", () => {
    expect(getRecruitmentPeriodNotice(content({ startAt: "2026-09-11T00:00:00.000Z" }), period(), now)).toBe(
      "이벤트 기간과 모집 개최 기간이 달라요",
    );
  });

  it("uses the general wording for a non-event content end mismatch", () => {
    expect(
      getRecruitmentPeriodNotice(
        content({ contentType: "main_story", endAt: "2026-09-21T00:00:00.000Z" }),
        period(),
        now,
      ),
    ).toBe("컨텐츠 기간과 모집 개최 기간이 달라요");
  });

  it("uses the ended wording at and after a finite recruitment end", () => {
    const mismatched = content({ startAt: "2026-09-11T00:00:00.000Z" });

    expect(getRecruitmentPeriodNotice(mismatched, period(), "2026-09-20T00:00:00.000Z")).toBe(
      "학생 모집은 종료되었어요",
    );
    expect(getRecruitmentPeriodNotice(mismatched, period(), "2026-09-21T00:00:00.000Z")).toBe(
      "학생 모집은 종료되었어요",
    );
  });

  it.each([
    ["no recruitment group uid", content({ recruitmentGroupUid: null }), period()],
    ["missing recruitment group", content(), null],
    ["recruitment without an end", content({ startAt: "2026-09-11T00:00:00.000Z" }), period({ endAt: null })],
    ["content without an end", content({ endAt: null }), period({ endAt: null })],
    ["endless content", content({ endless: true }), period({ startAt: "2026-09-11T00:00:00.000Z" })],
    ["matching period", content(), period()],
  ])("does not notice %s", (_label, input, recruitmentPeriod) => {
    expect(getRecruitmentPeriodNotice(input, recruitmentPeriod, now)).toBeNull();
  });

  it.each([
    "pray-ball-rerun",
    "hyakuyori-izuru-ichirinnno-rerun",
    "pandemonium-cruise",
  ])("notices the approved future fixture %s", (_uid) => {
    expect(
      getRecruitmentPeriodNotice(
        content({ startAt: "2026-09-08T00:00:00.000Z" }),
        period({ startAt: "2026-09-09T00:00:00.000Z" }),
        now,
      ),
    ).toBe("이벤트 기간과 모집 개최 기간이 달라요");
  });

  it.each([
    "hatsune-miku",
    "code-box",
    "natsuzora-no-yakusoku",
    "art-for-someone",
  ])("uses the ended wording for the approved historical fixture %s", (_uid) => {
    expect(
      getRecruitmentPeriodNotice(
        content({ startAt: "2025-09-08T00:00:00.000Z", endAt: "2025-09-20T00:00:00.000Z" }),
        period({ startAt: "2025-09-09T00:00:00.000Z", endAt: "2025-09-19T00:00:00.000Z" }),
        now,
      ),
    ).toBe("학생 모집은 종료되었어요");
  });

  it("does not notice the approved endless archive fixture", () => {
    expect(
      getRecruitmentPeriodNotice(
        content({ endless: true, startAt: "2025-09-01T00:00:00.000Z", endAt: "2025-09-30T00:00:00.000Z" }),
        period({ startAt: "2025-09-02T00:00:00.000Z", endAt: null }),
        now,
      ),
    ).toBeNull();
  });
});
