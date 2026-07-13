import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { normalizePyroxenePlannerOptions, type PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import {
  buildTimeline,
  calculatePickupTrialMoments,
  type PickupResources,
  type PyroxeneTimelineBandMode,
} from "~/domain/pyroxene-timeline";
import { RecruitmentTypeEnum } from "~/graphql/graphql";

jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupsByUids: jest.fn(),
  getRecruitmentPoolStudents: jest.fn(),
}));
jest.mock("~/models/raid", () => ({ getRaidSchedule: jest.fn() }));
jest.mock("~/models/student", () => ({ getAllStudentsMap: jest.fn() }));
jest.mock("~/models/timeline-content.server", () => ({
  getFutureRaidContents: jest.fn(),
  getTimelineContents: jest.fn(),
}));

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
  earnablePyroxene = null,
  recruitments = [pickupRecruitment()],
  recruitmentPool = { tier2Count: 150, tier3Count: 202 },
  tags = [],
}: {
  uid: string;
  since?: string;
  until?: string;
  earnablePyroxene?: number | null;
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
      earnablePyroxene,
      tags,
      recruitments,
      recruitmentPool,
    },
  };
}

function raidItem({
  uid,
  type,
  name,
  since = "2026-07-02T00:00:00.000Z",
  until = "2026-07-03T00:00:00.000Z",
}: {
  uid: string;
  type: NonNullable<PyroxeneScheduleItem["raid"]>["type"];
  name: string;
  since?: string;
  until?: string;
}): PyroxeneScheduleItem {
  return {
    raid: {
      uid,
      type,
      name,
      since,
      until,
    },
  };
}

function buildTestTimeline({
  initialResources = { pyroxene: 100_000, oneTimeTicket: 0, tenTimeTicket: 0 },
  initialDate = new Date("2026-07-01T00:00:00.000Z"),
  eventDataMap = new Map<string, { completed: boolean; expectedTrials: number | null }>(),
  scheduleItems = [eventItem({ uid: "event-a" })],
  options = defaultOptions,
  bandMode,
  collectedSourceKeys = [],
}: {
  initialResources?: PickupResources;
  initialDate?: Date;
  eventDataMap?: Map<string, { completed: boolean; expectedTrials: number | null }>;
  scheduleItems?: PyroxeneScheduleItem[];
  options?: PyroxenePlannerOptions;
  bandMode?: PyroxeneTimelineBandMode;
  collectedSourceKeys?: string[];
} = {}) {
  return buildTimeline(
    initialResources,
    initialDate,
    eventDataMap,
    scheduleItems,
    options,
    bandMode,
    collectedSourceKeys,
  );
}

function getMaxBandDelta(left: ReturnType<typeof buildTestTimeline>, right: ReturnType<typeof buildTestTimeline>) {
  let optimistic = 0;
  let pessimistic = 0;
  let central = 0;
  const count = Math.min(left.length, right.length);

  for (let index = 0; index < count; index++) {
    central = Math.max(
      central,
      Math.abs(left[index].accumulatedResources.pyroxene - right[index].accumulatedResources.pyroxene),
    );

    const leftOptimistic = left[index].accumulatedResourcesBand?.optimistic.pyroxene;
    const rightOptimistic = right[index].accumulatedResourcesBand?.optimistic.pyroxene;
    if (leftOptimistic !== undefined && rightOptimistic !== undefined) {
      optimistic = Math.max(optimistic, Math.abs(leftOptimistic - rightOptimistic));
    }

    const leftPessimistic = left[index].accumulatedResourcesBand?.pessimistic.pyroxene;
    const rightPessimistic = right[index].accumulatedResourcesBand?.pessimistic.pyroxene;
    if (leftPessimistic !== undefined && rightPessimistic !== undefined) {
      pessimistic = Math.max(pessimistic, Math.abs(leftPessimistic - rightPessimistic));
    }
  }

  return { optimistic, pessimistic, central };
}

function ticketGainItem({
  uid = "ticket-gain",
  date = "2026-07-03T00:00:00.000Z",
  oneTimeTicketDelta = 0,
  tenTimeTicketDelta = 1,
}: {
  uid?: string;
  date?: string;
  oneTimeTicketDelta?: number;
  tenTimeTicketDelta?: number;
} = {}): PyroxeneScheduleItem {
  return {
    onetimeGain: {
      uid,
      source: "other",
      description: "모집 티켓 획득",
      date: new Date(date),
      oneTimeTicketDelta,
      tenTimeTicketDelta,
    },
  };
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

describe("normalizePyroxenePlannerOptions", () => {
  it("keeps stored pickupChance values and falls back to average_pity for missing or unknown values", () => {
    expect(normalizePyroxenePlannerOptions(null).event.pickupChance).toBe("average_pity");
    expect(normalizePyroxenePlannerOptions({}).event.pickupChance).toBe("average_pity");
    expect(normalizePyroxenePlannerOptions({ event: { pickupChance: "average" } }).event.pickupChance).toBe("average");
    expect(normalizePyroxenePlannerOptions({ event: { pickupChance: "average_pity" } }).event.pickupChance).toBe(
      "average_pity",
    );
    expect(normalizePyroxenePlannerOptions({ event: { pickupChance: "ceil" } }).event.pickupChance).toBe("ceil");
    expect(
      normalizePyroxenePlannerOptions({
        event: { pickupChance: "unexpected" as PyroxenePlannerOptions["event"]["pickupChance"] },
      }).event.pickupChance,
    ).toBe("average_pity");
  });
});

describe("buildTimeline collected sources", () => {
  it("ignores collected raid source keys for total assault rewards", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [raidItem({ uid: "raid-total", type: "total_assault", name: "비나" })],
      options: { ...defaultOptions, raid: { tier: "gold" } },
      collectedSourceKeys: ["raid:raid-total"],
    });

    const raidEntry = timeline.find((entry) => entry.source.uid === "raid-total");

    expect(raidEntry).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({
          type: "raid",
          uid: "raid-total",
          description: "총력전 비나",
        }),
        resourceDelta: { pyroxene: 1_650, oneTimeTicket: 0, tenTimeTicket: 0 },
        accumulatedResources: { pyroxene: 101_650, oneTimeTicket: 0, tenTimeTicket: 0 },
      }),
    );
    expect(raidEntry?.source.collectedSourceKey).toBeUndefined();
  });

  it("ignores collected raid source keys for elimination rewards", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [raidItem({ uid: "raid-elimination", type: "elimination", name: "고즈" })],
      collectedSourceKeys: ["raid:raid-elimination"],
    });

    const raidEntries = timeline.filter((entry) => entry.source.type === "raid");

    expect(raidEntries).toHaveLength(2);
    const rewardEntry = timeline.find((entry) => entry.source.uid === "raid-elimination");
    expect(rewardEntry).toEqual(
      expect.objectContaining({
        date: expect.objectContaining({}),
        source: expect.objectContaining({
          uid: "raid-elimination",
          description: "대결전 고즈",
        }),
        resourceDelta: { pyroxene: 650, oneTimeTicket: 0, tenTimeTicket: 1 },
        accumulatedResources: { pyroxene: 100_650, oneTimeTicket: 0, tenTimeTicket: 1 },
      }),
    );
    expect(rewardEntry?.date.format("YYYY-MM-DD")).toBe("2026-07-31");
    expect(rewardEntry?.source.collectedSourceKey).toBeUndefined();
    expect(timeline.find((entry) => entry.source.uid === "raid-elimination::ten-time-ticket-expiry")).toBeDefined();
  });

  it("keeps a zero-delta event reward row when the event reward is already collected", () => {
    const timeline = buildTestTimeline({
      initialResources: { pyroxene: 10_000, oneTimeTicket: 0, tenTimeTicket: 0 },
      initialDate: new Date("2026-07-02T00:00:00.000Z"),
      scheduleItems: [
        eventItem({
          uid: "reward-event",
          earnablePyroxene: 1_200,
          recruitments: [],
          recruitmentPool: undefined,
        }),
      ],
      collectedSourceKeys: ["event_reward:reward-event"],
    });

    const rewardEntry = timeline.find((entry) => entry.source.collectedSourceKey === "event_reward:reward-event");

    expect(rewardEntry).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({
          type: "event_reward",
          uid: "reward-event",
          description: "reward-event",
          collectedSourceKey: "event_reward:reward-event",
        }),
        resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
        accumulatedResources: { pyroxene: 10_000, oneTimeTicket: 0, tenTimeTicket: 0 },
      }),
    );
    expect(rewardEntry?.date.format("YYYY-MM-DD")).toBe("2026-07-03");
  });

  it("keeps existing raid and event reward behavior when sources are not collected", () => {
    const timeline = buildTestTimeline({
      initialResources: { pyroxene: 10_000, oneTimeTicket: 0, tenTimeTicket: 0 },
      initialDate: new Date("2026-07-02T00:00:00.000Z"),
      scheduleItems: [
        raidItem({ uid: "raid-total", type: "total_assault", name: "비나" }),
        raidItem({ uid: "raid-elimination", type: "elimination", name: "고즈" }),
        eventItem({
          uid: "reward-event",
          earnablePyroxene: 1_200,
          recruitments: [],
          recruitmentPool: undefined,
        }),
      ],
      options: { ...defaultOptions, raid: { tier: "gold" } },
    });

    expect(timeline.find((entry) => entry.source.uid === "raid-total")?.resourceDelta).toEqual({
      pyroxene: 1_650,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    });
    expect(timeline.find((entry) => entry.source.uid === "raid-elimination")?.resourceDelta).toEqual({
      pyroxene: 650,
      oneTimeTicket: 0,
      tenTimeTicket: 1,
    });
    expect(timeline.find((entry) => entry.source.uid === "raid-elimination::ten-time-ticket-expiry")).toEqual(
      expect.objectContaining({
        resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: -1 },
      }),
    );
    expect(timeline.find((entry) => entry.source.uid === "reward-event")?.resourceDelta).toEqual({
      pyroxene: 1_200,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    });
  });
});

describe("buildTimeline pyroxene balance band", () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date("2026-07-01T00:00:00.000Z") });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("calculates the average-mode linear central path while keeping the uncapped probability band", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [
        eventItem({
          uid: "event-a",
          until: "2026-07-05T00:00:00.000Z",
        }),
      ],
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.accumulatedResources.pyroxene).toBe(83_200);
    expect(eventEntry?.accumulatedResourcesBand?.optimistic.pyroxene).toBeGreaterThan(83_200);
    // 천장 미반영 모드는 3성 픽업의 90분위가 200회를 넘어섭니다.
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(60_640);
  });

  it("uses the average_pity DP central path from actual pickup probability", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [
        eventItem({
          uid: "event-a",
          until: "2026-07-05T00:00:00.000Z",
        }),
      ],
      options: {
        ...defaultOptions,
        event: { pickupChance: "average_pity" },
      },
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.accumulatedResources.pyroxene).toBe(87_040);
    expect(eventEntry?.accumulatedResourcesBand?.optimistic.pyroxene).toBeGreaterThan(87_040);
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(76_000);
  });

  it("uses the average-mode linear central path while keeping ticket spending order unchanged", () => {
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

  it("uses the average_pity DP central path while keeping ticket spending order unchanged", () => {
    const timeline = buildTestTimeline({
      initialResources: {
        pyroxene: 24_000,
        oneTimeTicket: 5,
        tenTimeTicket: 1,
      },
      options: {
        ...defaultOptions,
        event: { pickupChance: "average_pity" },
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

  it("subtracts free recruitment trials from the average-mode linear central path", () => {
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

    expect(eventEntry?.resourceDelta.pyroxene).toBe(-4_800);
    expect(eventEntry?.accumulatedResources.pyroxene).toBe(95_200);
  });

  it("uses the paid-trial DP expectation for average_pity free recruitment events", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [
        eventItem({
          uid: "event-a",
          tags: ["recruit_free_100"],
          until: "2026-07-05T00:00:00.000Z",
        }),
      ],
      options: {
        ...defaultOptions,
        event: { pickupChance: "average_pity" },
      },
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.resourceDelta.pyroxene).toBe(-4_320);
    expect(eventEntry?.accumulatedResources.pyroxene).toBe(95_680);
  });

  it("does not add a probability band for ceiling mode", () => {
    const timeline = buildTestTimeline({
      options: {
        ...defaultOptions,
        event: { pickupChance: "ceil" },
      },
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.accumulatedResources.pyroxene).toBe(76_000);
    expect(eventEntry?.accumulatedResourcesBand).toBeUndefined();
  });

  it("does not add a probability band for a manual expectedTrials event", () => {
    const timeline = buildTestTimeline({
      eventDataMap: new Map([["event-a", { completed: false, expectedTrials: 50 }]]),
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.resourceDelta.pyroxene).toBe(-6_000);
    expect(eventEntry?.accumulatedResourcesBand).toBeUndefined();
  });

  it("does not add a probability band for ceiling-mode multi-pickup events", () => {
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
    expect(eventEntry?.accumulatedResourcesBand).toBeUndefined();
  });

  it("applies central ticket discounts when calculating the default average_pity probability band", () => {
    const timeline = buildTestTimeline({
      initialResources: {
        pyroxene: 100_000,
        oneTimeTicket: 9,
        tenTimeTicket: 20,
      },
      options: {
        ...defaultOptions,
        event: { pickupChance: "average_pity" },
      },
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.accumulatedResources).toEqual({
      pyroxene: 100_000,
      oneTimeTicket: 1,
      tenTimeTicket: 10,
    });
    // 기본 밴드는 중앙선에서 사용한 티켓을 deterministic discount로 반영합니다.
    // 티켓이 많은 단일 이벤트에서는 exact resource-state 밴드보다 비관선이 낮을 수 있습니다.
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(88_960);
  });

  it("keeps resource-state probability bands available as an exact comparison baseline", () => {
    const timeline = buildTestTimeline({
      initialResources: {
        pyroxene: 100_000,
        oneTimeTicket: 9,
        tenTimeTicket: 20,
      },
      options: {
        ...defaultOptions,
        event: { pickupChance: "average_pity" },
      },
      bandMode: "resource_state",
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(100_000);
  });

  it("uses the average-mode linear central path with uncapped bands for same-banner multi-pickup events", () => {
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

    expect(eventEntry?.accumulatedResources.pyroxene).toBe(66_400);
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(34_000);
  });

  it("keeps uncapped average bands wide when ticket spending requires resource-state tracking", () => {
    const timeline = buildTestTimeline({
      initialResources: {
        pyroxene: 200_000,
        oneTimeTicket: 20,
        tenTimeTicket: 1,
      },
      scheduleItems: [
        eventItem({
          uid: "event-a",
          since: "2026-07-02T00:00:00.000Z",
          until: "2026-07-06T00:00:00.000Z",
          recruitments: [pickupRecruitment({ name: "픽업 학생 A" }), pickupRecruitment({ name: "픽업 학생 B" })],
        }),
        eventItem({
          uid: "event-b",
          since: "2026-07-03T00:00:00.000Z",
          until: "2026-07-06T00:00:00.000Z",
          recruitments: [pickupRecruitment({ name: "픽업 학생 C" }), pickupRecruitment({ name: "픽업 학생 D" })],
        }),
        eventItem({
          uid: "event-c",
          since: "2026-07-04T00:00:00.000Z",
          until: "2026-07-06T00:00:00.000Z",
          recruitments: [pickupRecruitment({ name: "픽업 학생 E" }), pickupRecruitment({ name: "픽업 학생 F" })],
        }),
      ],
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-c");

    expect(eventEntry?.accumulatedResources.pyroxene).toBe(102_880);
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBeLessThan(60_000);
  });

  it("switches to ticket-aware bands only after tickets are actually available", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [
        eventItem({
          uid: "event-a",
          since: "2026-07-02T00:00:00.000Z",
          until: "2026-07-06T00:00:00.000Z",
        }),
        ticketGainItem(),
        eventItem({
          uid: "event-b",
          since: "2026-07-04T00:00:00.000Z",
          until: "2026-07-06T00:00:00.000Z",
        }),
      ],
    });
    const firstEventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");
    const secondEventEntry = timeline.find((entry) => entry.source.event?.uid === "event-b");

    expect(firstEventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(60_640);
    expect(secondEventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(34_800);
  });

  it("keeps the simplified ticket band close to resource-state bands on representative fixtures", () => {
    const fourEvents = [
      eventItem({ uid: "event-a", since: "2026-07-02T00:00:00.000Z" }),
      eventItem({ uid: "event-b", since: "2026-07-03T00:00:00.000Z" }),
      eventItem({ uid: "event-c", since: "2026-07-04T00:00:00.000Z" }),
      eventItem({ uid: "event-d", since: "2026-07-05T00:00:00.000Z" }),
    ];
    const fixtures = [
      {
        label: "no tickets",
        initialResources: { pyroxene: 200_000, oneTimeTicket: 0, tenTimeTicket: 0 },
        scheduleItems: fourEvents,
        maxOptimisticDelta: 0,
      },
      {
        label: "one ten-time ticket",
        initialResources: { pyroxene: 200_000, oneTimeTicket: 0, tenTimeTicket: 1 },
        scheduleItems: fourEvents,
        maxOptimisticDelta: 1_200,
      },
      {
        label: "five ten-time tickets",
        initialResources: { pyroxene: 200_000, oneTimeTicket: 0, tenTimeTicket: 5 },
        scheduleItems: fourEvents,
        maxOptimisticDelta: 6_000,
      },
      {
        label: "ticket acquired between events",
        initialResources: { pyroxene: 200_000, oneTimeTicket: 0, tenTimeTicket: 0 },
        scheduleItems: [
          eventItem({ uid: "event-a", since: "2026-07-02T00:00:00.000Z" }),
          ticketGainItem(),
          eventItem({ uid: "event-b", since: "2026-07-04T00:00:00.000Z" }),
          eventItem({ uid: "event-c", since: "2026-07-05T00:00:00.000Z" }),
          eventItem({ uid: "event-d", since: "2026-07-06T00:00:00.000Z" }),
        ],
        maxOptimisticDelta: 1_200,
      },
    ];

    for (const pickupChance of ["average", "average_pity"] as const) {
      for (const fixture of fixtures) {
        const options = { ...defaultOptions, event: { pickupChance } };
        const simplified = buildTestTimeline({ ...fixture, options });
        const resourceState = buildTestTimeline({ ...fixture, options, bandMode: "resource_state" });
        const delta = getMaxBandDelta(simplified, resourceState);

        expect(delta.central).toBe(0);
        expect(delta.pessimistic).toBeLessThanOrEqual(1_200);
        expect(delta.optimistic).toBeLessThanOrEqual(fixture.maxOptimisticDelta);
      }
    }
  });

  it("uses shared pickup DP for same-banner multi-pickup average_pity central path and bands", () => {
    const timeline = buildTestTimeline({
      scheduleItems: [
        eventItem({
          uid: "event-a",
          recruitments: [pickupRecruitment({ name: "픽업 학생 A" }), pickupRecruitment({ name: "픽업 학생 B" })],
          recruitmentPool: { tier2Count: 150, tier3Count: 202 },
        }),
      ],
      options: {
        ...defaultOptions,
        event: { pickupChance: "average_pity" },
      },
    });
    const eventEntry = timeline.find((entry) => entry.source.event?.uid === "event-a");

    expect(eventEntry?.accumulatedResources.pyroxene).toBe(77_080);
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBe(61_240);
    expect(eventEntry?.accumulatedResourcesBand?.pessimistic.pyroxene).toBeGreaterThan(56_560);
  });
});
