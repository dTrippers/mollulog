import { DEFAULT_PYROXENE_TIMELINE_DISPLAY, type PyroxeneSourceType } from "~/domain/pyroxene-sources";

export type TimelineSourceType = PyroxeneSourceType;
export const PYROXENE_PICKUP_CHANCES = ["average", "average_pity", "ceil"] as const;
export type PyroxenePickupChance = (typeof PYROXENE_PICKUP_CHANCES)[number];

export type PyroxenePlannerOptions = {
  event: {
    pickupChance: PyroxenePickupChance;
  };
  raid: {
    tier: "platinum" | "gold" | "silver" | "bronze";
  };
  tactical: {
    level: "in10" | "in100" | "in200" | "over200";
  };
  consumption: {
    apChargeCount: number;
  };
  timeline: {
    display: TimelineSourceType[];
  };
};

function normalizePyroxenePickupChance(value: unknown): PyroxenePickupChance {
  return PYROXENE_PICKUP_CHANCES.includes(value as PyroxenePickupChance)
    ? (value as PyroxenePickupChance)
    : defaultPyroxenePlannerOptions.event.pickupChance;
}

// buildTimeline 계산에 실제로 사용하는 옵션 필드들만 추린 타입입니다.
// timeline.display(표시 필터)는 계산 결과에 영향을 주지 않으므로 제외해,
// 표시 토글이 무거운 재계산을 유발하지 않도록 합니다.
export type PyroxeneCalculationOptions = Pick<PyroxenePlannerOptions, "event" | "raid" | "tactical" | "consumption">;

export const defaultPyroxenePlannerOptions: PyroxenePlannerOptions = {
  event: {
    pickupChance: "average_pity",
  },
  raid: {
    tier: "platinum",
  },
  tactical: {
    level: "in100",
  },
  consumption: {
    apChargeCount: 0,
  },
  timeline: {
    display: DEFAULT_PYROXENE_TIMELINE_DISPLAY,
  },
};

export type StoredPyroxenePlannerOptions = Partial<
  Omit<PyroxenePlannerOptions, "event" | "raid" | "tactical" | "consumption" | "timeline">
> & {
  event?: Partial<PyroxenePlannerOptions["event"]>;
  raid?: Partial<PyroxenePlannerOptions["raid"]>;
  tactical?: Partial<PyroxenePlannerOptions["tactical"]>;
  consumption?: Partial<PyroxenePlannerOptions["consumption"]>;
  timeline?: Partial<PyroxenePlannerOptions["timeline"]>;
};

export function normalizePyroxenePlannerOptions(options: StoredPyroxenePlannerOptions | null): PyroxenePlannerOptions {
  return {
    event: {
      ...defaultPyroxenePlannerOptions.event,
      ...options?.event,
      pickupChance: normalizePyroxenePickupChance(options?.event?.pickupChance),
    },
    raid: {
      ...defaultPyroxenePlannerOptions.raid,
      ...options?.raid,
    },
    tactical: {
      ...defaultPyroxenePlannerOptions.tactical,
      ...options?.tactical,
    },
    consumption: {
      ...defaultPyroxenePlannerOptions.consumption,
      ...options?.consumption,
    },
    timeline: {
      display: options?.timeline?.display ?? defaultPyroxenePlannerOptions.timeline.display,
    },
  };
}
