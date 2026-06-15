import dayjs from "dayjs";
import type { PyroxeneScheduleItem } from "~/components/features/futures/types";
import type { PyroxenePlannerOptions, TimelineSourceType } from "./pyroxene-planner";
import { calculateDailyApChargePyroxene } from "./pyroxene-planner-source-config";
import { DEFAULT_PICKUP_STUDENT_RATE_BY_TIER } from "./recruitment-simulator";

export type PickupResources = {
  pyroxene: number;
  oneTimeTicket: number;
  tenTimeTicket: number;
};

export type TimelineSource = {
  type: TimelineSourceType;
  event?: PyroxeneScheduleItem["event"];
  description?: string;
  uid?: string;
};

export type TimelineDelta = {
  date: dayjs.Dayjs;
  source: TimelineSource;

  pickupTrial?: number;
  // 픽업 1회 모집의 가챠 운에 따른 분산(뽑기 횟수²). 신뢰 구간 폭 계산에 누적됩니다.
  pickupTrialVariance?: number;
  resourceDelta?: PickupResources;
  tenTimeTicketLotId?: string;
  tenTimeTicketExpiresAt?: dayjs.Dayjs;
  priority?: number;
};

export type TimelineEntry = {
  date: dayjs.Dayjs;
  source: TimelineSource;
  accumulatedResources: PickupResources;
  accumulatedResourcesBand?: {
    optimistic: PickupResources;
    pessimistic: PickupResources;
  };
  resourceDelta: PickupResources;
};

export type Timeline = TimelineEntry[];

export const MAX_REPEATED_ENTRIES = 365;

export const PYROXENE = {
  RAID_TOTAL_ASSAULT_BASE: 650,
  RAID_TOTAL_ASSAULT_TIER: { platinum: 1200, gold: 1000, silver: 800, bronze: 600 },
  RAID_ELIMINATION_BASE: 650,
  DAILY_MISSION: 20,
  WEEKLY_MISSION: 120,
  TACTICAL: { in10: 35, in100: 30, in200: 25, over200: 20 },
  PICKUP_TRIAL: { average: 140, ceil: 200 },
  FREE_RECRUITMENT_TRIAL: 100,
} as const;

// 신뢰 구간 폭의 z-점수. P10~P90(양측 ±1.2816σ)에 해당합니다.
export const PICKUP_TRIAL_BAND_Z = 1.2816;

export { calculateDailyApChargePyroxene } from "./pyroxene-planner-source-config";

type TenTimeTicketLot = {
  id: string;
  count: number;
  expiresAt?: dayjs.Dayjs;
};

type TimelineAccumulationState = {
  currentResources: PickupResources;
  tenTimeTicketLots: TenTimeTicketLot[];
};

const TIMELINE_DELTA_PRIORITY = {
  NORMAL: 0,
  PICKUP: 10,
  TICKET_EXPIRY: 20,
} as const;

function zeroResources(): PickupResources {
  return { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 };
}

function getNextMonthlyFirstDate(date: dayjs.Dayjs): dayjs.Dayjs {
  return date.add(1, "month").startOf("month");
}

function getNextRepeatedGainDate(repeatedGain: NonNullable<PyroxeneScheduleItem["repeatedGain"]>, date: dayjs.Dayjs) {
  if (repeatedGain.repeatType === "monthly_first") {
    return getNextMonthlyFirstDate(date);
  }
  return date.add(repeatedGain.repeatIntervalDays ?? 0, "day");
}

function getEliminationTicketExpiresAt(raidUntil: Date | string): dayjs.Dayjs {
  return dayjs(raidUntil).add(1, "month").endOf("month");
}

function spendTenTimeTickets(lots: TenTimeTicketLot[], count: number): number {
  let remainingCount = count;
  let spentCount = 0;
  const sortedLots = [...lots].sort((a, b) => {
    if (a.expiresAt && b.expiresAt) {
      return a.expiresAt.diff(b.expiresAt);
    }
    if (a.expiresAt) {
      return -1;
    }
    if (b.expiresAt) {
      return 1;
    }
    return 0;
  });

  for (const lot of sortedLots) {
    if (remainingCount <= 0) {
      break;
    }
    const spendCount = Math.min(lot.count, remainingCount);
    lot.count -= spendCount;
    remainingCount -= spendCount;
    spentCount += spendCount;
  }

  return spentCount;
}

function applyTenTimeTicketDelta(lots: TenTimeTicketLot[], delta: TimelineDelta, resourceDelta: PickupResources) {
  if (resourceDelta.tenTimeTicket > 0) {
    lots.push({
      id: delta.tenTimeTicketLotId ?? `non-expiring-${delta.date.valueOf()}-${lots.length}`,
      count: resourceDelta.tenTimeTicket,
      expiresAt: delta.tenTimeTicketExpiresAt,
    });
  } else if (resourceDelta.tenTimeTicket < 0) {
    spendTenTimeTickets(lots, Math.abs(resourceDelta.tenTimeTicket));
  }
}

function expireTenTimeTicketLot(lots: TenTimeTicketLot[], lotId: string): number {
  const lot = lots.find((candidate) => candidate.id === lotId);
  if (!lot) {
    return 0;
  }
  const expiredCount = lot.count;
  lot.count = 0;
  return expiredCount;
}

function createTimelineAccumulationState(initialResources: PickupResources): TimelineAccumulationState {
  return {
    currentResources: initialResources,
    tenTimeTicketLots: initialResources.tenTimeTicket > 0 ? [{ id: "initial", count: initialResources.tenTimeTicket }] : [],
  };
}

function resolvePickupResourceDelta(state: TimelineAccumulationState, pickupTrial: number): PickupResources | undefined {
  if (pickupTrial > 0) {
    const resourceDelta = zeroResources();
    let remainingTrial = pickupTrial;
    if (remainingTrial >= 10) {
      const spentTenTimeTickets = spendTenTimeTickets(state.tenTimeTicketLots, Math.floor(remainingTrial / 10));
      resourceDelta.tenTimeTicket = spentTenTimeTickets > 0 ? -1 * spentTenTimeTickets : 0;
      remainingTrial -= spentTenTimeTickets * 10;
    }
    if (remainingTrial > 1) {
      const spentOneTimeTickets = Math.min(remainingTrial, state.currentResources.oneTimeTicket);
      resourceDelta.oneTimeTicket = spentOneTimeTickets > 0 ? -1 * spentOneTimeTickets : 0;
      remainingTrial -= spentOneTimeTickets;
    }
    resourceDelta.pyroxene = remainingTrial > 0 ? -1 * remainingTrial * 120 : 0;
    return resourceDelta;
  }
  if (pickupTrial === 0) {
    // expectedTrials가 0이면 소비 없이도 이벤트 row를 유지합니다.
    return zeroResources();
  }
  return undefined;
}

function resolveTimelineResourceDelta(
  state: TimelineAccumulationState,
  delta: TimelineDelta,
  pickupTrial: number | undefined,
): PickupResources | undefined {
  if (delta.resourceDelta) {
    return delta.resourceDelta;
  }
  if (pickupTrial !== undefined) {
    return resolvePickupResourceDelta(state, pickupTrial);
  }
  if (delta.tenTimeTicketLotId) {
    const expiredTicketCount = expireTenTimeTicketLot(state.tenTimeTicketLots, delta.tenTimeTicketLotId);
    if (expiredTicketCount > 0) {
      return { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: -expiredTicketCount };
    }
  }
  return undefined;
}

function applyTimelineResourceDelta(
  state: TimelineAccumulationState,
  delta: TimelineDelta,
  resourceDelta: PickupResources,
) {
  if (delta.resourceDelta) {
    applyTenTimeTicketDelta(state.tenTimeTicketLots, delta, resourceDelta);
  }

  state.currentResources = {
    pyroxene: state.currentResources.pyroxene + resourceDelta.pyroxene,
    oneTimeTicket: state.currentResources.oneTimeTicket + resourceDelta.oneTimeTicket,
    tenTimeTicket: state.currentResources.tenTimeTicket + resourceDelta.tenTimeTicket,
  };
}

// 천장(pity)으로 상한이 걸린 기하분포의 평균/분산을 계산합니다.
// 한 명의 픽업 학생을 얻기까지 필요한 모집 횟수 N = min(첫 성공까지 시행, 천장).
const pickupTrialMomentsCache = new Map<number, { mean: number; variance: number }>();

export function calculatePickupTrialMoments(pickupRate: number): { mean: number; variance: number } {
  const cap = PYROXENE.PICKUP_TRIAL.ceil;
  if (pickupRate <= 0) {
    return { mean: cap, variance: 0 };
  }
  if (pickupRate >= 1) {
    return { mean: 1, variance: 0 };
  }

  const cached = pickupTrialMomentsCache.get(pickupRate);
  if (cached) {
    return cached;
  }

  const q = 1 - pickupRate;
  let mean = 0;
  let secondMoment = 0;
  for (let k = 1; k < cap; k++) {
    const probability = q ** (k - 1) * pickupRate;
    mean += k * probability;
    secondMoment += k * k * probability;
  }
  // 천장 도달(N = cap) 확률: 직전까지 모두 실패.
  const ceilProbability = q ** (cap - 1);
  mean += cap * ceilProbability;
  secondMoment += cap * cap * ceilProbability;

  const moments = { mean, variance: Math.max(0, secondMoment - mean * mean) };
  pickupTrialMomentsCache.set(pickupRate, moments);
  return moments;
}

function getPickupRecruitmentRate(recruitment: NonNullable<PyroxeneScheduleItem["event"]>["recruitments"][number]) {
  return recruitment.student?.initialTier === 2
    ? DEFAULT_PICKUP_STUDENT_RATE_BY_TIER.tier2
    : DEFAULT_PICKUP_STUDENT_RATE_BY_TIER.tier3;
}

// 한 이벤트의 가챠 분산은 픽업 학생별 분산의 합입니다(학생 간 독립 가정).
// 독립 분산은 더할 수 있으므로, 여러 이벤트에 걸친 누적 표준편차는 √N로 자랍니다.
function getPickupTrialVariance(
  pickupRecruitments: NonNullable<PyroxeneScheduleItem["event"]>["recruitments"],
): number {
  return pickupRecruitments.reduce(
    (sum, recruitment) => sum + calculatePickupTrialMoments(getPickupRecruitmentRate(recruitment)).variance,
    0,
  );
}

function subtractFreeRecruitmentTrial(pickupTrial: number): number {
  return Math.max(0, pickupTrial - PYROXENE.FREE_RECRUITMENT_TRIAL);
}

export function isFreeRecruitment100Event(event: NonNullable<PyroxeneScheduleItem["event"]>, now = dayjs()): boolean {
  return (
    event.tags.includes("recruit_free_100") &&
    event.recruitments.every(({ until }) => until !== null && dayjs(until).isAfter(now))
  );
}

export function buildTimeline(
  initialResources: PickupResources,
  initialDate: Date,
  eventDataMap: Map<string, { completed: boolean; expectedTrials: number | null }>,
  scheduleItems: PyroxeneScheduleItem[],
  options: PyroxenePlannerOptions,
): Timeline {
  const maxDate = scheduleItems.reduce((max, item) => {
    if (!item.event) {
      return max;
    }
    const eventUntil = dayjs(item.event.until);
    return max.isAfter(eventUntil) ? max : eventUntil;
  }, dayjs(initialDate));

  const timelineDeltas: TimelineDelta[] = [];
  for (const scheduleItem of scheduleItems) {
    if (scheduleItem.event) {
      const { event } = scheduleItem;

      // 이벤트 보상 청휘석은 픽업 완료 여부와 무관하게 이벤트 종료일에 수급됩니다.
      if (event.earnablePyroxene) {
        timelineDeltas.push({
          date: dayjs(event.until),
          source: { type: "event_reward", description: event.name },
          resourceDelta: { pyroxene: event.earnablePyroxene, oneTimeTicket: 0, tenTimeTicket: 0 },
        });
      }

      const pickupRecruitments = event.recruitments.filter(
        ({ pickup, favorited, recruitmentType }) => pickup && favorited && recruitmentType !== "given",
      );
      const pickupCount = pickupRecruitments.length;
      if (pickupCount === 0) {
        continue;
      }

      const eventData = eventDataMap.get(event.uid);
      if (eventData?.completed) {
        // 이미 픽업을 완료한 일정은 소비 계산에서 제외하되, 완료 상태 표시를 위해 row는 남깁니다.
        timelineDeltas.push({
          date: dayjs(event.since),
          source: { type: "event", event },
          resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
        });
        continue;
      }

      let pickupTrial: number;
      if (eventData?.expectedTrials !== null && eventData?.expectedTrials !== undefined) {
        pickupTrial = eventData.expectedTrials;
      } else {
        // 이벤트별 직접 입력이 없으면 관심 등록된 픽업 학생 수와 전역 모집 목표로 계산합니다.
        pickupTrial = pickupCount * PYROXENE.PICKUP_TRIAL[options.event.pickupChance];
      }

      // 모집 목표를 수동 입력했더라도 가챠 변동성 밴드는 동일하게 시뮬레이션합니다.
      // 중앙값(수동/평균/천장)은 그대로 두고, 밴드 폭은 픽업 학생 확률 기반 분산으로 계산합니다.
      // 무료 100연 이벤트는 중앙값(평균)만 줄이고 분산은 근사적으로 그대로 둡니다.
      const pickupTrialVariance = getPickupTrialVariance(pickupRecruitments);

      if (isFreeRecruitment100Event(event)) {
        pickupTrial = subtractFreeRecruitmentTrial(pickupTrial);
      }

      timelineDeltas.push({
        date: dayjs(event.since),
        source: { type: "event", event },
        pickupTrial,
        pickupTrialVariance,
      });
    } else if (scheduleItem.raid) {
      const { raid } = scheduleItem;
      if (raid.type === "total_assault") {
        const tierReward = PYROXENE.RAID_TOTAL_ASSAULT_TIER[options.raid.tier];
        timelineDeltas.push({
          date: dayjs(raid.until),
          source: { type: "raid", description: `총력전 ${raid.name}` },
          resourceDelta: {
            pyroxene: PYROXENE.RAID_TOTAL_ASSAULT_BASE + tierReward,
            oneTimeTicket: 0,
            tenTimeTicket: 0,
          },
        });
      } else if (raid.type === "elimination") {
        const ticketLotId = `${raid.uid}::ten-time-ticket`;
        const ticketExpiresAt = getEliminationTicketExpiresAt(raid.until);
        timelineDeltas.push({
          date: dayjs(raid.until).add(1, "day"),
          source: { type: "raid", description: `대결전 ${raid.name}` },
          resourceDelta: { pyroxene: PYROXENE.RAID_ELIMINATION_BASE, oneTimeTicket: 0, tenTimeTicket: 1 },
          tenTimeTicketLotId: ticketLotId,
          tenTimeTicketExpiresAt: ticketExpiresAt,
        });
        timelineDeltas.push({
          date: ticketExpiresAt,
          source: {
            type: "raid",
            uid: `${raid.uid}::ten-time-ticket-expiry`,
            description: "대결전 10회 모집 티켓 만료",
          },
          tenTimeTicketLotId: ticketLotId,
          priority: TIMELINE_DELTA_PRIORITY.TICKET_EXPIRY,
        });
      }
    } else if (scheduleItem.onetimeGain) {
      const { onetimeGain } = scheduleItem;
      timelineDeltas.push({
        date: dayjs(onetimeGain.date),
        source: { type: onetimeGain.source, uid: onetimeGain.uid, description: onetimeGain.description },
        resourceDelta: {
          pyroxene: onetimeGain.pyroxeneDelta ?? 0,
          oneTimeTicket: onetimeGain.oneTimeTicketDelta ?? 0,
          tenTimeTicket: onetimeGain.tenTimeTicketDelta ?? 0,
        },
      });
    } else if (scheduleItem.repeatedGain) {
      const { repeatedGain } = scheduleItem;
      if (repeatedGain.repeatType !== "monthly_first" && (!repeatedGain.repeatIntervalDays || repeatedGain.repeatIntervalDays <= 0)) {
        continue;
      }

      let repeatedGainCount = 0;
      for (
        let date = dayjs(repeatedGain.date);
        date.isBefore(maxDate) && repeatedGainCount < (repeatedGain.repeatCount ?? MAX_REPEATED_ENTRIES);
        date = getNextRepeatedGainDate(repeatedGain, date)
      ) {
        timelineDeltas.push({
          date,
          source: { type: repeatedGain.source, uid: repeatedGain.uid, description: repeatedGain.description },
          resourceDelta: {
            pyroxene: repeatedGain.pyroxeneDelta ?? 0,
            oneTimeTicket: repeatedGain.oneTimeTicketDelta ?? 0,
            tenTimeTicket: repeatedGain.tenTimeTicketDelta ?? 0,
          },
        });
        repeatedGainCount++;
      }
    }
  }

  const dateFrom = dayjs(initialDate);
  const tacticalPyroxene = PYROXENE.TACTICAL[options.tactical.level];
  const dailyApChargePyroxene = calculateDailyApChargePyroxene(options.consumption.apChargeCount);

  let dailyEntryCount = 0;
  for (
    let date = dateFrom;
    date.isBefore(maxDate) && dailyEntryCount < MAX_REPEATED_ENTRIES;
    date = date.add(1, "day")
  ) {
    dailyEntryCount++;
    timelineDeltas.push({
      date,
      source: { type: "daily_mission", description: "일일 임무" },
      resourceDelta: { pyroxene: PYROXENE.DAILY_MISSION, oneTimeTicket: 0, tenTimeTicket: 0 },
    });

    if (date.day() === 0) {
      timelineDeltas.push({
        date,
        source: { type: "weekly_mission", description: "주간 임무" },
        resourceDelta: { pyroxene: PYROXENE.WEEKLY_MISSION, oneTimeTicket: 0, tenTimeTicket: 0 },
      });
    }

    timelineDeltas.push({
      date,
      source: { type: "tactical", description: "전술대회" },
      resourceDelta: { pyroxene: tacticalPyroxene, oneTimeTicket: 0, tenTimeTicket: 0 },
    });

    if (dailyApChargePyroxene > 0) {
      timelineDeltas.push({
        date,
        source: { type: "ap_charge", description: "AP 충전" },
        resourceDelta: { pyroxene: -dailyApChargePyroxene, oneTimeTicket: 0, tenTimeTicket: 0 },
      });
    }
  }

  const initialDateDayjs = dayjs(initialDate);
  const filteredDeltas = timelineDeltas.filter((delta) => {
    if (delta.date.isAfter(initialDateDayjs)) {
      return true;
    }
    if (delta.source.event) {
      return dayjs(delta.source.event.until).isAfter(initialDateDayjs);
    }
    return false;
  });

  const timeline: Timeline = [];
  const centralState = createTimelineAccumulationState(initialResources);
  // 픽업 이벤트를 지날 때마다 가챠 분산(뽑기 횟수²)을 누적합니다.
  // 밴드 폭은 누적 표준편차에 비례하므로 픽업 개수 N에 대해 √N로 자랍니다.
  let cumulativePickupVariance = 0;
  for (
    const delta of filteredDeltas.sort((a, b) => {
      const dateDiff = a.date.diff(b.date);
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return (a.priority ?? TIMELINE_DELTA_PRIORITY.NORMAL) - (b.priority ?? TIMELINE_DELTA_PRIORITY.NORMAL);
    })
  ) {
    const resourceDelta = resolveTimelineResourceDelta(centralState, delta, delta.pickupTrial);

    if (delta.pickupTrialVariance) {
      cumulativePickupVariance += delta.pickupTrialVariance;
    }

    if (!resourceDelta) {
      continue;
    }

    applyTimelineResourceDelta(centralState, delta, resourceDelta);

    // 중앙선을 기준으로 ±z·√(누적 분산)·120청휘석 만큼 대칭 밴드를 그립니다.
    const bandOffsetPyroxene = PICKUP_TRIAL_BAND_Z * Math.sqrt(cumulativePickupVariance) * 120;
    const central = centralState.currentResources;

    timeline.push({
      date: delta.date,
      source: delta.source,
      resourceDelta,
      accumulatedResources: { ...central },
      accumulatedResourcesBand:
        bandOffsetPyroxene > 0
          ? {
              optimistic: { ...central, pyroxene: central.pyroxene + bandOffsetPyroxene },
              pessimistic: { ...central, pyroxene: central.pyroxene - bandOffsetPyroxene },
            }
          : undefined,
    });
  }
  return timeline;
}
