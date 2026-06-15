import { describe, expect, it } from "@jest/globals";
import type { PyroxeneScheduleItem } from "~/components/features/futures/types";
import { RecruitmentTypeEnum } from "~/graphql/graphql";
import type { PyroxenePlannerOptions } from "./pyroxene-planner";
import {
  type PickupResources,
  buildTimeline,
  calculatePickupTrialMoments,
} from "./pyroxene-timeline";

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
}: {
  uid: string;
  since?: string;
  until?: string;
  recruitments?: NonNullable<PyroxeneScheduleItem["event"]>["recruitments"];
}): PyroxeneScheduleItem {
  return {
    event: {
      uid,
      name: uid,
      since,
      until,
      earnablePyroxene: null,
      tags: [],
      recruitments,
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
  it("keeps the optimistic balance above the central balance and the central balance above the pessimistic balance", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [
        eventItem({
          uid: "event-a",
          until: "2026-07-05T00:00:00.000Z",
        }),
      ],
    });

    for (const entry of timeline) {
      expect(entry.accumulatedResourcesBand?.optimistic.pyroxene).toBeGreaterThanOrEqual(
        entry.accumulatedResources.pyroxene,
      );
      expect(entry.accumulatedResources.pyroxene).toBeGreaterThanOrEqual(
        entry.accumulatedResourcesBand?.pessimistic.pyroxene ?? Number.POSITIVE_INFINITY,
      );
    }
  });

  it("keeps the existing central average path resource spending unchanged", () => {
    const timeline = buildTestTimeline({
      initialResources: {
        pyroxene: 24_000,
        oneTimeTicket: 5,
        tenTimeTicket: 1,
      },
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.resourceDelta).toEqual({
      pyroxene: -15_000,
      oneTimeTicket: -5,
      tenTimeTicket: -1,
    });
    expect(eventEntry?.accumulatedResources).toEqual({
      pyroxene: 9_000,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    });
    expect(timeline.map((entry) => entry.accumulatedResources.pyroxene)).toEqual([9_000, 9_020, 9_040]);
  });

  it("grows the band width with the square root of the pickup count, not linearly", () => {
    const pickupEvent = (uid: string, since: string, until: string) =>
      eventItem({ uid, since, until, recruitments: [pickupRecruitment({ name: uid })] });
    const timeline = buildTestTimeline({
      initialResources: { pyroxene: 1_000_000, oneTimeTicket: 0, tenTimeTicket: 0 },
      scheduleItems: [
        pickupEvent("p1", "2026-07-02T00:00:00.000Z", "2026-07-03T00:00:00.000Z"),
        pickupEvent("p2", "2026-07-10T00:00:00.000Z", "2026-07-11T00:00:00.000Z"),
        pickupEvent("p3", "2026-07-18T00:00:00.000Z", "2026-07-19T00:00:00.000Z"),
        pickupEvent("p4", "2026-07-26T00:00:00.000Z", "2026-07-27T00:00:00.000Z"),
      ],
    });
    const bandWidthAt = (uid: string) => {
      const entry = timeline.find((item) => item.source.event?.uid === uid);
      return (
        (entry?.accumulatedResourcesBand?.optimistic.pyroxene ?? 0) -
        (entry?.accumulatedResourcesBand?.pessimistic.pyroxene ?? 0)
      );
    };

    // 동일한 픽업 4개 이후 폭은 1개 이후의 √4 = 2배여야 합니다(선형이면 4배).
    expect(bandWidthAt("p4") / bandWidthAt("p1")).toBeCloseTo(2, 5);
  });

  it("still simulates the variance band for a manual expectedTrials event", () => {
    const timeline = buildTestTimeline({
      eventDataMap: new Map([["event-a", { completed: false, expectedTrials: 50 }]]),
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    // 수동 입력값(50회 = 6,000 청휘석)이 중앙값으로 유지되어야 합니다.
    expect(eventEntry?.resourceDelta.pyroxene).toBe(-6_000);
    // 수동 입력 여부와 무관하게 확률 기반 밴드가 펼쳐져야 합니다.
    expect(eventEntry?.accumulatedResourcesBand?.optimistic.pyroxene).toBeGreaterThan(
      eventEntry?.accumulatedResources.pyroxene ?? 0,
    );
    expect(eventEntry?.accumulatedResources.pyroxene).toBeGreaterThan(
      eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene ?? Number.POSITIVE_INFINITY,
    );
  });
});
