import { describe, expect, test } from "@jest/globals";
import {
  buildPlannerDisplayPeriods,
  buildPlannerMonthDays,
  buildPlannerMonthLayout,
  buildPlannerPeriods,
  buildPlannerRecruitmentCandidatesForDate,
  buildPlannerWeekLayout,
  buildPublicPlannerPeriods,
  formatPlannerPeriodEndDate,
  getPlannerDateScheduleForDate,
  getPlannerEventScheduleGroupsForDate,
  getPlannerMonthEndInstant,
  getPlannerPeriodsForDate,
  getPlannerPlannedEventUids,
  getPlannerTodayMonth,
  groupPlannerPeriods,
  hasPlannerExactEventHandoff,
  type PlannerPeriod,
  partitionPlannerDayResources,
  projectPlannerCalendarResources,
  shiftPlannerMonth,
  summarizePyroxeneTimeline,
} from "~/domain/integrated-planner";
import type { TimelineSourceType } from "~/domain/pyroxene-planner";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { RecruitmentTypeEnum } from "~/graphql/graphql";
import dayjs from "~/lib/dayjs";

describe("integrated planner calendar domain", () => {
  test("groups phases by canonical event uid, prefers the event name, and sorts by earliest phase", () => {
    const periods: PlannerPeriod[] = [
      {
        key: "shop:event-b",
        kind: "shop",
        name: "상점 제목",
        startDate: "2026-09-20",
        endDate: "2026-09-25",
        href: "/events/event-b/shop",
        eventUid: "event-b",
      },
      {
        key: "recruitment:event-a",
        kind: "recruitment",
        name: "모집 제목",
        startDate: "2026-09-05",
        endDate: "2026-09-09",
        href: "/events/event-a/recruitment-simulator",
        eventUid: "event-a",
      },
      {
        key: "event:event-b",
        kind: "event",
        name: "같은 이벤트명",
        startDate: "2026-09-15",
        endDate: "2026-09-30",
        href: "/events/event-b",
        eventUid: "event-b",
      },
      {
        key: "event:event-a",
        kind: "event",
        name: "같은 이벤트명",
        startDate: "2026-09-10",
        endDate: "2026-09-18",
        href: "/events/event-a",
        eventUid: "event-a",
      },
      {
        key: "standalone",
        kind: "shop",
        name: "같은 이벤트명",
        startDate: "2026-09-01",
        endDate: "2026-09-04",
        href: "/events/standalone/shop",
      },
    ];

    expect(
      groupPlannerPeriods(periods).map(({ key, eventUid, name, periods: groupedPeriods }) => ({
        key,
        eventUid,
        name,
        periodKeys: groupedPeriods.map(({ key: periodKey }) => periodKey),
      })),
    ).toEqual([
      { key: "period:standalone", eventUid: undefined, name: "같은 이벤트명", periodKeys: ["standalone"] },
      {
        key: "event:event-a",
        eventUid: "event-a",
        name: "같은 이벤트명",
        periodKeys: ["recruitment:event-a", "event:event-a"],
      },
      {
        key: "event:event-b",
        eventUid: "event-b",
        name: "같은 이벤트명",
        periodKeys: ["shop:event-b", "event:event-b"],
      },
    ]);
  });

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

  test("shows public events and recruitments on their active dates and keeps shops out of calendar targets", () => {
    const periods: PlannerPeriod[] = [
      {
        key: "event:finite",
        kind: "event",
        name: "유한 이벤트",
        startDate: "2026-09-15",
        endDate: "2026-10-06",
        startAt: "2026-09-15T02:00:00.000Z",
        endAt: "2026-10-06T02:00:00.000Z",
        href: "/events/finite",
        eventUid: "finite",
      },
      {
        key: "event:endless",
        kind: "event",
        name: "상설 이벤트",
        startDate: "2026-09-15",
        endDate: "2026-09-15",
        startAt: "2026-09-15T03:00:00.000Z",
        endAt: null,
        endless: true,
        calendarStartOnly: true,
        href: "/events/endless",
        eventUid: "endless",
      },
      {
        key: "recruitment:finite",
        kind: "recruitment",
        name: "유한 이벤트",
        startDate: "2026-09-22",
        endDate: "2026-09-29",
        startAt: "2026-09-22T02:00:00.000Z",
        endAt: "2026-09-29T02:00:00.000Z",
        href: "/events/finite/recruitment-simulator",
        eventUid: "finite",
      },
      {
        key: "shop:finite",
        kind: "shop",
        name: "유한 이벤트 상점",
        startDate: "2026-09-15",
        endDate: "2026-10-06",
        startAt: "2026-09-15T02:00:00.000Z",
        endAt: "2026-10-06T02:00:00.000Z",
        href: "/events/finite/shop",
        eventUid: "finite",
      },
    ];

    expect(getPlannerPeriodsForDate(periods, "2026-09-15").map(({ key }) => key)).toEqual([
      "event:finite",
      "event:endless",
    ]);
    expect(getPlannerPeriodsForDate(periods, "2026-09-22").map(({ key }) => key)).toEqual([
      "event:finite",
      "recruitment:finite",
    ]);
    expect(getPlannerPeriodsForDate(periods, "2026-09-30").map(({ key }) => key)).toEqual(["event:finite"]);
    expect(getPlannerPeriodsForDate(periods, "2026-09-16").some(({ key }) => key === "event:endless")).toBe(false);
    expect(getPlannerPeriodsForDate(periods, "2026-10-07")).toEqual([]);
  });

  test("replaces public recruitment only by the same event uid and exact interval", () => {
    const event: PlannerPeriod = {
      key: "private-event-key",
      kind: "event",
      name: "같은 이름의 이벤트",
      startDate: "2026-09-15",
      endDate: "2026-10-13",
      startAt: "2026-09-15T02:00:00.000Z",
      endAt: "2026-10-13T02:00:00.000Z",
      href: "/events/planned",
      eventUid: "planned",
    };
    const personalRecruitment: PlannerPeriod = {
      key: "private-recruitment-key-with-different-until-format",
      kind: "recruitment",
      name: "같은 이름의 이벤트",
      startDate: "2026-09-29",
      endDate: "2026-10-06",
      startAt: "2026-09-29T02:00:00.000Z",
      endAt: "2026-10-06T02:00:00.000Z",
      href: "/events/planned/recruitment-simulator",
      eventUid: "planned",
      students: [{ uid: "student-a", imageUid: "student-a", name: "학생 A" }],
    };
    const publicPeriods: PlannerPeriod[] = [
      { ...event, key: "public-event-key" },
      { ...personalRecruitment, key: "public-recruitment-key", students: undefined },
      {
        ...personalRecruitment,
        key: "public-recruitment-different-period",
        endDate: "2026-10-08",
        endAt: "2026-10-08T02:00:00.000Z",
        students: undefined,
      },
      {
        ...event,
        key: "public-only-event",
        name: "같은 이름의 이벤트",
        eventUid: "public-only",
        href: "/events/public-only",
      },
      {
        ...personalRecruitment,
        key: "public-only-recruitment",
        eventUid: "public-only",
        href: "/events/public-only/recruitment-simulator",
        students: undefined,
      },
    ];
    const displayPeriods = buildPlannerDisplayPeriods([event, personalRecruitment], publicPeriods);
    const plannedRecruitments = displayPeriods.filter(
      (period) => period.kind === "recruitment" && period.eventUid === "planned",
    );

    expect(displayPeriods).toHaveLength(5);
    expect(plannedRecruitments).toEqual([
      expect.objectContaining({
        key: personalRecruitment.key,
        startAt: personalRecruitment.startAt,
        endAt: personalRecruitment.endAt,
        isPlanned: true,
        hasRecruitmentPlan: true,
        students: [{ uid: "student-a", imageUid: "student-a", name: "학생 A" }],
      }),
      expect.objectContaining({
        key: "public-recruitment-different-period",
        endAt: "2026-10-08T02:00:00.000Z",
        isPlanned: false,
        hasRecruitmentPlan: false,
      }),
    ]);
    expect(displayPeriods.find((period) => period.eventUid === "public-only" && period.kind === "event")).toMatchObject(
      { isPlanned: false },
    );
    const groups = getPlannerEventScheduleGroupsForDate(displayPeriods, "2026-09-29");
    expect(groups.map(({ group, isPlanned }) => ({ uid: group.eventUid, isPlanned }))).toEqual([
      { uid: "planned", isPlanned: true },
      { uid: "public-only", isPlanned: false },
    ]);
  });

  test("deduplicates public and personal copies by event uid and exact period before week layout", () => {
    const publicEvent: PlannerPeriod = {
      key: "public-event-copy",
      kind: "event",
      name: "상설 이벤트",
      startDate: "2026-09-15",
      endDate: "2026-09-15",
      startAt: "2026-09-14T15:00:00.000Z",
      endAt: null,
      href: "/events/permanent",
      eventUid: "permanent",
      runType: "permanent",
      endless: true,
      calendarStartOnly: true,
    };
    const personalEvent: PlannerPeriod = {
      ...publicEvent,
      key: "personal-event-copy",
      isPlanned: true,
    };
    const publicRecruitment: PlannerPeriod = {
      key: "public-recruitment-copy",
      kind: "recruitment",
      name: "상설 이벤트",
      startDate: "2026-09-15",
      endDate: "2026-09-21",
      startAt: "2026-09-14T15:00:00.000Z",
      endAt: "2026-09-21T14:59:00.000Z",
      href: "/events/permanent/recruitment-simulator",
      eventUid: "permanent",
      students: [{ uid: "public-student", imageUid: "public-student", name: "공개 학생" }],
    };
    const personalRecruitment: PlannerPeriod = {
      ...publicRecruitment,
      key: "personal-recruitment-copy",
      hasRecruitmentPlan: true,
      isPlanned: true,
      students: [{ uid: "planned-student", imageUid: "planned-student", name: "계획 학생" }],
    };
    const differentEventPeriod: PlannerPeriod = {
      ...publicEvent,
      key: "public-event-different-period",
      startDate: "2026-09-16",
      endDate: "2026-09-16",
      startAt: "2026-09-15T15:00:00.000Z",
    };
    const personalPeriods = [personalEvent, personalRecruitment];
    const publicPeriods = [publicEvent, publicRecruitment, differentEventPeriod];
    const displayPeriods = buildPlannerDisplayPeriods(personalPeriods, publicPeriods);
    const displayedEvents = displayPeriods.filter(({ kind }) => kind === "event");
    const displayedRecruitments = displayPeriods.filter(({ kind }) => kind === "recruitment");

    expect(displayedEvents).toHaveLength(2);
    expect(displayedEvents.filter(({ startAt }) => startAt === publicEvent.startAt)).toHaveLength(1);
    expect(displayedRecruitments).toEqual([
      expect.objectContaining({
        key: personalRecruitment.key,
        isPlanned: true,
        hasRecruitmentPlan: true,
        students: [{ uid: "planned-student", imageUid: "planned-student", name: "계획 학생" }],
      }),
    ]);

    const week = buildPlannerMonthDays("2026-09")[2];
    const layout = buildPlannerWeekLayout([...publicPeriods, ...personalPeriods], week, "Asia/Seoul");
    expect(layout.eventStartMarkers.filter(({ period }) => period.startAt === publicEvent.startAt)).toHaveLength(1);
    expect(layout.recruitmentStrips).toHaveLength(1);
    expect(layout.recruitmentStrips[0].period).toMatchObject({
      isPlanned: true,
      hasRecruitmentPlan: true,
      students: [{ uid: "planned-student" }],
    });
  });

  test("marks only favorite, saved-trial, and non-default shop event uids as planned", () => {
    const contents = ["favorite", "trials", "shop", "unplanned", "completed-only"].map((uid) => ({
      kind: "event" as const,
      uid,
      name: uid,
      since: "2026-09-15T02:00:00.000Z",
      until: "2026-09-29T02:00:00.000Z",
      actualEndAt: "2026-09-29T02:00:00.000Z",
    }));
    const rewardOnlyContent = {
      kind: "event" as const,
      uid: "reward-only",
      name: "예측 보상만 있는 이벤트",
      since: "2026-09-15T02:00:00.000Z",
      until: "2026-09-29T02:00:00.000Z",
      actualEndAt: "2026-09-29T02:00:00.000Z",
      tags: ["main_story_reward"],
    };
    const allContents = [...contents, rewardOnlyContent];
    const personalPeriods = buildPlannerPeriods({
      contents: allContents,
      scheduleItems: [],
      favorites: [{ contentUid: "favorite", studentUid: "student-a" }],
      eventTrials: [
        { eventUid: "trials", expectedTrials: 0 },
        { eventUid: "unplanned", expectedTrials: null },
        { eventUid: "completed-only", expectedTrials: null },
      ],
      shopPeriods: [
        {
          timelineUid: "shop",
          name: "shop",
          startAt: "2026-09-15T02:00:00.000Z",
          endAt: "2026-09-29T02:00:00.000Z",
          planned: true,
        },
      ],
      timeZone: "Asia/Seoul",
    });
    const publicPeriods = buildPublicPlannerPeriods({
      contents: allContents,
      scheduleItems: [],
      shopPeriods: [],
      timeZone: "Asia/Seoul",
    });
    const displayPeriods = buildPlannerDisplayPeriods(personalPeriods, publicPeriods);

    expect(
      personalPeriods
        .filter(({ kind }) => kind === "event")
        .map(({ eventUid }) => eventUid)
        .sort(),
    ).toEqual(["favorite", "shop", "trials"]);
    expect(
      displayPeriods
        .filter(({ kind }) => kind === "event")
        .map(({ eventUid, isPlanned }) => [eventUid, isPlanned])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    ).toEqual([
      ["completed-only", false],
      ["favorite", true],
      ["shop", true],
      ["trials", true],
      ["unplanned", false],
    ]);
    expect(displayPeriods.some(({ eventUid }) => eventUid === "reward-only")).toBe(false);
  });

  test("keeps recruitment periods resolvable when timeline event details are unavailable", () => {
    const scheduleItems = [
      {
        event: {
          uid: "group:group-a",
          name: "공개 모집 이벤트",
          since: "2026-09-15T02:00:00.000Z",
          until: "2026-10-06T02:00:00.000Z",
          earnablePyroxene: null,
          tags: [],
          recruitments: [
            {
              recruitmentType: RecruitmentTypeEnum.Usual,
              pickup: true,
              rerun: false,
              until: "2026-10-06T02:00:00.000Z",
              student: { uid: "student-a", imageUid: "student-a", name: "학생 A", initialTier: 3 },
              favorited: false,
              sourceContentUid: "event-a",
            },
          ],
        },
      },
    ] satisfies PyroxeneScheduleItem[];
    const periods = buildPublicPlannerPeriods({
      contents: [],
      scheduleItems,
      shopPeriods: [],
      timeZone: "Asia/Seoul",
    });

    expect(periods).toEqual([
      expect.objectContaining({
        kind: "recruitment",
        eventUid: "event-a",
        name: "공개 모집 이벤트",
        startDate: "2026-09-15",
        endDate: "2026-10-06",
        startAt: "2026-09-15T02:00:00.000Z",
        endAt: "2026-10-06T02:00:00.000Z",
      }),
    ]);
    const savedCountPeriods = buildPlannerPeriods({
      contents: [],
      scheduleItems,
      favorites: [],
      eventTrials: [{ eventUid: "event-a", expectedTrials: 0 }],
      shopPeriods: [],
      timeZone: "Asia/Seoul",
    });
    expect(savedCountPeriods).toMatchObject([
      expect.objectContaining({ kind: "recruitment", eventUid: "event-a", expectedTrials: 0 }),
    ]);
    expect(
      buildPlannerDisplayPeriods(savedCountPeriods, periods).find(({ kind }) => kind === "recruitment"),
    ).toMatchObject({
      isPlanned: true,
      hasRecruitmentPlan: true,
      expectedTrials: 0,
    });
    const shopPlanUids = getPlannerPlannedEventUids({
      favorites: [],
      eventTrials: [],
      shopPeriods: [{ timelineUid: "event-a", name: "공개 모집 이벤트", startAt: null, endAt: null, planned: true }],
    });
    expect(buildPlannerDisplayPeriods([], periods, shopPlanUids)).toMatchObject([
      expect.objectContaining({
        kind: "recruitment",
        eventUid: "event-a",
        isPlanned: false,
        hasRecruitmentPlan: false,
        students: [expect.objectContaining({ uid: "student-a", name: "학생 A" })],
      }),
    ]);
  });

  test("marks each recruitment planned only for targets or a saved count", () => {
    const event: PlannerPeriod = {
      key: "event:shop-only",
      kind: "event",
      name: "상점만 계획한 이벤트",
      startDate: "2026-09-15",
      endDate: "2026-10-13",
      startAt: "2026-09-15T02:00:00.000Z",
      endAt: "2026-10-13T02:00:00.000Z",
      href: "/events/shop-only",
      eventUid: "shop-only",
    };
    const publicRecruitment: PlannerPeriod = {
      key: "recruitment:public",
      kind: "recruitment",
      name: event.name,
      startDate: "2026-09-29",
      endDate: "2026-10-06",
      startAt: "2026-09-29T02:00:00.000Z",
      endAt: "2026-10-06T02:00:00.000Z",
      href: "/events/shop-only/recruitment-simulator",
      eventUid: "shop-only",
      students: [{ uid: "public-student", imageUid: "public-student", name: "공개 학생" }],
    };

    const shopOnlyPeriods = buildPlannerDisplayPeriods([], [event, publicRecruitment], new Set(["shop-only"]));
    expect(shopOnlyPeriods.find(({ kind }) => kind === "event")).toMatchObject({ isPlanned: true });
    expect(shopOnlyPeriods.find(({ kind }) => kind === "recruitment")).toMatchObject({
      key: publicRecruitment.key,
      isPlanned: false,
      hasRecruitmentPlan: false,
      students: publicRecruitment.students,
    });

    const emptyPersonalRecruitment: PlannerPeriod = {
      ...publicRecruitment,
      key: "recruitment:empty-personal",
      students: [],
    };
    const emptyPersonalPeriods = buildPlannerDisplayPeriods([emptyPersonalRecruitment], [event, publicRecruitment]);
    expect(emptyPersonalPeriods.find(({ kind }) => kind === "event")).toMatchObject({ isPlanned: false });
    expect(emptyPersonalPeriods.find(({ kind }) => kind === "recruitment")).toMatchObject({
      key: publicRecruitment.key,
      isPlanned: false,
      hasRecruitmentPlan: false,
      students: publicRecruitment.students,
    });

    const targetRecruitment: PlannerPeriod = {
      ...publicRecruitment,
      key: "recruitment:target-plan",
      students: [{ uid: "target-student", imageUid: "target-student", name: "목표 학생" }],
    };
    const targetPeriods = buildPlannerDisplayPeriods([targetRecruitment], [event, publicRecruitment]);
    expect(targetPeriods.find(({ kind }) => kind === "recruitment")).toMatchObject({
      key: targetRecruitment.key,
      isPlanned: true,
      hasRecruitmentPlan: true,
      students: targetRecruitment.students,
    });

    const countRecruitment: PlannerPeriod = {
      ...publicRecruitment,
      key: "recruitment:saved-count",
      expectedTrials: 0,
      students: [],
    };
    const countPeriods = buildPlannerDisplayPeriods([countRecruitment], [event, publicRecruitment]);
    expect(countPeriods.find(({ kind }) => kind === "recruitment")).toMatchObject({
      key: countRecruitment.key,
      expectedTrials: 0,
      isPlanned: true,
      hasRecruitmentPlan: true,
      students: [],
    });
  });

  test("classifies date facts, ongoing schedules, and endless recruitment independently", () => {
    const periods: PlannerPeriod[] = [
      {
        key: "event:endless",
        kind: "event",
        name: "상설 이벤트",
        startDate: "2026-09-15",
        endDate: "2026-09-15",
        startAt: "2026-09-15T02:00:00.000Z",
        endAt: null,
        endless: true,
        href: "/events/endless",
        eventUid: "endless",
      },
      {
        key: "recruitment:endless",
        kind: "recruitment",
        name: "상설 이벤트",
        startDate: "2026-09-15",
        endDate: "2026-09-29",
        startAt: "2026-09-15T03:00:00.000Z",
        endAt: "2026-09-29T02:00:00.000Z",
        href: "/events/endless/recruitment-simulator",
        eventUid: "endless",
      },
      {
        key: "event:finite",
        kind: "event",
        name: "유한 이벤트",
        startDate: "2026-09-22",
        endDate: "2026-10-06",
        startAt: "2026-09-22T02:00:00.000Z",
        endAt: "2026-10-06T02:00:00.000Z",
        href: "/events/finite",
        eventUid: "finite",
      },
      {
        key: "recruitment:finite",
        kind: "recruitment",
        name: "유한 이벤트",
        startDate: "2026-09-22",
        endDate: "2026-10-06",
        startAt: "2026-09-22T02:00:00.000Z",
        endAt: "2026-10-06T02:00:00.000Z",
        href: "/events/finite/recruitment-simulator",
        eventUid: "finite",
      },
      {
        key: "event:same-day",
        kind: "event",
        name: "하루 이벤트",
        startDate: "2026-09-29",
        endDate: "2026-09-29",
        startAt: "2026-09-29T03:00:00.000Z",
        endAt: "2026-09-29T04:00:00.000Z",
        href: "/events/same-day",
        eventUid: "same-day",
      },
      {
        key: "recruitment:same-day-running",
        kind: "recruitment",
        name: "하루 이벤트",
        startDate: "2026-09-15",
        endDate: "2026-10-06",
        startAt: "2026-09-15T02:00:00.000Z",
        endAt: "2026-10-06T02:00:00.000Z",
        href: "/events/same-day/recruitment-simulator",
        eventUid: "same-day",
      },
      {
        key: "shop:shop-only",
        kind: "shop",
        name: "상점 일정",
        startDate: "2026-09-20",
        endDate: "2026-09-29",
        startAt: "2026-09-20T02:00:00.000Z",
        endAt: "2026-09-29T02:30:00.000Z",
        href: "/events/shop-only/shop",
        eventUid: "shop-only",
      },
      {
        key: "event:november",
        kind: "event",
        name: "11월 이벤트",
        startDate: "2026-11-17",
        endDate: "2026-12-01",
        startAt: "2026-11-17T02:00:00.000Z",
        endAt: "2026-12-01T02:00:00.000Z",
        href: "/events/november",
        eventUid: "november",
      },
      {
        key: "recruitment:november",
        kind: "recruitment",
        name: "11월 이벤트",
        startDate: "2026-11-17",
        endDate: "2026-12-01",
        startAt: "2026-11-17T02:00:00.000Z",
        endAt: "2026-12-01T02:00:00.000Z",
        href: "/events/november/recruitment-simulator",
        eventUid: "november",
      },
    ];

    const onStart = getPlannerDateScheduleForDate(periods, "2026-09-15", "Asia/Seoul");
    expect(onStart.onDate.map(({ period, facts }) => [period.key, facts.map(({ kind }) => kind)])).toEqual([
      ["event:endless", ["event-start"]],
      ["recruitment:same-day-running", ["recruitment-start"]],
      ["recruitment:endless", ["recruitment-start"]],
    ]);
    expect(onStart.ongoing).toEqual([]);

    const during = getPlannerDateScheduleForDate(periods, "2026-09-22", "Asia/Seoul");
    expect(during.onDate.map(({ period }) => period.key)).toEqual(["event:finite"]);
    expect(during.ongoing.map(({ period }) => period.key)).toEqual([
      "recruitment:endless",
      "recruitment:same-day-running",
    ]);

    const deadline = getPlannerDateScheduleForDate(periods, "2026-09-29", "Asia/Seoul");
    expect(deadline.onDate.map(({ period, facts }) => [period.key, facts.map(({ kind }) => kind)])).toEqual([
      ["recruitment:endless", ["recruitment-end"]],
      ["shop:shop-only", ["shop-deadline"]],
      ["event:same-day", ["event-start", "event-end"]],
    ]);
    expect(deadline.ongoing.map(({ period }) => period.key)).toEqual(["event:finite"]);
    expect(deadline.onDate.find(({ period }) => period.key === "event:same-day")?.ongoingRecruitmentPeriods).toEqual([
      expect.objectContaining({ key: "recruitment:same-day-running" }),
    ]);
    expect(deadline.ongoing[0].ongoingRecruitmentPeriods).toEqual([
      expect.objectContaining({ key: "recruitment:finite" }),
    ]);

    const november = getPlannerDateScheduleForDate(periods, "2026-11-20", "Asia/Seoul");
    expect(november.onDate).toEqual([]);
    expect(november.ongoing.map(({ period }) => period.key)).toEqual(["event:november"]);
    expect(november.ongoing[0].ongoingRecruitmentPeriods).toEqual([
      expect.objectContaining({ key: "recruitment:november" }),
    ]);
  });

  test("places exact midnight deadline facts on their actual local date", () => {
    const period: PlannerPeriod = {
      key: "event:midnight",
      kind: "event",
      name: "자정 종료 이벤트",
      startDate: "2026-09-01",
      endDate: "2026-09-10",
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-10T15:00:00.000Z",
      href: "/events/midnight",
      eventUid: "midnight",
    };

    expect(getPlannerDateScheduleForDate([period], "2026-09-10", "Asia/Seoul").onDate).toEqual([]);
    expect(getPlannerDateScheduleForDate([period], "2026-09-11", "Asia/Seoul").onDate).toMatchObject([
      { period: { eventUid: "midnight" }, facts: [{ kind: "event-end", at: "2026-09-10T15:00:00.000Z" }] },
    ]);
  });

  test("maps a period ending exactly at local midnight to the previous civil day", () => {
    expect(formatPlannerPeriodEndDate("2026-09-10T15:00:00.000Z", "Asia/Seoul")).toBe("2026-09-10");
    expect(formatPlannerPeriodEndDate("2026-09-10T14:59:59.999Z", "Asia/Seoul")).toBe("2026-09-10");
  });

  test("uses original event timing for start-only markers without a recruitment", () => {
    const contents = [
      {
        kind: "event" as const,
        uid: "event-undated",
        name: "종료 미정 이벤트",
        since: "2026-09-07T02:00:00.000Z",
        until: "2026-09-22T14:59:00.000Z",
        actualEndAt: null,
        endless: false,
        runType: "rerun" as const,
        recruitments: [],
      },
      {
        kind: "event" as const,
        uid: "event-endless",
        name: "상설 이벤트",
        since: "2026-09-08T03:00:00.000Z",
        until: "2026-09-25T14:59:00.000Z",
        actualEndAt: "2026-09-25T14:59:00.000Z",
        endless: true,
        runType: "permanent" as const,
        recruitments: [],
      },
      {
        kind: "event" as const,
        uid: "event-unrelated",
        name: "관련 없는 공개 이벤트",
        since: "2026-09-09T03:00:00.000Z",
        until: "2026-09-26T14:59:00.000Z",
        actualEndAt: null,
        endless: false,
        runType: "first" as const,
        recruitments: [],
      },
    ];
    const periods = buildPublicPlannerPeriods({
      contents,
      scheduleItems: [],
      shopPeriods: [],
      timeZone: "Asia/Seoul",
    });
    const personalPeriods = buildPlannerPeriods({
      contents,
      scheduleItems: [],
      favorites: [
        { contentUid: "event-undated", studentUid: "student-a" },
        { contentUid: "event-endless", studentUid: "student-b" },
      ],
      eventTrials: [],
      shopPeriods: [],
      timeZone: "Asia/Seoul",
    });
    const week = buildPlannerMonthDays("2026-09")[1];
    const layout = buildPlannerWeekLayout(periods, week, "Asia/Seoul");

    expect(periods).toEqual([
      expect.objectContaining({
        eventUid: "event-undated",
        startDate: "2026-09-07",
        endDate: "2026-09-07",
        endAt: null,
        calendarStartOnly: true,
        runType: "rerun",
        endless: false,
      }),
      expect.objectContaining({
        eventUid: "event-endless",
        startDate: "2026-09-08",
        endDate: "2026-09-08",
        endAt: null,
        calendarStartOnly: true,
        runType: "permanent",
        endless: true,
      }),
      expect.objectContaining({
        eventUid: "event-unrelated",
        startDate: "2026-09-09",
        endDate: "2026-09-09",
        endAt: null,
        calendarStartOnly: true,
        runType: "first",
        endless: false,
      }),
    ]);
    expect(layout.eventStrips).toEqual([]);
    expect(layout.eventStartMarkers).toHaveLength(3);
    expect(layout.eventStartMarkers.map(({ track }) => track)).toEqual([0, 0, 0]);
    expect(layout.eventStartMarkers[0].leftPercent).toBeCloseTo((11 / 24 / 7) * 100);
    expect(getPlannerPeriodsForDate(periods, "2026-10-01", "2026-09-15")).toEqual([]);
    const personalLayout = buildPlannerWeekLayout(personalPeriods, week, "Asia/Seoul");
    expect(personalLayout.eventStartMarkers.map(({ period }) => period.eventUid)).toEqual([
      "event-undated",
      "event-endless",
    ]);
    expect(personalPeriods.filter(({ kind }) => kind === "event")).toMatchObject([
      { runType: "rerun", endDate: "2026-09-07", endAt: null, endless: false },
      { runType: "permanent", endDate: "2026-09-08", endAt: null, endless: true },
    ]);
  });

  test("shares a lane between a start marker and later strips while ending its label at the next item", () => {
    const week = buildPlannerMonthDays("2026-09")[1];
    const layout = buildPlannerWeekLayout(
      [
        {
          key: "event-before-marker",
          kind: "event",
          name: "먼저 끝나는 이벤트",
          startDate: "2026-09-07",
          endDate: "2026-09-07",
          startAt: "2026-09-07T02:00:00.000Z",
          endAt: "2026-09-07T03:00:00.000Z",
          href: "/events/before-marker",
          eventUid: "before-marker",
        },
        {
          key: "event-marker",
          kind: "event",
          name: "시작 표시 이벤트",
          startDate: "2026-09-07",
          endDate: "2026-09-07",
          startAt: "2026-09-07T03:00:00.000Z",
          endAt: null,
          endless: true,
          calendarStartOnly: true,
          href: "/events/marker",
          eventUid: "marker",
        },
        {
          key: "event-after-marker",
          kind: "event",
          name: "나중에 시작하는 이벤트",
          startDate: "2026-09-08",
          endDate: "2026-09-08",
          startAt: "2026-09-08T02:00:00.000Z",
          endAt: "2026-09-08T04:00:00.000Z",
          href: "/events/after-marker",
          eventUid: "after-marker",
        },
      ],
      week,
      "Asia/Seoul",
    );

    expect(layout.laneCount).toBe(1);
    expect(layout.eventStartMarkers[0].track).toBe(0);
    expect(layout.eventStartMarkers[0].widthPercent).toBeLessThan(100);
    expect(layout.eventStrips.map(({ track }) => track)).toEqual([0, 0]);
  });

  test("keeps a planned shop event without recruitment in the personal calendar marker range", () => {
    const periods = buildPlannerPeriods({
      contents: [
        {
          kind: "event",
          uid: "planned-shop-event",
          name: "상점 계획 이벤트",
          since: "2026-09-12T02:00:00.000Z",
          until: "2026-09-30T14:59:00.000Z",
          actualEndAt: null,
          endless: false,
          recruitments: [],
        },
      ],
      scheduleItems: [],
      favorites: [],
      eventTrials: [],
      shopPeriods: [
        {
          timelineUid: "planned-shop-event",
          name: "상점 계획 이벤트",
          startAt: "2026-09-12T02:00:00.000Z",
          endAt: "2026-09-20T02:00:00.000Z",
          planned: true,
        },
      ],
      timeZone: "Asia/Seoul",
    });
    const week = buildPlannerMonthDays("2026-09")[1];

    expect(periods.find(({ kind }) => kind === "event")).toMatchObject({
      eventUid: "planned-shop-event",
      endAt: null,
      calendarStartOnly: true,
    });
    expect(buildPlannerWeekLayout(periods, week, "Asia/Seoul").eventStartMarkers).toEqual([
      expect.objectContaining({ period: expect.objectContaining({ eventUid: "planned-shop-event" }) }),
    ]);
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
          imageUrl: "https://cdn.example.test/event-1.webp",
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
                recruitmentType: RecruitmentTypeEnum.Usual,
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
          startAt: "2026-09-01T00:00:00.000Z",
          imageUrl: "https://cdn.example.test/event-1.webp",
          endAt: "2026-09-10T15:00:00.000Z",
          startDate: "2026-09-01",
          endDate: "2026-09-10",
        }),
        expect.objectContaining({
          kind: "recruitment",
          name: "실제 이벤트명",
          startAt: "2026-09-02T15:00:00.000Z",
          startDate: "2026-09-03",
          endDate: "2026-09-04",
          expectedTrials: 100,
          students: [{ uid: "student-1", imageUid: "student-1", name: "학생 하나" }],
        }),
        expect.objectContaining({
          kind: "shop",
          name: "실제 이벤트명",
          startAt: "2026-09-03T15:00:00.000Z",
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
              recruitmentType: RecruitmentTypeEnum.Usual,
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
        key: "event:event-0068",
        kind: "event",
        name: "0068",
        startDate: "2026-09-15",
        endDate: "2026-09-15",
        href: "/events/event-0068",
        eventUid: "event-0068",
        imageUrl: "https://example.test/0068.webp",
        runType: "permanent",
        endless: true,
        calendarStartOnly: true,
      },
      {
        key: "recruitment:event-0068:2026-09-29",
        kind: "recruitment",
        name: "0068",
        startDate: "2026-09-22",
        endDate: "2026-09-29",
        href: "/events/event-0068/recruitment-simulator",
        eventUid: "event-0068",
        startAt: "2026-09-22T02:00:00.000Z",
        endAt: "2026-09-29T02:00:00.000Z",
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
        endDate: "2026-09-29",
        runType: "permanent",
        startAt: "2026-09-22T02:00:00.000Z",
        endAt: "2026-09-29T02:00:00.000Z",
        imageUrl: "https://example.test/0068.webp",
        students: [
          { uid: "mutsuki", imageUid: "mutsuki", name: "무츠키" },
          { uid: "haruka", imageUid: "haruka", name: "하루카" },
        ],
      },
    ]);
    expect(buildPlannerRecruitmentCandidatesForDate(periods, "2026-09-30")).toEqual([]);
  });

  test("groups favorite students sharing a recruitment period and keeps different periods separate", () => {
    const periods = buildPlannerPeriods({
      contents: [
        {
          kind: "event",
          uid: "event-recruitment",
          name: "모집 이벤트",
          since: "2026-09-01T00:00:00.000Z",
          until: "2026-09-10T15:00:00.000Z",
          recruitmentGroupUid: "group-recruitment",
        },
      ],
      scheduleItems: [
        {
          event: {
            uid: "group:group-recruitment",
            name: "모집 이벤트",
            since: "2026-09-02T15:00:00.000Z",
            until: "2026-09-10T14:59:00.000Z",
            earnablePyroxene: null,
            tags: [],
            recruitments: [
              {
                recruitmentType: RecruitmentTypeEnum.Usual,
                pickup: true,
                rerun: false,
                until: "2026-09-06T14:59:00.000Z",
                student: { uid: "student-a", imageUid: "student-a", name: "학생 A", initialTier: 3 },
                favorited: true,
                sourceContentUid: "event-recruitment",
              },
              {
                recruitmentType: RecruitmentTypeEnum.Usual,
                pickup: true,
                rerun: false,
                until: "2026-09-06T14:59:00.000Z",
                student: { uid: "student-b", imageUid: "student-b", name: "학생 B", initialTier: 3 },
                favorited: true,
                sourceContentUid: "event-recruitment",
              },
              {
                recruitmentType: RecruitmentTypeEnum.Usual,
                pickup: true,
                rerun: false,
                until: "2026-09-10T14:59:00.000Z",
                student: { uid: "student-c", imageUid: "student-c", name: "학생 C", initialTier: 3 },
                favorited: true,
                sourceContentUid: "event-recruitment",
              },
            ],
          },
        },
      ] satisfies PyroxeneScheduleItem[],
      favorites: [
        { contentUid: "event-recruitment", studentUid: "student-a" },
        { contentUid: "event-recruitment", studentUid: "student-b" },
        { contentUid: "event-recruitment", studentUid: "student-c" },
      ],
      eventTrials: [],
      shopPeriods: [],
      timeZone: "Asia/Seoul",
    });

    expect(
      periods
        .filter(({ kind }) => kind === "recruitment")
        .map(({ startDate, endDate, endAt, students }) => ({ startDate, endDate, endAt, students }))
        .sort((left, right) => left.endDate.localeCompare(right.endDate)),
    ).toEqual([
      {
        startDate: "2026-09-03",
        endDate: "2026-09-06",
        endAt: "2026-09-06T14:59:00.000Z",
        students: [
          { uid: "student-a", imageUid: "student-a", name: "학생 A" },
          { uid: "student-b", imageUid: "student-b", name: "학생 B" },
        ],
      },
      {
        startDate: "2026-09-03",
        endDate: "2026-09-10",
        endAt: "2026-09-10T14:59:00.000Z",
        students: [{ uid: "student-c", imageUid: "student-c", name: "학생 C" }],
      },
    ]);
  });

  test("keeps an undated planned shop reachable through its event without creating a shop period", () => {
    const periods = buildPlannerPeriods({
      contents: [
        {
          kind: "event",
          uid: "event-undated-shop",
          name: "상점 이벤트",
          since: "2026-09-01T00:00:00.000Z",
          until: "2026-09-10T15:00:00.000Z",
        },
      ],
      scheduleItems: [],
      favorites: [],
      eventTrials: [],
      shopPeriods: [
        {
          timelineUid: "event-undated-shop",
          name: "상점 이벤트",
          startAt: null,
          endAt: null,
          planned: true,
        },
      ],
      timeZone: "Asia/Seoul",
    });

    expect(periods).toEqual([
      expect.objectContaining({
        kind: "event",
        eventUid: "event-undated-shop",
        name: "상점 이벤트",
      }),
    ]);
    expect(periods.some(({ kind }) => kind === "shop")).toBe(false);
  });

  test("packs exact-time handoffs into one lane and overlaps into separate lanes", () => {
    const week = buildPlannerMonthDays("2026-09")[1];
    const periods: PlannerPeriod[] = [
      {
        key: "event-first",
        kind: "event",
        name: "첫 이벤트",
        startDate: "2026-09-07",
        endDate: "2026-09-07",
        startAt: "2026-09-07T00:00:00.000Z",
        endAt: "2026-09-07T02:00:00.000Z",
        href: "/events/first",
        eventUid: "event-first",
      },
      {
        key: "event-second",
        kind: "event",
        name: "두 번째 이벤트",
        startDate: "2026-09-07",
        endDate: "2026-09-07",
        startAt: "2026-09-07T02:00:00.000Z",
        endAt: "2026-09-07T04:00:00.000Z",
        href: "/events/second",
        eventUid: "event-second",
      },
    ];

    const handoff = buildPlannerWeekLayout(periods, week, "Asia/Seoul");
    expect(hasPlannerExactEventHandoff(periods[0], periods[1])).toBe(true);
    expect(handoff.laneCount).toBe(1);
    expect(handoff.eventStrips.map(({ track }) => track)).toEqual([0, 0]);
    expect(handoff.eventStrips[1].leftPercent).toBeCloseTo(
      handoff.eventStrips[0].leftPercent + handoff.eventStrips[0].widthPercent,
    );

    const overlap = buildPlannerWeekLayout(
      [periods[0], { ...periods[1], startAt: "2026-09-07T01:59:59.999Z" }],
      week,
      "Asia/Seoul",
    );
    expect(overlap.laneCount).toBe(2);
  });

  test("clips exact periods with half-open week boundaries", () => {
    const weeks = buildPlannerMonthDays("2026-09");
    const endingAtWeekStart: PlannerPeriod = {
      key: "ending-at-week-start",
      kind: "event",
      name: "이전 주 종료",
      startDate: "2026-09-06",
      endDate: "2026-09-06",
      startAt: "2026-09-06T13:00:00.000Z",
      endAt: "2026-09-06T15:00:00.000Z",
      href: "/events/ending-at-week-start",
      eventUid: "ending-at-week-start",
    };
    const startingAtNextWeek: PlannerPeriod = {
      key: "starting-at-next-week",
      kind: "event",
      name: "다음 주 시작",
      startDate: "2026-09-13",
      endDate: "2026-09-13",
      startAt: "2026-09-13T15:00:00.000Z",
      endAt: "2026-09-13T17:00:00.000Z",
      href: "/events/starting-at-next-week",
      eventUid: "starting-at-next-week",
    };

    expect(buildPlannerWeekLayout([endingAtWeekStart], weeks[1], "Asia/Seoul").eventStrips).toEqual([]);
    expect(buildPlannerWeekLayout([startingAtNextWeek], weeks[1], "Asia/Seoul").eventStrips).toEqual([]);
  });

  test("combines only exact same-event periods and keeps unmatched recruitment independent", () => {
    const week = buildPlannerMonthDays("2026-09")[1];
    const event: PlannerPeriod = {
      key: "event-combined",
      kind: "event",
      name: "모집 이벤트",
      startDate: "2026-09-07",
      endDate: "2026-09-08",
      startAt: "2026-09-07T00:00:00.000Z",
      endAt: "2026-09-08T00:00:00.000Z",
      href: "/events/combined",
      eventUid: "event-combined",
    };
    const matchingRecruitment: PlannerPeriod = {
      key: "recruitment-matching",
      kind: "recruitment",
      name: "모집 이벤트",
      startDate: "2026-09-07",
      endDate: "2026-09-08",
      startAt: "2026-09-07T00:00:00.000Z",
      endAt: "2026-09-08T00:00:00.000Z",
      href: "/events/combined/recruitment-simulator",
      eventUid: "event-combined",
      students: [{ uid: "student-a", imageUid: "student-a", name: "학생 A" }],
    };
    const differentPeriodRecruitment = {
      ...matchingRecruitment,
      key: "recruitment-different",
      endAt: "2026-09-08T01:00:00.000Z",
    };
    const secondaryEvent: PlannerPeriod = {
      ...event,
      key: "event-secondary",
      name: "겹치는 다른 이벤트",
      href: "/events/secondary",
      eventUid: "event-secondary",
    };

    const layout = buildPlannerWeekLayout([event, matchingRecruitment, differentPeriodRecruitment], week, "Asia/Seoul");
    expect(layout.eventStrips).toMatchObject([
      {
        kind: "combined",
        recruitmentPeriods: [{ key: "recruitment-matching" }],
      },
    ]);
    expect(layout.recruitmentStrips.map(({ period }) => period.key)).toEqual(["recruitment-different"]);
    expect(layout.eventStrips[0].track).toBe(0);
    expect(layout.recruitmentStrips[0].track).toBe(1);
    const monthLayout = buildPlannerMonthLayout(
      "2026-09",
      [event, matchingRecruitment, differentPeriodRecruitment, secondaryEvent],
      "Asia/Seoul",
    );
    expect(monthLayout.weekLayouts[1].laneCount).toBe(3);
    expect(monthLayout.weekLayouts[0].laneCount).toBe(0);
  });

  test("keeps an event's recruitment directly below it when another event starts in between", () => {
    const week = buildPlannerMonthDays("2026-09")[1];
    const layout = buildPlannerWeekLayout(
      [
        {
          key: "event-parent",
          kind: "event",
          name: "먼저 시작하는 이벤트",
          startDate: "2026-09-07",
          endDate: "2026-09-10",
          startAt: "2026-09-07T02:00:00.000Z",
          endAt: "2026-09-10T02:00:00.000Z",
          href: "/events/parent",
          eventUid: "parent",
        },
        {
          key: "recruitment-parent",
          kind: "recruitment",
          name: "먼저 시작하는 이벤트",
          startDate: "2026-09-08",
          endDate: "2026-09-09",
          startAt: "2026-09-08T02:00:00.000Z",
          endAt: "2026-09-09T02:00:00.000Z",
          href: "/events/parent/recruitment-simulator",
          eventUid: "parent",
        },
        {
          key: "event-between",
          kind: "event",
          name: "사이에 시작한 이벤트",
          startDate: "2026-09-08",
          endDate: "2026-09-09",
          startAt: "2026-09-08T01:00:00.000Z",
          endAt: "2026-09-09T03:00:00.000Z",
          href: "/events/between",
          eventUid: "between",
        },
      ],
      week,
      "Asia/Seoul",
    );

    expect(layout.laneCount).toBe(3);
    expect(layout.eventStrips.map(({ key, track }) => [key, track])).toEqual([
      ["event-parent", 0],
      ["event-between", 2],
    ]);
    expect(layout.recruitmentStrips.map(({ key, track }) => [key, track])).toEqual([["recruitment-parent", 1]]);
  });

  test("uses fractional local-day geometry across a DST transition", () => {
    const week = buildPlannerMonthDays("2026-03")[1];
    const layout = buildPlannerWeekLayout(
      [
        {
          key: "dst-event",
          kind: "event",
          name: "DST 이벤트",
          startDate: "2026-03-08",
          endDate: "2026-03-08",
          startAt: "2026-03-08T08:00:00.000Z",
          endAt: "2026-03-08T19:00:00.000Z",
          href: "/events/dst",
          eventUid: "dst-event",
        },
      ],
      week,
      "America/Los_Angeles",
    );

    expect(layout.eventStrips[0].widthPercent).toBeCloseTo((11 / 23 / 7) * 100);
  });

  test("keeps date-only periods conservative and exposes invalid raw intervals", () => {
    const week = buildPlannerMonthDays("2026-09")[1];
    const dateOnlyPeriods: PlannerPeriod[] = [
      {
        key: "date-only-a",
        kind: "event",
        name: "날짜 이벤트 A",
        startDate: "2026-09-07",
        endDate: "2026-09-07",
        href: "/events/date-only-a",
        eventUid: "date-only-a",
      },
      {
        key: "date-only-b",
        kind: "event",
        name: "날짜 이벤트 B",
        startDate: "2026-09-07",
        endDate: "2026-09-07",
        href: "/events/date-only-b",
        eventUid: "date-only-b",
      },
    ];
    const dateOnly = buildPlannerWeekLayout(dateOnlyPeriods, week, "Asia/Seoul");
    expect(dateOnly.laneCount).toBe(2);
    expect(dateOnly.eventStrips.every(({ timingStatus }) => timingStatus === "date-only")).toBe(true);

    const invalid = buildPlannerWeekLayout(
      [
        {
          ...dateOnlyPeriods[0],
          key: "invalid",
          startAt: "2026-09-07T02:00:00.000Z",
          endAt: "2026-09-07T01:00:00.000Z",
        },
      ],
      week,
      "Asia/Seoul",
    );
    expect(invalid.eventStrips[0].timingStatus).toBe("invalid");
  });

  test("allocates only the lanes each week needs", () => {
    const periods: PlannerPeriod[] = [
      ...[0, 1, 2].map((index) => ({
        key: `overlap-${index}`,
        kind: "event" as const,
        name: `겹침 ${index}`,
        startDate: "2026-09-07",
        endDate: "2026-09-07",
        startAt: "2026-09-07T00:00:00.000Z",
        endAt: `2026-09-07T0${index + 2}:00:00.000Z`,
        href: `/events/overlap-${index}`,
        eventUid: `overlap-${index}`,
      })),
    ];
    const month = buildPlannerMonthLayout("2026-09", periods, "Asia/Seoul");
    expect(month.weekLayouts[0].laneCount).toBe(0);
    expect(month.weekLayouts[1].laneCount).toBe(3);
    expect(month.weekLayouts.slice(2).every((layout) => layout.laneCount === 0)).toBe(true);
  });

  test("keeps recruitment-only months compact without an event rail gap", () => {
    const month = buildPlannerMonthLayout(
      "2026-09",
      [
        {
          key: "recruitment-only",
          kind: "recruitment",
          name: "모집만 있는 이벤트",
          startDate: "2026-09-07",
          endDate: "2026-09-08",
          startAt: "2026-09-07T00:00:00.000Z",
          endAt: "2026-09-08T00:00:00.000Z",
          href: "/events/recruitment-only/recruitment-simulator",
          eventUid: "recruitment-only",
          students: [{ uid: "student-only", imageUid: "student-only", name: "학생만" }],
        },
      ],
      "Asia/Seoul",
    );

    expect(month.weekLayouts[0].laneCount).toBe(0);
    expect(month.weekLayouts[1].laneCount).toBe(1);
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

  test("projects calendar and recruitment sources for cells while keeping the complete timeline separate", () => {
    const timeline = ["event_reward", "raid", "buy", "other", "event", "package_daily"].map((type, index) => ({
      date: dayjs.utc(`2026-09-10T${String(15 + index).padStart(2, "0")}:00:00.000Z`),
      source: { type: type as TimelineSourceType, description: type, uid: `${type}-${index}` },
      accumulatedResources: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
      resourceDelta: { pyroxene: index < 4 ? [100, 200, -50, 10][index] : 100, oneTimeTicket: 0, tenTimeTicket: 0 },
    }));

    const full = summarizePyroxeneTimeline(timeline, "Asia/Seoul");
    const projected = projectPlannerCalendarResources(full);

    expect(full["2026-09-11"]?.changes).toEqual([{ key: "pyroxene", quantity: 460 }]);
    expect(projected["2026-09-11"]).toMatchObject({
      changes: [{ key: "pyroxene", quantity: 360 }],
      sources: [
        { type: "event_reward" },
        { type: "raid" },
        { type: "buy" },
        { type: "other" },
        { type: "event", label: "모집 소비" },
      ],
    });
  });

  test("groups non-calendar sources by source count and preserves separate resource totals including zero", () => {
    const breakdown = partitionPlannerDayResources({
      dateKey: "2026-09-11",
      changes: [],
      sources: [
        { key: "other-main", type: "other", label: "직접 등록", changes: [{ key: "pyroxene", quantity: 30 }] },
        {
          key: "package",
          type: "package_once",
          label: "패키지 지급",
          changes: [
            { key: "pyroxene", quantity: 20 },
            { key: "oneTimeTicket", quantity: 1 },
          ],
        },
        {
          key: "ap-charge",
          type: "ap_charge",
          label: "AP 충전 소비",
          changes: [
            { key: "pyroxene", quantity: -20 },
            { key: "oneTimeTicket", quantity: -1 },
          ],
        },
        { key: "ticket", type: "ticket_gain", label: "티켓", changes: [{ key: "tenTimeTicket", quantity: 1 }] },
        { key: "cancel-plus", type: "daily_mission", label: "일일 임무", changes: [{ key: "pyroxene", quantity: 50 }] },
        {
          key: "cancel-minus",
          type: "weekly_mission",
          label: "주간 임무",
          changes: [{ key: "pyroxene", quantity: -50 }],
        },
        { key: "empty", type: "daily_mission", label: "빈 항목", changes: [] },
      ],
    });

    expect(breakdown.calendarSources.map(({ type }) => type)).toEqual(["other"]);
    expect(breakdown.otherSources.map(({ key }) => key)).toEqual([
      "package",
      "ap-charge",
      "ticket",
      "cancel-plus",
      "cancel-minus",
    ]);
    expect(breakdown.otherSources).toHaveLength(5);
    expect(breakdown.otherChanges).toEqual([
      { key: "pyroxene", quantity: 0 },
      { key: "oneTimeTicket", quantity: 0 },
      { key: "tenTimeTicket", quantity: 1 },
    ]);
  });

  test("keeps a zero-consumption recruitment source in the calendar breakdown", () => {
    const event = { uid: "pickup-event" } as NonNullable<PyroxeneScheduleItem["event"]>;
    const day = summarizePyroxeneTimeline(
      [
        {
          date: dayjs.utc("2026-09-10T15:00:00.000Z"),
          source: { type: "event" as const, event },
          accumulatedResources: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
          resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
        },
      ],
      "Asia/Seoul",
    )["2026-09-11"];

    expect(day?.sources).toEqual([
      {
        key: "event:2026-09-11:0",
        type: "event",
        label: "모집 소비",
        eventUid: "pickup-event",
        changes: [],
      },
    ]);
    expect(day && partitionPlannerDayResources(day).calendarSources).toEqual(day?.sources);
    expect(day && partitionPlannerDayResources(day).otherSources).toEqual([]);
  });
});
