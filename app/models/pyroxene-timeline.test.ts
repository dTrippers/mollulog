import { describe, expect, it } from "@jest/globals";
import type { PyroxeneScheduleItem } from "~/components/features/futures/types";
import { RecruitmentTypeEnum } from "~/graphql/graphql";
import type { PyroxenePlannerOptions } from "./pyroxene-planner";
import { type PickupResources, buildTimeline, calculatePickupTrialMoments } from "./pyroxene-timeline";

const defaultOptions: PyroxenePlannerOptions = {
  event: {
    pickupChance: "average",
  },
  raid: {
    tier: "platinum",
  },
  tactical: {
    level: "over200",
  },
  consumption: {
    apChargeCount: 0,
  },
  timeline: {
    display: [],
  },
};

function pickupRecruitment({
  initialTier = 3,
  name = "픽업 학생",
}: {
  initialTier?: number;
  name?: string;
} = {}): NonNullable<PyroxeneScheduleItem["event"]>["recruitments"][number] {
  return {
    recruitmentType: RecruitmentTypeEnum.Usual,
    pickup: true,
    rerun: false,
    until: "2026-07-05T00:00:00.000Z",
    student: { uid: `student-${initialTier}-${name}`, name, initialTier },
    favorited: true,
  };
}

function eventItem({
  uid,
  since = "2026-07-02T00:00:00.000Z",
  until = "2026-07-03T00:00:00.000Z",
  recruitments = [pickupRecruitment()],
  recruitmentPool = { tier2Count: 150, tier3Count: 202 },
  tags = [],
}: {
  uid: string;
  since?: string;
  until?: string;
  recruitments?: NonNullable<PyroxeneScheduleItem["event"]>["recruitments"];
  recruitmentPool?: NonNullable<PyroxeneScheduleItem["event"]>["recruitmentPool"];
  tags?: string[];
}): PyroxeneScheduleItem {
  return {
    event: {
      uid,
      name: uid,
      since,
      until,
      earnablePyroxene: null,
      tags,
      recruitments,
      recruitmentPool,
    },
  };
}

function buildTestTimeline({
  initialResources = { pyroxene: 100_000, oneTimeTicket: 0, tenTimeTicket: 0 },
  eventDataMap = new Map<string, { completed: boolean; expectedTrials: number | null }>(),
  scheduleItems = [eventItem({ uid: "event-a" })],
  options = defaultOptions,
}: {
  initialResources?: PickupResources;
  eventDataMap?: Map<string, { completed: boolean; expectedTrials: number | null }>;
  scheduleItems?: PyroxeneScheduleItem[];
  options?: PyroxenePlannerOptions;
} = {}) {
  return buildTimeline(initialResources, new Date("2026-07-01T00:00:00.000Z"), eventDataMap, scheduleItems, options);
}

describe("calculatePickupTrialMoments", () => {
  it("calculates capped geometric mean and variance for three-star pickup rates", () => {
    const { mean, variance } = calculatePickupTrialMoments(0.007);
    // 천장 200으로 상한이 걸린 기하분포: 평균 ≈ 108, 표준편차 ≈ 71.
    expect(mean).toBeCloseTo(107.8, 0);
    expect(Math.sqrt(variance)).toBeCloseTo(71.1, 0);
  });

  it("calculates smaller mean and variance for two-star pickup rates", () => {
    const { mean, variance } = calculatePickupTrialMoments(0.03);
    expect(mean).toBeCloseTo(33.3, 0);
    expect(Math.sqrt(variance)).toBeCloseTo(32.4, 0);
  });

  it("returns the pity ceiling with zero variance when pickup rate is not positive", () => {
    expect(calculatePickupTrialMoments(0)).toEqual({ mean: 200, variance: 0 });
    expect(calculatePickupTrialMoments(-0.1)).toEqual({ mean: 200, variance: 0 });
  });
});

describe("buildTimeline pyroxene balance band", () => {
  it("calculates the average-mode central path and band from actual pickup probability", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [
        eventItem({
          uid: "event-a",
          until: "2026-07-05T00:00:00.000Z",
        }),
      ],
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.accumulatedResources.pyroxene).toBe(87_040);
    expect(eventEntry?.accumulatedResourcesBand?.optimistic.pyroxene).toBeGreaterThan(87_040);
    // 3성 픽업의 90분위 모집 횟수는 천장인 200회에 도달합니다.
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(76_000);
  });

  it("uses the DP average central path while keeping ticket spending order unchanged", () => {
    const timeline = buildTestTimeline({
      initialResources: {
        pyroxene: 24_000,
        oneTimeTicket: 5,
        tenTimeTicket: 1,
      },
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.resourceDelta).toEqual({
      pyroxene: -11_160,
      oneTimeTicket: -5,
      tenTimeTicket: -1,
    });
    expect(eventEntry?.accumulatedResources).toEqual({
      pyroxene: 12_840,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    });
    expect(timeline.map((entry) => entry.accumulatedResources.pyroxene)).toEqual([12_840, 12_860, 12_880]);
  });

  it("uses the paid-trial DP expectation for average-mode free recruitment events", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [
        eventItem({
          uid: "event-a",
          tags: ["recruit_free_100"],
          until: "2026-07-05T00:00:00.000Z",
        }),
      ],
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.resourceDelta.pyroxene).toBe(-4_320);
    expect(eventEntry?.accumulatedResources.pyroxene).toBe(95_680);
  });

  it("keeps the ceiling-mode pessimistic band at the ceiling baseline", () => {
    const timeline = buildTestTimeline({
      options: {
        ...defaultOptions,
        event: { pickupChance: "ceil" },
      },
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.accumulatedResources.pyroxene).toBe(76_000);
    expect(eventEntry?.accumulatedResourcesBand?.optimistic.pyroxene).toBeGreaterThan(76_000);
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(76_000);
  });

  it("does not add a probability band for a manual expectedTrials event", () => {
    const timeline = buildTestTimeline({
      eventDataMap: new Map([["event-a", { completed: false, expectedTrials: 50 }]]),
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.resourceDelta.pyroxene).toBe(-6_000);
    expect(eventEntry?.accumulatedResourcesBand).toBeUndefined();
  });

  it("keeps a ceiling-mode multi-pickup central path inside the probability band", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [
        eventItem({
          uid: "event-a",
          recruitments: [pickupRecruitment({ name: "픽업 학생 A" }), pickupRecruitment({ name: "픽업 학생 B" })],
        }),
      ],
      options: {
        ...defaultOptions,
        event: { pickupChance: "ceil" },
      },
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.accumulatedResources.pyroxene).toBe(52_000);
    expect(eventEntry?.accumulatedResourcesBand?.optimistic.pyroxene).toBeGreaterThan(52_000);
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(52_000);
  });

  it("applies recruitment tickets when calculating the probability band", () => {
    const timeline = buildTestTimeline({
      initialResources: {
        pyroxene: 100_000,
        oneTimeTicket: 9,
        tenTimeTicket: 20,
      },
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.accumulatedResources).toEqual({
      pyroxene: 100_000,
      oneTimeTicket: 1,
      tenTimeTicket: 10,
    });
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(100_000);
  });

  it("uses shared pickup DP for same-banner multi-pickup bands", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [
        eventItem({
          uid: "event-a",
          recruitments: [pickupRecruitment({ name: "픽업 학생 A" }), pickupRecruitment({ name: "픽업 학생 B" })],
          recruitmentPool: { tier2Count: 150, tier3Count: 202 },
        }),
      ],
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.accumulatedResources.pyroxene).toBe(77_080);
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(61_240);
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBeGreaterThan(56_560);
  });
});
