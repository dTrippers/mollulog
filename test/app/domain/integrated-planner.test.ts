import {
  buildPlannerMonthDays,
  buildPlannerPeriods,
  buildPlannerRecruitmentCandidatesForDate,
  buildPublicPlannerPeriods,
  formatPlannerPeriodEndDate,
  getPlannerMonthEndInstant,
  getPlannerTodayMonth,
  type PlannerPeriod,
  shiftPlannerMonth,
  splitPlannerPeriodsForWeek,
  summarizePyroxeneTimeline,
} from "~/domain/integrated-planner";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import dayjs from "~/lib/dayjs";

describe("integrated planner calendar domain", () => {
  test("builds Monday-first month rows with surrounding civil dates", () => {
    const weeks = buildPlannerMonthDays("2026-09");

    expect(weeks[0].map((day) => day.dateKey)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(weeks.at(-1)?.at(-1)).toEqual({ dateKey: "2026-10-04", inMonth: false });
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  test("moves between months across year boundaries", () => {
    expect(shiftPlannerMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftPlannerMonth("2026-01", -1)).toBe("2025-12");
  });

  test("maps a period ending exactly at local midnight to the previous civil day", () => {
    expect(formatPlannerPeriodEndDate("2026-09-10T15:00:00.000Z", "Asia/Seoul")).toBe("2026-09-10");
    expect(formatPlannerPeriodEndDate("2026-09-10T14:59:59.999Z", "Asia/Seoul")).toBe("2026-09-10");
  });

  test("chooses the initial month in the supplied display timezone", () => {
    expect(getPlannerTodayMonth("2026-09-01T00:30:00.000Z", "America/Los_Angeles")).toBe("2026-08");
  });

  test("sets the forecast horizon to the visible month's last instant in its display timezone", () => {
    expect(getPlannerMonthEndInstant("2026-09", "Asia/Seoul").toISOString()).toBe("2026-09-30T14:59:59.999Z");
  });

  test("keeps event, recruitment, and shop ranges distinct and starts recruitment on its own first day", () => {
    const periods = buildPlannerPeriods({
      contents: [
        {
          kind: "event",
          uid: "event-1",
          name: "실제 이벤트명",
          since: "2026-09-01T00:00:00.000Z",
          until: "2026-09-10T15:00:00.000Z",
          recruitmentGroupUid: "group-1",
          recruitments: [
            {
              until: "2026-09-04T15:00:00.000Z",
              student: { uid: "student-1", imageUid: "student-1", name: "학생 하나" },
            },
          ],
        },
      ],
      scheduleItems: [
        {
          event: {
            uid: "event-1",
            name: "실제 이벤트명",
            since: "2026-09-02T15:00:00.000Z",
            until: "2026-09-05T14:59:00.000Z",
            earnablePyroxene: null,
            tags: [],
            recruitments: [
              {
                recruitmentType: "usual",
                pickup: true,
                rerun: false,
                until: "2026-09-04T15:00:00.000Z",
                student: { uid: "student-1", imageUid: "student-1", name: "학생 하나", initialTier: 3 },
                favorited: true,
              },
            ],
          },
        },
      ] satisfies PyroxeneScheduleItem[],
      favorites: [{ contentUid: "event-1", studentUid: "student-1" }],
      eventTrials: [{ eventUid: "event-1", expectedTrials: 100 }],
      eventRewardUids: [],
      shopPeriods: [
        {
          timelineUid: "event-1",
          name: "실제 이벤트명",
          startAt: "2026-09-03T15:00:00.000Z",
          endAt: "2026-09-08T14:59:00.000Z",
          planned: true,
        },
      ],
      timeZone: "Asia/Seoul",
    });

    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "event",
          name: "실제 이벤트명",
          startDate: "2026-09-01",
          endDate: "2026-09-10",
        }),
        expect.objectContaining({
          kind: "recruitment",
          name: "실제 이벤트명",
          startDate: "2026-09-03",
          endDate: "2026-09-04",
          expectedTrials: 100,
          students: [{ uid: "student-1", imageUid: "student-1", name: "학생 하나" }],
        }),
        expect.objectContaining({
          kind: "shop",
          name: "실제 이벤트명",
          startDate: "2026-09-04",
          endDate: "2026-09-08",
        }),
      ]),
    );
  });

  test("uses forecast recruitment dates when the raw recruitment group starts on another date", () => {
    const contents = [
      {
        kind: "event" as const,
        uid: "event-0068",
        name: "0068",
        since: "2026-09-14T15:00:00.000Z",
        until: "2026-10-15T14:59:00.000Z",
        recruitmentGroupUid: "group-0068",
      },
      {
        kind: "event" as const,
        uid: "main-story-reward:part-1",
        name: "메인 스토리 보상",
        since: "2026-09-25T15:00:00.000Z",
        until: "2026-09-26T15:00:00.000Z",
        tags: ["main_story_reward"],
      },
    ];
    const scheduleItems = [
      {
        event: {
          uid: "group:group-0068",
          name: "0068",
          since: "2026-09-21T15:00:00.000Z",
          until: "2026-10-06T14:59:00.000Z",
          earnablePyroxene: null,
          tags: [],
          recruitments: [
            {
              recruitmentType: "usual",
              pickup: true,
              rerun: false,
              until: "2026-10-06T14:59:00.000Z",
              student: { uid: "student-0068", imageUid: "student-0068", name: "학생 0068", initialTier: 3 },
              favorited: true,
              sourceContentUid: "event-0068",
            },
          ],
        },
      },
    ] satisfies PyroxeneScheduleItem[];

    const plannedPeriods = buildPlannerPeriods({
      contents,
      scheduleItems,
      favorites: [{ contentUid: "event-0068", studentUid: "student-0068" }],
      eventTrials: [{ eventUid: "event-0068", expectedTrials: 100 }],
      eventRewardUids: ["main-story-reward:part-1"],
      shopPeriods: [],
      timeZone: "Asia/Seoul",
    });
    const publicPeriods = buildPublicPlannerPeriods({
      contents,
      scheduleItems,
      shopPeriods: [],
      timeZone: "Asia/Seoul",
    });

    expect(plannedPeriods.find(({ kind }) => kind === "recruitment")).toMatchObject({
      name: "0068",
      startDate: "2026-09-22",
      endDate: "2026-10-06",
    });
    expect(publicPeriods.find(({ kind }) => kind === "recruitment")).toMatchObject({
      name: "0068",
      startDate: "2026-09-22",
      endDate: "2026-10-06",
    });
    expect(plannedPeriods.some(({ eventUid }) => eventUid === "main-story-reward:part-1")).toBe(false);
    expect(publicPeriods.some(({ eventUid }) => eventUid === "main-story-reward:part-1")).toBe(false);
  });

  test("keeps recruitment candidates available throughout the period and retains its first day", () => {
    const periods: PlannerPeriod[] = [
      {
        key: "recruitment:event-0068:2026-09-29",
        kind: "recruitment",
        name: "0068",
        startDate: "2026-09-22",
        endDate: "2026-09-29",
        href: "/events/event-0068/recruitment-simulator",
        eventUid: "event-0068",
        students: [
          { uid: "mutsuki", imageUid: "mutsuki", name: "무츠키" },
          { uid: "haruka", imageUid: "haruka", name: "하루카" },
        ],
      },
    ];

    expect(buildPlannerRecruitmentCandidatesForDate(periods, "2026-09-23")).toEqual([
      {
        eventUid: "event-0068",
        eventName: "0068",
        startDate: "2026-09-22",
        students: [
          { uid: "mutsuki", imageUid: "mutsuki", name: "무츠키" },
          { uid: "haruka", imageUid: "haruka", name: "하루카" },
        ],
      },
    ]);
    expect(buildPlannerRecruitmentCandidatesForDate(periods, "2026-09-30")).toEqual([]);
  });

  test("splits a period over week boundaries and assigns separate tracks to overlaps", () => {
    const periods: PlannerPeriod[] = [
      {
        key: "first",
        kind: "event",
        name: "First event",
        startDate: "2026-08-31",
        endDate: "2026-09-08",
        href: "/events/first",
      },
      {
        key: "second",
        kind: "shop",
        name: "Second shop",
        startDate: "2026-09-02",
        endDate: "2026-09-04",
        href: "/events/second/shop",
      },
    ];
    const weeks = buildPlannerMonthDays("2026-09");
    const firstWeek = splitPlannerPeriodsForWeek(periods, weeks[0]);
    const secondWeek = splitPlannerPeriodsForWeek(periods, weeks[1]);

    expect(
      firstWeek.map(({ period, startColumn, endColumn, track, continuesAfter }) => ({
        key: period.key,
        startColumn,
        endColumn,
        track,
        continuesAfter,
      })),
    ).toEqual([
      { key: "first", startColumn: 0, endColumn: 6, track: 0, continuesAfter: true },
      { key: "second", startColumn: 2, endColumn: 4, track: 1, continuesAfter: false },
    ]);
    expect(secondWeek).toMatchObject([
      { period: { key: "first" }, startColumn: 0, endColumn: 1, continuesBefore: true },
    ]);
  });

  test("sums same-day quantities by resource while preserving source details", () => {
    const timeline = [
      {
        date: dayjs.utc("2026-09-10T15:00:00.000Z"),
        source: { type: "buy" as const, description: "구매", uid: "buy-1" },
        accumulatedResources: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
        resourceDelta: { pyroxene: 6600, oneTimeTicket: 0, tenTimeTicket: 0 },
      },
      {
        date: dayjs.utc("2026-09-10T16:00:00.000Z"),
        source: { type: "other" as const, description: "직접 등록", uid: "other-1" },
        accumulatedResources: { pyroxene: 6600, oneTimeTicket: 0, tenTimeTicket: 0 },
        resourceDelta: { pyroxene: -500, oneTimeTicket: 1, tenTimeTicket: 0 },
      },
    ];

    const summary = summarizePyroxeneTimeline(timeline, "Asia/Seoul");
    expect(summary["2026-09-11"]).toMatchObject({
      changes: [
        { key: "pyroxene", quantity: 6100 },
        { key: "oneTimeTicket", quantity: 1 },
      ],
      sources: [
        { label: "구매", changes: [{ key: "pyroxene", quantity: 6600 }] },
        {
          label: "직접 등록",
          changes: [
            { key: "pyroxene", quantity: -500 },
            { key: "oneTimeTicket", quantity: 1 },
          ],
        },
      ],
    });
  });
});
