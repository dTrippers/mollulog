import { DEFAULT_PYROXENE_TIMELINE_DISPLAY, type PyroxeneSourceType } from "~/domain/pyroxene-sources";
import dayjs from "~/lib/dayjs";

export type TimelineSourceType = PyroxeneSourceType;
export const PYROXENE_PICKUP_CHANCES = ["average", "average_pity", "ceil"] as const;
export type PyroxenePickupChance = (typeof PYROXENE_PICKUP_CHANCES)[number];

export type PyroxeneApChargeException = {
  uid: string;
  startDate: string;
  endDate: string;
  count: number;
};

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
    apChargeExceptions: PyroxeneApChargeException[];
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
    apChargeExceptions: [],
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

const AP_CHARGE_EXCEPTION_MAX_COUNT = 100;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function apChargeExceptionRangesOverlap(
  left: Pick<PyroxeneApChargeException, "startDate" | "endDate">,
  right: Pick<PyroxeneApChargeException, "startDate" | "endDate">,
): boolean {
  return left.startDate <= right.endDate && right.startDate <= left.endDate;
}

export function normalizePyroxeneApChargeExceptions(value: unknown): PyroxeneApChargeException[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > AP_CHARGE_EXCEPTION_MAX_COUNT) {
    throw new Error("기간별 AP 충전 예외를 확인할 수 없어요.");
  }

  const exceptions: PyroxeneApChargeException[] = [];
  const uids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("기간별 AP 충전 예외를 확인할 수 없어요.");
    }
    const row = entry as Record<string, unknown>;
    if (
      typeof row.uid !== "string" ||
      row.uid.length === 0 ||
      row.uid.length > 128 ||
      uids.has(row.uid) ||
      !isCalendarDate(row.startDate) ||
      !isCalendarDate(row.endDate) ||
      row.startDate > row.endDate ||
      typeof row.count !== "number" ||
      !Number.isSafeInteger(row.count) ||
      row.count < 0 ||
      row.count > 20
    ) {
      throw new Error("기간별 AP 충전 예외를 확인할 수 없어요.");
    }
    const exception = { uid: row.uid, startDate: row.startDate, endDate: row.endDate, count: row.count };
    if (exceptions.some((existing) => apChargeExceptionRangesOverlap(existing, exception))) {
      throw new Error("기간별 AP 충전 예외가 겹쳐요.");
    }
    uids.add(exception.uid);
    exceptions.push(exception);
  }
  return exceptions.sort((left, right) => left.startDate.localeCompare(right.startDate));
}

/** Resolve the charge count for the game day (04:00 KST to the next 04:00 KST) that contains `date`. */
export function getPyroxeneApChargeCountForDate(
  date: Date | string,
  consumption: PyroxenePlannerOptions["consumption"],
): number {
  const dateKey = dayjs(date).tz("Asia/Seoul").subtract(4, "hour").format("YYYY-MM-DD");
  return (
    consumption.apChargeExceptions.find((exception) => exception.startDate <= dateKey && dateKey <= exception.endDate)
      ?.count ?? consumption.apChargeCount
  );
}

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
      apChargeExceptions: normalizePyroxeneApChargeExceptions(options?.consumption?.apChargeExceptions),
    },
    timeline: {
      display: options?.timeline?.display ?? defaultPyroxenePlannerOptions.timeline.display,
    },
  };
}
