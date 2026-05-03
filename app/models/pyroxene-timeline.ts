import dayjs from "dayjs";
import type { RecruitmentTypeEnum } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";
import type { RaidType } from "./content.d";
import type { PyroxenePlannerOptions, TimelineSourceType } from "./pyroxene-planner";
import { calculateDailyApChargePyroxene } from "./pyroxene-planner-source-config";

export type PickupResources = {
  pyroxene: number;
  oneTimeTicket: number;
  tenTimeTicket: number;
};

export type PyroxeneScheduleItem = {
  event?: {
    uid: string;
    name: string;
    since: UtcIsoString | Date;
    until: UtcIsoString | Date;
    earnablePyroxene: number | null;
    recruitments: {
      recruitmentType: RecruitmentTypeEnum;
      pickup: boolean;
      rerun: boolean;
      student: { uid: string; name: string; initialTier: number } | null;
      favorited: boolean;
    }[];
  };
  raid?: {
    uid: string;
    type: RaidType;
    name: string;
    since: UtcIsoString | Date;
    until: UtcIsoString | Date;
  };

  onetimeGain?: {
    uid?: string;
    source: TimelineSourceType;
    date: Date;
    description: string;
    pyroxeneDelta?: number;
    oneTimeTicketDelta?: number;
    tenTimeTicketDelta?: number;
  };
  repeatedGain?: {
    uid?: string;
    source: TimelineSourceType;
    date: Date;
    description: string;
    pyroxeneDelta?: number;
    oneTimeTicketDelta?: number;
    tenTimeTicketDelta?: number;
    repeatIntervalDays: number;
    repeatCount?: number;
  };
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
  resourceDelta?: PickupResources;
};

export type Timeline = {
  date: dayjs.Dayjs;
  source: TimelineSource;
  accumulatedResources: PickupResources;
  resourceDelta: PickupResources;
}[];

export const MAX_REPEATED_ENTRIES = 365;

export const PYROXENE = {
  RAID_TOTAL_ASSAULT_BASE: 650,
  RAID_TOTAL_ASSAULT_TIER: { platinum: 1200, gold: 1000, silver: 800, bronze: 600 },
  RAID_ELIMINATION_BASE: 650,
  DAILY_MISSION: 20,
  WEEKLY_MISSION: 120,
  TACTICAL: { in10: 35, in100: 30, in200: 25, over200: 20 },
  PICKUP_TRIAL: { average: 140, ceil: 200 },
} as const;

export { calculateDailyApChargePyroxene } from "./pyroxene-planner-source-config";

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
        const pickupCount = event.recruitments.filter(
          ({ pickup, favorited, recruitmentType }) => pickup && favorited && recruitmentType !== "given",
        ).length;
        if (pickupCount === 0) {
          continue;
        }
        pickupTrial = pickupCount * PYROXENE.PICKUP_TRIAL[options.event.pickupChance];
      }

      timelineDeltas.push({
        date: dayjs(event.since),
        source: { type: "event", event },
        pickupTrial,
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
        timelineDeltas.push({
          date: dayjs(raid.until).add(1, "day"),
          source: { type: "raid", description: `대결전 ${raid.name}` },
          resourceDelta: { pyroxene: PYROXENE.RAID_ELIMINATION_BASE, oneTimeTicket: 0, tenTimeTicket: 1 },
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
      let repeatedGainCount = 0;
      for (
        let date = dayjs(repeatedGain.date);
        date.isBefore(maxDate) && repeatedGainCount < (repeatedGain.repeatCount ?? MAX_REPEATED_ENTRIES);
        date = date.add(repeatedGain.repeatIntervalDays, "day")
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
  let currentResources: PickupResources = initialResources;
  for (const delta of filteredDeltas.sort((a, b) => a.date.diff(b.date))) {
    let resourceDelta = delta.resourceDelta;
    if (!resourceDelta && delta.pickupTrial !== undefined) {
      if (delta.pickupTrial > 0) {
        resourceDelta = { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 };
        let remainingTrial = delta.pickupTrial;
        if (remainingTrial > 10) {
          resourceDelta.tenTimeTicket = -1 * Math.min(Math.floor(remainingTrial / 10), currentResources.tenTimeTicket);
          remainingTrial += resourceDelta.tenTimeTicket * 10;
        }
        if (remainingTrial > 1) {
          resourceDelta.oneTimeTicket = -1 * Math.min(remainingTrial, currentResources.oneTimeTicket);
          remainingTrial += resourceDelta.oneTimeTicket;
        }
        resourceDelta.pyroxene = -1 * remainingTrial * 120;
      } else if (delta.pickupTrial === 0) {
        // expectedTrials가 0이면 소비 없이도 이벤트 row를 유지합니다.
        resourceDelta = { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 };
      }
    }

    if (!resourceDelta) {
      continue;
    }

    currentResources = {
      pyroxene: currentResources.pyroxene + resourceDelta.pyroxene,
      oneTimeTicket: currentResources.oneTimeTicket + resourceDelta.oneTimeTicket,
      tenTimeTicket: currentResources.tenTimeTicket + resourceDelta.tenTimeTicket,
    };

    timeline.push({
      date: delta.date,
      source: delta.source,
      resourceDelta,
      accumulatedResources: { ...currentResources },
    });
  }
  return timeline;
}
