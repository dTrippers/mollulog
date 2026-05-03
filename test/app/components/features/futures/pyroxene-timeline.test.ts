import { describe, expect, it } from "@jest/globals";
import { RecruitmentTypeEnum } from "../../../../../app/graphql/graphql";
import type { PyroxenePlannerOptions } from "../../../../../app/models/pyroxene-planner";
import type { PyroxeneScheduleItem } from "../../../../../app/components/features/futures/types";
import { buildTimeline, type PickupResources } from "../../../../../app/models/pyroxene-timeline";

const defaultOptions: PyroxenePlannerOptions = {
  event: { pickupChance: "average" },
  raid: { tier: "platinum" },
  tactical: { level: "in100" },
  consumption: { apChargeCount: 0 },
  timeline: { display: ["event", "event_reward", "raid", "buy", "package_onetime", "ap_charge"] },
};

const initialResources: PickupResources = {
  pyroxene: 1000,
  oneTimeTicket: 0,
  tenTimeTicket: 0,
};

function futureEvent(until = "2026-02-01T00:00:00.000Z"): PyroxeneScheduleItem {
  return {
    event: {
      uid: "event-horizon",
      name: "테스트 이벤트",
      since: "2026-01-10T00:00:00.000Z",
      until,
      earnablePyroxene: null,
      recruitments: [],
    },
  };
}

function favoritedPickupRecruitment() {
  return {
    recruitmentType: RecruitmentTypeEnum.Usual,
    pickup: true,
    rerun: false,
    student: { uid: "student-1", name: "학생", initialTier: 3 },
    favorited: true,
  };
}

describe("pyroxene-timeline", () => {
  it("accumulates one-time gain after initial resources", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map(),
      [
        {
          onetimeGain: {
            uid: "buy-1",
            source: "buy",
            date: new Date("2026-01-02T00:00:00.000Z"),
            description: "청휘석 구매",
            pyroxeneDelta: 6600,
          },
        },
      ],
      defaultOptions,
    );

    expect(timeline.find((entry) => entry.source.uid === "buy-1")).toEqual(
      expect.objectContaining({
        resourceDelta: { pyroxene: 6600, oneTimeTicket: 0, tenTimeTicket: 0 },
        accumulatedResources: { pyroxene: 7600, oneTimeTicket: 0, tenTimeTicket: 0 },
      }),
    );
  });

  it("expands repeated gains until repeat count within the event horizon", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map(),
      [
        futureEvent("2026-01-10T00:00:00.000Z"),
        {
          repeatedGain: {
            uid: "daily-package",
            source: "package_daily",
            date: new Date("2026-01-02T00:00:00.000Z"),
            description: "월간 패키지 (일간)",
            pyroxeneDelta: 40,
            repeatIntervalDays: 1,
            repeatCount: 3,
          },
        },
      ],
      defaultOptions,
    );

    const packageEntries = timeline.filter((entry) => entry.source.uid === "daily-package");

    expect(packageEntries).toHaveLength(3);
    expect(packageEntries.map((entry) => entry.date.format("YYYY-MM-DD"))).toEqual([
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  it("applies attendance rewards on day 5 and day 10 recurring patterns", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map(),
      [
        futureEvent("2026-01-25T00:00:00.000Z"),
        {
          repeatedGain: {
            uid: "attendance-5",
            source: "attendance",
            date: new Date("2026-01-05T00:00:00.000Z"),
            description: "출석 5일차",
            pyroxeneDelta: 50,
            repeatIntervalDays: 10,
          },
        },
        {
          repeatedGain: {
            uid: "attendance-10",
            source: "attendance",
            date: new Date("2026-01-10T00:00:00.000Z"),
            description: "출석 10일차",
            pyroxeneDelta: 100,
            repeatIntervalDays: 10,
          },
        },
      ],
      defaultOptions,
    );

    const attendanceEntries = timeline.filter((entry) => entry.source.type === "attendance");

    expect(attendanceEntries.map((entry) => [entry.date.format("YYYY-MM-DD"), entry.resourceDelta.pyroxene])).toEqual([
      ["2026-01-05", 50],
      ["2026-01-10", 100],
      ["2026-01-15", 50],
      ["2026-01-20", 100],
    ]);
  });

  it("calculates total assault and elimination rewards from planner options", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map(),
      [
        {
          raid: {
            uid: "raid-total",
            type: "total_assault",
            name: "비나",
            since: "2026-01-02T00:00:00.000Z",
            until: "2026-01-03T00:00:00.000Z",
          },
        },
        {
          raid: {
            uid: "raid-elimination",
            type: "elimination",
            name: "고즈",
            since: "2026-01-04T00:00:00.000Z",
            until: "2026-01-05T00:00:00.000Z",
          },
        },
      ],
      { ...defaultOptions, raid: { tier: "gold" } },
    );

    const raidEntries = timeline.filter((entry) => entry.source.type === "raid");

    expect(raidEntries.map((entry) => [entry.source.description, entry.resourceDelta])).toEqual([
      ["총력전 비나", { pyroxene: 1650, oneTimeTicket: 0, tenTimeTicket: 0 }],
      ["대결전 고즈", { pyroxene: 650, oneTimeTicket: 0, tenTimeTicket: 1 }],
      ["대결전 10회 모집 티켓 만료", { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: -1 }],
    ]);
  });

  it("expires unused elimination ten-time tickets at the end of the next month", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-04-01T00:00:00.000Z"),
      new Map(),
      [
        {
          raid: {
            uid: "raid-elimination",
            type: "elimination",
            name: "고즈",
            since: "2026-04-13T00:00:00.000Z",
            until: "2026-04-20T00:00:00.000Z",
          },
        },
      ],
      defaultOptions,
    );

    const expiryEntry = timeline.find((entry) => entry.source.uid === "raid-elimination::ten-time-ticket-expiry");

    expect(expiryEntry).toEqual(
      expect.objectContaining({
        resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: -1 },
        accumulatedResources: { pyroxene: 1650, oneTimeTicket: 0, tenTimeTicket: 0 },
      }),
    );
    expect(expiryEntry?.date.format("YYYY-MM-DD")).toBe("2026-05-31");
  });

  it("allows elimination ten-time tickets to be spent on their expiration date", () => {
    const timeline = buildTimeline(
      { pyroxene: 1000, oneTimeTicket: 0, tenTimeTicket: 0 },
      new Date("2026-04-01T00:00:00.000Z"),
      new Map([["pickup-event", { completed: false, expectedTrials: 10 }]]),
      [
        {
          raid: {
            uid: "raid-elimination",
            type: "elimination",
            name: "고즈",
            since: "2026-04-13T00:00:00.000Z",
            until: "2026-04-20T00:00:00.000Z",
          },
        },
        {
          event: {
            uid: "pickup-event",
            name: "만료일 픽업",
            since: "2026-05-31T00:00:00.000Z",
            until: "2026-06-05T00:00:00.000Z",
            earnablePyroxene: null,
            recruitments: [favoritedPickupRecruitment()],
          },
        },
      ],
      defaultOptions,
    );

    const pickupEntry = timeline.find((entry) => entry.source.event?.uid === "pickup-event");
    const expiryEntry = timeline.find((entry) => entry.source.uid === "raid-elimination::ten-time-ticket-expiry");

    expect(pickupEntry).toEqual(
      expect.objectContaining({
        resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: -1 },
        accumulatedResources: expect.objectContaining({ oneTimeTicket: 0, tenTimeTicket: 0 }),
      }),
    );
    expect(expiryEntry).toBeUndefined();
  });

  it("does not spend expired elimination ten-time tickets after the expiration date", () => {
    const timeline = buildTimeline(
      { pyroxene: 2000, oneTimeTicket: 0, tenTimeTicket: 0 },
      new Date("2026-04-01T00:00:00.000Z"),
      new Map([["pickup-event", { completed: false, expectedTrials: 10 }]]),
      [
        {
          raid: {
            uid: "raid-elimination",
            type: "elimination",
            name: "고즈",
            since: "2026-04-13T00:00:00.000Z",
            until: "2026-04-20T00:00:00.000Z",
          },
        },
        {
          event: {
            uid: "pickup-event",
            name: "만료 후 픽업",
            since: "2026-06-01T00:00:00.000Z",
            until: "2026-06-05T00:00:00.000Z",
            earnablePyroxene: null,
            recruitments: [favoritedPickupRecruitment()],
          },
        },
      ],
      defaultOptions,
    );

    const pickupEntry = timeline.find((entry) => entry.source.event?.uid === "pickup-event");

    expect(timeline.find((entry) => entry.source.uid === "raid-elimination::ten-time-ticket-expiry")).toEqual(
      expect.objectContaining({
        resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: -1 },
      }),
    );
    expect(pickupEntry).toEqual(
      expect.objectContaining({
        resourceDelta: { pyroxene: -1200, oneTimeTicket: 0, tenTimeTicket: 0 },
      }),
    );
  });

  it("spends elimination ten-time tickets with the earliest expiration first", () => {
    const timeline = buildTimeline(
      { pyroxene: 1000, oneTimeTicket: 0, tenTimeTicket: 0 },
      new Date("2026-04-01T00:00:00.000Z"),
      new Map([["pickup-event", { completed: false, expectedTrials: 10 }]]),
      [
        {
          raid: {
            uid: "raid-april",
            type: "elimination",
            name: "고즈",
            since: "2026-04-13T00:00:00.000Z",
            until: "2026-04-20T00:00:00.000Z",
          },
        },
        {
          raid: {
            uid: "raid-may",
            type: "elimination",
            name: "시로쿠로",
            since: "2026-05-13T00:00:00.000Z",
            until: "2026-05-20T00:00:00.000Z",
          },
        },
        {
          event: {
            uid: "pickup-event",
            name: "픽업",
            since: "2026-05-25T00:00:00.000Z",
            until: "2026-06-05T00:00:00.000Z",
            earnablePyroxene: null,
            recruitments: [favoritedPickupRecruitment()],
          },
        },
      ],
      defaultOptions,
    );

    expect(timeline.find((entry) => entry.source.uid === "raid-april::ten-time-ticket-expiry")).toBeUndefined();
    expect(timeline.find((entry) => entry.source.uid === "raid-may::ten-time-ticket-expiry")).toEqual(
      expect.objectContaining({
        date: expect.objectContaining({}),
        resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: -1 },
      }),
    );
  });

  it("spends ten-time tickets, one-time tickets, then pyroxene for pickup trials", () => {
    const timeline = buildTimeline(
      { pyroxene: 1000, oneTimeTicket: 3, tenTimeTicket: 2 },
      new Date("2026-01-01T00:00:00.000Z"),
      new Map([["pickup-event", { completed: false, expectedTrials: 26 }]]),
      [
        {
          event: {
            uid: "pickup-event",
            name: "픽업 이벤트",
            since: "2026-01-02T00:00:00.000Z",
            until: "2026-01-10T00:00:00.000Z",
            earnablePyroxene: null,
            recruitments: [favoritedPickupRecruitment()],
          },
        },
      ],
      defaultOptions,
    );

    const pickupEntry = timeline.find((entry) => entry.source.event?.uid === "pickup-event");

    expect(pickupEntry).toEqual(
      expect.objectContaining({
        resourceDelta: { pyroxene: -360, oneTimeTicket: -3, tenTimeTicket: -2 },
        accumulatedResources: { pyroxene: 640, oneTimeTicket: 0, tenTimeTicket: 0 },
      }),
    );
  });

  it("keeps an event row when expected trials is zero", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map([["zero-event", { completed: false, expectedTrials: 0 }]]),
      [
        {
          event: {
            uid: "zero-event",
            name: "0회 모집",
            since: "2026-01-02T00:00:00.000Z",
            until: "2026-01-10T00:00:00.000Z",
            earnablePyroxene: null,
            recruitments: [
              {
                recruitmentType: RecruitmentTypeEnum.Usual,
                pickup: true,
                rerun: false,
                student: { uid: "student-1", name: "학생", initialTier: 3 },
                favorited: true,
              },
            ],
          },
        },
      ],
      defaultOptions,
    );

    const zeroEventEntry = timeline.find((entry) => entry.source.event?.uid === "zero-event");

    expect(zeroEventEntry).toEqual(
      expect.objectContaining({
        resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
        accumulatedResources: initialResources,
      }),
    );
  });

  it("ignores stale expected trials when there are no favorited pickup students", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map([["stale-target-event", { completed: false, expectedTrials: 140 }]]),
      [
        {
          event: {
            uid: "stale-target-event",
            name: "관심 해제 이벤트",
            since: "2026-01-02T00:00:00.000Z",
            until: "2026-01-10T00:00:00.000Z",
            earnablePyroxene: null,
            recruitments: [{ ...favoritedPickupRecruitment(), favorited: false }],
          },
        },
      ],
      defaultOptions,
    );

    expect(timeline.find((entry) => entry.source.event?.uid === "stale-target-event")).toBeUndefined();
  });

  it("generates daily, weekly, and tactical rewards until the event horizon", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map(),
      [futureEvent("2026-01-15T00:00:00.000Z")],
      defaultOptions,
    );

    expect(timeline.filter((entry) => entry.source.type === "daily_mission")).toHaveLength(13);
    expect(
      timeline
        .filter((entry) => entry.source.type === "weekly_mission")
        .map((entry) => entry.date.format("YYYY-MM-DD")),
    ).toEqual(["2026-01-04", "2026-01-11"]);
    expect(timeline.filter((entry) => entry.source.type === "tactical")).toHaveLength(13);
  });

  it("subtracts daily AP charge pyroxene using charge cost tiers", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map(),
      [futureEvent("2026-01-05T00:00:00.000Z")],
      { ...defaultOptions, consumption: { apChargeCount: 7 } },
    );

    const apChargeEntries = timeline.filter((entry) => entry.source.type === "ap_charge");

    expect(apChargeEntries).toHaveLength(3);
    expect(apChargeEntries.map((entry) => [entry.date.format("YYYY-MM-DD"), entry.resourceDelta.pyroxene])).toEqual([
      ["2026-01-02", -370],
      ["2026-01-03", -370],
      ["2026-01-04", -370],
    ]);
  });

  it("caps open-ended repeated gains at the maximum repeated entry count", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map(),
      [
        futureEvent("2027-06-01T00:00:00.000Z"),
        {
          repeatedGain: {
            uid: "open-ended",
            source: "other",
            date: new Date("2026-01-02T00:00:00.000Z"),
            description: "장기 반복",
            pyroxeneDelta: 1,
            repeatIntervalDays: 1,
          },
        },
      ],
      defaultOptions,
    );

    expect(timeline.filter((entry) => entry.source.uid === "open-ended")).toHaveLength(365);
  });

  it("emits event reward pyroxene at event end", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map(),
      [
        {
          event: {
            uid: "reward-event",
            name: "보상 이벤트",
            since: "2026-01-02T00:00:00.000Z",
            until: "2026-01-10T00:00:00.000Z",
            earnablePyroxene: 1200,
            recruitments: [],
          },
        },
      ],
      defaultOptions,
    );

    const rewardEntry = timeline.find((entry) => entry.source.type === "event_reward");

    expect(rewardEntry).toEqual(
      expect.objectContaining({
        date: expect.objectContaining({}),
        resourceDelta: { pyroxene: 1200, oneTimeTicket: 0, tenTimeTicket: 0 },
        source: { type: "event_reward", description: "보상 이벤트" },
      }),
    );
    expect(rewardEntry?.date.format("YYYY-MM-DD")).toBe("2026-01-10");
  });

  it("keeps completed pickup events as zero-delta rows", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map([["completed-event", { completed: true, expectedTrials: null }]]),
      [
        {
          event: {
            uid: "completed-event",
            name: "완료 이벤트",
            since: "2026-01-02T00:00:00.000Z",
            until: "2026-01-10T00:00:00.000Z",
            earnablePyroxene: null,
            recruitments: [
              {
                recruitmentType: RecruitmentTypeEnum.Usual,
                pickup: true,
                rerun: false,
                student: { uid: "student-1", name: "학생", initialTier: 3 },
                favorited: true,
              },
            ],
          },
        },
      ],
      defaultOptions,
    );

    expect(timeline.find((entry) => entry.source.event?.uid === "completed-event")).toEqual(
      expect.objectContaining({
        resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
        accumulatedResources: initialResources,
      }),
    );
  });

  it("keeps in-progress events that started before the initial date", () => {
    const timeline = buildTimeline(
      initialResources,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map([["ongoing-event", { completed: false, expectedTrials: 0 }]]),
      [
        {
          event: {
            uid: "ongoing-event",
            name: "진행 중 이벤트",
            since: "2025-12-25T00:00:00.000Z",
            until: "2026-01-10T00:00:00.000Z",
            earnablePyroxene: null,
            recruitments: [favoritedPickupRecruitment()],
          },
        },
      ],
      defaultOptions,
    );

    expect(timeline.find((entry) => entry.source.event?.uid === "ongoing-event")).toBeDefined();
  });

  it("calculates pickup trials from favorited pickup recruitments when expected trials is omitted", () => {
    const timeline = buildTimeline(
      { pyroxene: 20000, oneTimeTicket: 0, tenTimeTicket: 0 },
      new Date("2026-01-01T00:00:00.000Z"),
      new Map(),
      [
        {
          event: {
            uid: "favorited-pickup",
            name: "관심 픽업",
            since: "2026-01-02T00:00:00.000Z",
            until: "2026-01-10T00:00:00.000Z",
            earnablePyroxene: null,
            recruitments: [
              {
                recruitmentType: RecruitmentTypeEnum.Usual,
                pickup: true,
                rerun: false,
                student: { uid: "student-1", name: "학생", initialTier: 3 },
                favorited: true,
              },
              {
                recruitmentType: RecruitmentTypeEnum.Given,
                pickup: true,
                rerun: false,
                student: { uid: "student-2", name: "배포 학생", initialTier: 1 },
                favorited: true,
              },
            ],
          },
        },
      ],
      defaultOptions,
    );

    const pickupEntry = timeline.find((entry) => entry.source.event?.uid === "favorited-pickup");

    expect(pickupEntry?.resourceDelta.pyroxene).toBe(-16800);
    expect(Math.abs(pickupEntry?.resourceDelta.oneTimeTicket ?? Number.NaN)).toBe(0);
    expect(Math.abs(pickupEntry?.resourceDelta.tenTimeTicket ?? Number.NaN)).toBe(0);
    expect(pickupEntry?.accumulatedResources).toEqual({ pyroxene: 3200, oneTimeTicket: 0, tenTimeTicket: 0 });
  });
});
