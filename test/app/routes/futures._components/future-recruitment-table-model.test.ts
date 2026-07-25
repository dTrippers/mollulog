import { describe, expect, it } from "@jest/globals";
import { RecruitmentTypeEnum, Terrain } from "~/graphql/graphql";
import {
  buildFutureRecruitmentTableRows,
  type FutureRecruitmentTableContent,
  formatAuxiliaryContentPeriodLabel,
  isFutureRecruitmentTableContentLinkable,
  isFutureRecruitmentTableContentVisible,
} from "~/routes/futures._components/future-recruitment-table-model";

function content(
  overrides: Partial<FutureRecruitmentTableContent> &
    Pick<FutureRecruitmentTableContent, "uid" | "name" | "startAt" | "endAt">,
): FutureRecruitmentTableContent {
  return {
    uid: overrides.uid,
    name: overrides.name,
    startAt: overrides.startAt,
    endAt: overrides.endAt,
    endless: overrides.endless ?? false,
    contentType: overrides.contentType ?? "event",
    runType: overrides.runType ?? "first",
    confirmed: overrides.confirmed ?? false,
    isSpoiler: overrides.isSpoiler ?? false,
    tags: overrides.tags ?? [],
    recruitments: overrides.recruitments ?? [],
    raidInfo: overrides.raidInfo,
  };
}

function recruitment(
  overrides: Partial<FutureRecruitmentTableContent["recruitments"][number]> & {
    studentName: string;
    since: string;
    until: string | null;
  },
): FutureRecruitmentTableContent["recruitments"][number] {
  return {
    recruitmentType: overrides.recruitmentType ?? RecruitmentTypeEnum.Usual,
    pickup: overrides.pickup ?? true,
    rerun: overrides.rerun ?? false,
    studentName: overrides.studentName,
    favoriteKey: overrides.favoriteKey ?? overrides.student?.uid ?? `provisional:${overrides.studentName}`,
    since: overrides.since,
    until: overrides.until,
    student: overrides.student ?? null,
  };
}

describe("buildFutureRecruitmentTableRows", () => {
  it("groups overlapping recruitments by their own recruitment periods", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "content-a",
        name: "A 이벤트",
        startAt: "2026-05-12T02:00:00.000Z",
        endAt: "2026-05-26T02:00:00.000Z",
        recruitments: [
          recruitment({
            studentName: "학생 A",
            since: "2026-05-12T02:00:00.000Z",
            until: "2026-05-26T02:00:00.000Z",
          }),
        ],
      }),
      content({
        uid: "content-b",
        name: "리콜렉트",
        startAt: "2026-05-19T02:00:00.000Z",
        endAt: "2026-06-02T02:00:00.000Z",
        recruitments: [
          recruitment({
            recruitmentType: RecruitmentTypeEnum.Recollect,
            studentName: "학생 B",
            since: "2026-05-19T02:00:00.000Z",
            until: "2026-06-02T02:00:00.000Z",
          }),
        ],
      }),
    ]);

    expect(rows.map((row) => [row.since, row.until])).toEqual([
      ["2026-05-12T00:00:00.000Z", "2026-05-26T00:00:00.000Z"],
      ["2026-05-19T00:00:00.000Z", "2026-06-02T00:00:00.000Z"],
    ]);
    expect(rows.map((row) => row.recruitments.map((group) => group.recruitment.studentName))).toEqual([
      ["학생 A"],
      ["학생 B"],
    ]);
  });

  it("uses timeline content dates for endless content recruitments", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "archive-content",
        name: "상설 모집",
        startAt: "2026-07-01T02:00:00.000Z",
        endAt: "2026-07-08T02:00:00.000Z",
        endless: true,
        recruitments: [
          recruitment({
            recruitmentType: RecruitmentTypeEnum.Archive,
            studentName: "아카이브 학생",
            since: "2026-07-01T02:00:00.000Z",
            until: null,
          }),
        ],
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].since).toBe("2026-07-01T00:00:00.000Z");
    expect(rows[0].until).toBe("2026-07-08T00:00:00.000Z");
    expect(rows[0].recruitments[0].recruitment.studentName).toBe("아카이브 학생");
  });

  it("uses recruitment dates for archive recruitments when the content is not endless", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "archive-but-limited",
        name: "아카이브 타입이지만 기간 모집",
        startAt: "2026-08-01T02:00:00.000Z",
        endAt: "2026-08-08T02:00:00.000Z",
        endless: false,
        recruitments: [
          recruitment({
            recruitmentType: RecruitmentTypeEnum.Archive,
            studentName: "기간 아카이브 학생",
            since: "2026-08-03T02:00:00.000Z",
            until: "2026-08-10T02:00:00.000Z",
          }),
        ],
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].since).toBe("2026-08-03T00:00:00.000Z");
    expect(rows[0].until).toBe("2026-08-10T00:00:00.000Z");
  });

  it("uses recruitment dates when they differ from the timeline content period", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "fes-content",
        name: "페스 모집",
        startAt: "2026-06-09T02:00:00.000Z",
        endAt: "2026-06-16T02:00:00.000Z",
        contentType: "fes",
        recruitments: [
          recruitment({
            recruitmentType: RecruitmentTypeEnum.Fes,
            studentName: "페스 학생",
            since: "2026-06-02T02:00:00.000Z",
            until: "2026-06-16T02:00:00.000Z",
          }),
        ],
      }),
    ]);

    expect(rows.map((row) => [row.since, row.until])).toEqual([
      ["2026-06-02T00:00:00.000Z", "2026-06-16T00:00:00.000Z"],
    ]);
    expect(rows[0].events.map((item) => item.name)).toEqual(["페스 모집"]);
  });

  it("does not keep showing an event recruitment after the recruitment ends", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "event-with-shorter-recruitment",
        name: "이벤트보다 짧은 모집",
        startAt: "2026-10-13T02:00:00.000Z",
        endAt: "2026-10-27T02:00:00.000Z",
        contentType: "event",
        recruitments: [
          recruitment({
            studentName: "나구사",
            since: "2026-10-13T02:00:00.000Z",
            until: "2026-10-20T02:00:00.000Z",
          }),
        ],
      }),
    ]);

    expect(rows.map((row) => [row.since, row.until])).toEqual([
      ["2026-10-13T00:00:00.000Z", "2026-10-20T00:00:00.000Z"],
    ]);
    expect(rows[0].recruitments.map((group) => group.recruitment.studentName)).toEqual(["나구사"]);
  });

  it("groups simultaneous recruitments by their shared start date even when they have different end dates", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "long-recruitment",
        name: "2주 모집",
        startAt: "2026-11-10T02:00:00.000Z",
        endAt: "2026-11-24T02:00:00.000Z",
        contentType: "event",
        recruitments: [
          recruitment({
            studentName: "히카리",
            since: "2026-11-10T02:00:00.000Z",
            until: "2026-11-24T02:00:00.000Z",
          }),
        ],
      }),
      content({
        uid: "short-recruitment",
        name: "1주 모집",
        startAt: "2026-11-10T02:00:00.000Z",
        endAt: "2026-11-24T02:00:00.000Z",
        contentType: "event",
        recruitments: [
          recruitment({
            studentName: "사오리",
            since: "2026-11-10T02:00:00.000Z",
            until: "2026-11-17T02:00:00.000Z",
          }),
        ],
      }),
    ]);

    expect(rows.map((row) => [row.since, row.until])).toEqual([
      ["2026-11-10T00:00:00.000Z", "2026-11-24T00:00:00.000Z"],
    ]);
    expect(rows[0].recruitments.map((group) => group.recruitment.studentName)).toEqual(["히카리", "사오리"]);
    expect(rows[0].recruitments.map((group) => group.until)).toEqual([
      "2026-11-24T02:00:00.000Z",
      "2026-11-17T02:00:00.000Z",
    ]);
  });

  it("uses the display timezone midnight for row boundary instants", () => {
    const rows = buildFutureRecruitmentTableRows(
      [
        content({
          uid: "pst-content",
          name: "PST 모집",
          startAt: "2026-05-12T02:00:00.000Z",
          endAt: "2026-05-19T02:00:00.000Z",
          recruitments: [
            recruitment({
              studentName: "학생",
              since: "2026-05-12T02:00:00.000Z",
              until: "2026-05-19T02:00:00.000Z",
            }),
          ],
        }),
      ],
      "America/Los_Angeles",
    );

    expect(rows.map((row) => [row.since, row.until])).toEqual([
      ["2026-05-11T07:00:00.000Z", "2026-05-18T07:00:00.000Z"],
    ]);
  });

  it("keeps long recruitment content in one row when a later week has auxiliary contents", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "two-week-pickup",
        name: "2주 모집",
        startAt: "2026-05-26T02:00:00.000Z",
        endAt: "2026-06-09T02:00:00.000Z",
        contentType: "event",
        recruitments: [
          recruitment({
            studentName: "학생",
            since: "2026-05-26T02:00:00.000Z",
            until: "2026-06-09T02:00:00.000Z",
          }),
        ],
      }),
      content({
        uid: "second-week-content",
        name: "2주차 컨텐츠",
        startAt: "2026-06-02T02:00:00.000Z",
        endAt: "2026-06-09T02:00:00.000Z",
        contentType: "event",
      }),
    ]);

    expect(rows.map((row) => [row.since, row.until])).toEqual([
      ["2026-05-26T00:00:00.000Z", "2026-06-09T00:00:00.000Z"],
    ]);
    expect(rows[0].events.map((item) => item.name)).toEqual(["2주 모집", "2주차 컨텐츠"]);
  });

  it("folds empty continuation rows into the previous visible row period", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "two-week-pickup",
        name: "2주 모집",
        startAt: "2026-05-26T02:00:00.000Z",
        endAt: "2026-06-09T02:00:00.000Z",
        contentType: "event",
        recruitments: [
          recruitment({
            studentName: "학생",
            since: "2026-05-26T02:00:00.000Z",
            until: "2026-06-09T02:00:00.000Z",
          }),
        ],
      }),
    ]);

    expect(rows.map((row) => [row.since, row.until])).toEqual([
      ["2026-05-26T00:00:00.000Z", "2026-06-09T00:00:00.000Z"],
    ]);
    expect(rows[0].recruitmentRowSpan).toBe(1);
  });

  it("marks visible consecutive rows with the same recruitment set for merged desktop cells", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "two-week-pickup",
        name: "2주 모집",
        startAt: "2026-05-26T02:00:00.000Z",
        endAt: "2026-06-09T02:00:00.000Z",
        contentType: "event",
        recruitments: [
          recruitment({
            studentName: "학생",
            since: "2026-05-26T02:00:00.000Z",
            until: "2026-06-09T02:00:00.000Z",
          }),
        ],
      }),
      content({
        uid: "second-week-content",
        name: "2주차 컨텐츠",
        startAt: "2026-06-02T02:00:00.000Z",
        endAt: "2026-06-09T02:00:00.000Z",
        contentType: "event",
      }),
    ]);

    expect(rows.map((row) => [row.hideRecruitmentCell, row.recruitmentRowSpan])).toEqual([[false, 1]]);
  });

  it("does not create rows from auxiliary-only contents", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "event-content",
        name: "모집 없는 이벤트",
        startAt: "2026-05-26T02:00:00.000Z",
        endAt: "2026-06-09T02:00:00.000Z",
        contentType: "event",
      }),
    ]);

    expect(rows).toEqual([]);
  });

  it("places non-recruitment contents in auxiliary columns when they overlap a recruitment period", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "pickup-content",
        name: "픽업",
        startAt: "2026-09-01T02:00:00.000Z",
        endAt: "2026-09-08T02:00:00.000Z",
        contentType: "pickup",
        recruitments: [
          recruitment({
            studentName: "학생",
            since: "2026-09-01T02:00:00.000Z",
            until: "2026-09-08T02:00:00.000Z",
          }),
        ],
      }),
      content({
        uid: "event-content",
        name: "이벤트",
        startAt: "2026-09-03T02:00:00.000Z",
        endAt: "2026-09-10T02:00:00.000Z",
        contentType: "event",
      }),
      content({
        uid: "raid-content",
        name: "총력전",
        startAt: "2026-09-04T02:00:00.000Z",
        endAt: "2026-09-11T02:00:00.000Z",
        contentType: "raid",
        raidInfo: {
          raidType: "total_assault",
          boss: "binah",
          name: "비나",
          terrain: Terrain.Indoor,
          attackType: null,
          defenseTypes: [],
        },
      }),
      content({
        uid: "campaign-content",
        name: "캠페인",
        startAt: "2026-09-05T02:00:00.000Z",
        endAt: "2026-09-12T02:00:00.000Z",
        contentType: "campaign",
      }),
      content({
        uid: "live-content",
        name: "공식 방송",
        startAt: "2026-09-06T06:00:00.000Z",
        endAt: "2026-09-07T14:59:59.000Z",
        contentType: "live",
        endless: true,
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].events.map((item) => item.name)).toEqual(["이벤트"]);
    expect(rows[0].raids.map((item) => item.name)).toEqual(["총력전"]);
    expect(rows[0].campaigns.map((item) => item.name)).toEqual(["캠페인"]);
    expect([...rows[0].events, ...rows[0].raids, ...rows[0].campaigns]).not.toContainEqual(
      expect.objectContaining({ uid: "live-content" }),
    );
  });

  it("places the recruitment owner content in auxiliary columns", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "event-with-pickup",
        name: "픽업이 있는 이벤트",
        startAt: "2026-09-01T02:00:00.000Z",
        endAt: "2026-09-08T02:00:00.000Z",
        contentType: "event",
        recruitments: [
          recruitment({
            studentName: "픽업 학생",
            since: "2026-09-01T02:00:00.000Z",
            until: "2026-09-08T02:00:00.000Z",
          }),
        ],
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].events.map((item) => item.name)).toEqual(["픽업이 있는 이벤트"]);
  });

  it("shows multi-period auxiliary contents only in their first overlapping row", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "pickup-a",
        name: "첫 모집",
        startAt: "2026-09-01T02:00:00.000Z",
        endAt: "2026-09-08T02:00:00.000Z",
        contentType: "pickup",
        recruitments: [
          recruitment({
            studentName: "학생 A",
            since: "2026-09-01T02:00:00.000Z",
            until: "2026-09-08T02:00:00.000Z",
          }),
        ],
      }),
      content({
        uid: "pickup-b",
        name: "다음 모집",
        startAt: "2026-09-08T02:00:00.000Z",
        endAt: "2026-09-15T02:00:00.000Z",
        contentType: "pickup",
        recruitments: [
          recruitment({
            studentName: "학생 B",
            since: "2026-09-08T02:00:00.000Z",
            until: "2026-09-15T02:00:00.000Z",
          }),
        ],
      }),
      content({
        uid: "long-event",
        name: "장기 이벤트",
        startAt: "2026-09-01T02:00:00.000Z",
        endAt: "2026-09-15T02:00:00.000Z",
        contentType: "event",
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].events.map((item) => item.name)).toEqual(["장기 이벤트"]);
    expect(rows[1].events).toEqual([]);
  });

  it("does not show auxiliary contents that started before the overlapping row", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "pickup-content",
        name: "모집",
        startAt: "2026-09-08T02:00:00.000Z",
        endAt: "2026-09-15T02:00:00.000Z",
        contentType: "pickup",
        recruitments: [
          recruitment({
            studentName: "학생",
            since: "2026-09-08T02:00:00.000Z",
            until: "2026-09-15T02:00:00.000Z",
          }),
        ],
      }),
      content({
        uid: "already-started-event",
        name: "이미 시작한 이벤트",
        startAt: "2026-09-01T02:00:00.000Z",
        endAt: "2026-09-15T02:00:00.000Z",
        contentType: "event",
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].events).toEqual([]);
  });

  it("keeps recruitment student order aligned with timeline content and recruitment order", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "pickup-content",
        name: "픽업",
        startAt: "2026-09-01T02:00:00.000Z",
        endAt: "2026-09-08T02:00:00.000Z",
        contentType: "pickup",
        recruitments: [
          recruitment({
            studentName: "학생 Z",
            since: "2026-09-01T02:00:00.000Z",
            until: "2026-09-08T02:00:00.000Z",
          }),
          recruitment({
            studentName: "학생 A",
            since: "2026-09-01T02:00:00.000Z",
            until: "2026-09-08T02:00:00.000Z",
          }),
        ],
      }),
    ]);

    expect(rows[0].recruitments.map((group) => group.recruitment.studentName)).toEqual(["학생 Z", "학생 A"]);
  });

  it("uses the already-filtered contents passed by the route", () => {
    const rows = buildFutureRecruitmentTableRows([
      content({
        uid: "remaining-content",
        name: "남은 모집",
        startAt: "2026-10-01T02:00:00.000Z",
        endAt: "2026-10-08T02:00:00.000Z",
        recruitments: [
          recruitment({
            studentName: "남은 학생",
            since: "2026-10-01T02:00:00.000Z",
            until: "2026-10-08T02:00:00.000Z",
          }),
        ],
      }),
    ]);

    expect(rows.map((row) => row.recruitments.map((group) => group.content.uid))).toEqual([["remaining-content"]]);
  });
});

describe("isFutureRecruitmentTableContentLinkable", () => {
  it("matches timeline link rules for content types and raid types", () => {
    expect(
      isFutureRecruitmentTableContentLinkable(
        content({
          uid: "event-content",
          name: "이벤트",
          startAt: "2026-05-12T02:00:00.000Z",
          endAt: "2026-05-19T02:00:00.000Z",
          contentType: "event",
        }),
        false,
      ),
    ).toBe(true);
    expect(
      isFutureRecruitmentTableContentLinkable(
        content({
          uid: "allied-content",
          name: "연합작전",
          startAt: "2026-05-12T02:00:00.000Z",
          endAt: "2026-05-19T02:00:00.000Z",
          contentType: "allied",
        }),
        false,
      ),
    ).toBe(false);
    expect(
      isFutureRecruitmentTableContentLinkable(
        content({
          uid: "total-assault-content",
          name: "총력전",
          startAt: "2026-05-12T02:00:00.000Z",
          endAt: "2026-05-19T02:00:00.000Z",
          contentType: "raid",
          raidInfo: {
            raidType: "total_assault",
            boss: "binah",
            name: "비나",
            terrain: Terrain.Indoor,
            attackType: null,
            defenseTypes: [],
          },
        }),
        false,
      ),
    ).toBe(true);
    expect(
      isFutureRecruitmentTableContentLinkable(
        content({
          uid: "allied-raid-content",
          name: "연합작전",
          startAt: "2026-05-12T02:00:00.000Z",
          endAt: "2026-05-19T02:00:00.000Z",
          contentType: "raid",
          raidInfo: {
            raidType: "allied",
            boss: "decagrammaton",
            name: "데카그라마톤",
            terrain: Terrain.Indoor,
            attackType: null,
            defenseTypes: [],
          },
        }),
        false,
      ),
    ).toBe(false);
  });

  it("does not link hidden spoiler contents", () => {
    expect(
      isFutureRecruitmentTableContentLinkable(
        content({
          uid: "spoiler-event",
          name: "스포일러 이벤트",
          startAt: "2026-05-12T02:00:00.000Z",
          endAt: "2026-05-19T02:00:00.000Z",
          contentType: "event",
          isSpoiler: true,
        }),
        false,
      ),
    ).toBe(false);
    expect(
      isFutureRecruitmentTableContentLinkable(
        content({
          uid: "spoiler-event",
          name: "스포일러 이벤트",
          startAt: "2026-05-12T02:00:00.000Z",
          endAt: "2026-05-19T02:00:00.000Z",
          contentType: "event",
          isSpoiler: true,
        }),
        true,
      ),
    ).toBe(true);
  });
});

describe("isFutureRecruitmentTableContentVisible", () => {
  it("hides unrevealed spoiler contents", () => {
    expect(
      isFutureRecruitmentTableContentVisible(
        content({
          uid: "spoiler-event",
          name: "스포일러 이벤트",
          startAt: "2026-05-12T02:00:00.000Z",
          endAt: "2026-05-19T02:00:00.000Z",
          contentType: "event",
          isSpoiler: true,
        }),
        false,
      ),
    ).toBe(false);
    expect(
      isFutureRecruitmentTableContentVisible(
        content({
          uid: "spoiler-event",
          name: "스포일러 이벤트",
          startAt: "2026-05-12T02:00:00.000Z",
          endAt: "2026-05-19T02:00:00.000Z",
          contentType: "event",
          isSpoiler: true,
        }),
        true,
      ),
    ).toBe(true);
  });
});

describe("formatAuxiliaryContentPeriodLabel", () => {
  it("hides the period when the content date range matches the row date range", () => {
    expect(
      formatAuxiliaryContentPeriodLabel({
        contentStartAt: "2026-05-12T02:00:00.000Z",
        contentEndAt: "2026-05-19T02:00:00.000Z",
        contentEndless: false,
        rowSince: "2026-05-12T00:00:00.000Z",
        rowUntil: "2026-05-19T00:00:00.000Z",
        timeZone: "UTC",
      }),
    ).toBeNull();
  });

  it("shows date and time when the content date range differs from the row date range", () => {
    expect(
      formatAuxiliaryContentPeriodLabel({
        contentStartAt: "2026-05-12T02:00:00.000Z",
        contentEndAt: "2026-05-26T02:00:00.000Z",
        contentEndless: false,
        rowSince: "2026-05-12T00:00:00.000Z",
        rowUntil: "2026-05-19T00:00:00.000Z",
        timeZone: "UTC",
      }),
    ).toBe("05/12 02:00 ~ 05/26 02:00");
  });

  it("hides the end date for endless content", () => {
    expect(
      formatAuxiliaryContentPeriodLabel({
        contentStartAt: "2026-05-13T02:00:00.000Z",
        contentEndAt: "2026-05-26T02:00:00.000Z",
        contentEndless: true,
        rowSince: "2026-05-12T00:00:00.000Z",
        rowUntil: "2026-05-19T00:00:00.000Z",
        timeZone: "UTC",
      }),
    ).toBe("05/13 02:00");
  });

  it("hides the period for endless content when it starts on the row date", () => {
    expect(
      formatAuxiliaryContentPeriodLabel({
        contentStartAt: "2026-05-12T02:00:00.000Z",
        contentEndAt: "2026-05-26T02:00:00.000Z",
        contentEndless: true,
        rowSince: "2026-05-12T00:00:00.000Z",
        rowUntil: "2026-05-19T00:00:00.000Z",
        timeZone: "UTC",
      }),
    ).toBeNull();
  });
});
