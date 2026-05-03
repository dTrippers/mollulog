import dayjs from "dayjs";
import { nanoid } from "nanoid/non-secure";
import {
  PYROXENE_ATTENDANCE_CONFIG,
  PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS,
  PYROXENE_PACKAGE_CONFIG,
  PYROXENE_PACKAGE_DAILY_REPEAT_COUNT,
  PYROXENE_PACKAGE_DAILY_REPEAT_INTERVAL_DAYS,
  type PyroxenePackageType,
} from "~/models/pyroxene-planner-source-config";
import type { PyroxeneTimelineItem, TimelineSourceType } from "./pyroxene-planner";
import type { PickupResources } from "./pyroxene-timeline";

export type PyroxeneSourceCardinality = "single" | "multi" | "automatic";
export type PyroxeneSourceAction = "add" | "configure" | "none";
export type PyroxeneSourceRowGroup = "regular" | "paid" | "manual";

export type PyroxeneSourceDefinition = {
  type: TimelineSourceType;
  label: string;
  defaultVisible: boolean;
  // Used by the upcoming panel consolidation to choose row actions and copy.
  cardinality: PyroxeneSourceCardinality;
  action: PyroxeneSourceAction;
};

export const PYROXENE_SOURCE_DEFINITIONS: PyroxeneSourceDefinition[] = [
  { type: "event", label: "모집 소비", defaultVisible: true, cardinality: "automatic", action: "none" },
  { type: "event_reward", label: "이벤트 보상", defaultVisible: true, cardinality: "automatic", action: "none" },
  { type: "raid", label: "총력전/대결전 보상", defaultVisible: true, cardinality: "automatic", action: "configure" },
  { type: "buy", label: "청휘석 구매", defaultVisible: true, cardinality: "multi", action: "add" },
  { type: "package_onetime", label: "패키지 (초회)", defaultVisible: true, cardinality: "multi", action: "add" },
  { type: "package_daily", label: "패키지 (일간)", defaultVisible: false, cardinality: "multi", action: "none" },
  { type: "daily_mission", label: "일일 임무", defaultVisible: false, cardinality: "automatic", action: "none" },
  { type: "weekly_mission", label: "주간 임무", defaultVisible: false, cardinality: "automatic", action: "none" },
  { type: "tactical", label: "전술대회 보상", defaultVisible: false, cardinality: "automatic", action: "configure" },
  { type: "attendance", label: "출석", defaultVisible: false, cardinality: "single", action: "configure" },
  { type: "other", label: "기타", defaultVisible: false, cardinality: "multi", action: "add" },
];

export const DEFAULT_PYROXENE_TIMELINE_DISPLAY = PYROXENE_SOURCE_DEFINITIONS.filter(
  (source) => source.defaultVisible,
).map((source) => source.type);

export type PyroxeneSourceVisibilityTarget = {
  type: TimelineSourceType;
  label?: string;
};

export type PyroxeneSourceRowDefinition = {
  id: string;
  label: string;
  group: PyroxeneSourceRowGroup;
  action: PyroxeneSourceAction;
  visibilityTargets: PyroxeneSourceVisibilityTarget[];
};

export const PYROXENE_SOURCE_ROW_GROUP_LABELS: Record<PyroxeneSourceRowGroup, string> = {
  regular: "게임 내 획득처",
  paid: "유료 구매처",
  manual: "직접 등록",
};

export const PYROXENE_SOURCE_ROW_DEFINITIONS: PyroxeneSourceRowDefinition[] = [
  {
    id: "event_reward",
    label: "이벤트 보상",
    group: "regular",
    action: "none",
    visibilityTargets: [{ type: "event_reward" }],
  },
  {
    id: "raid",
    label: "총력전/대결전 보상",
    group: "regular",
    action: "configure",
    visibilityTargets: [{ type: "raid" }],
  },
  {
    id: "mission",
    label: "임무 보상",
    group: "regular",
    action: "none",
    visibilityTargets: [
      { type: "daily_mission", label: "일일" },
      { type: "weekly_mission", label: "주간" },
    ],
  },
  {
    id: "tactical",
    label: "전술대회 보상",
    group: "regular",
    action: "configure",
    visibilityTargets: [{ type: "tactical" }],
  },
  {
    id: "attendance",
    label: "출석",
    group: "regular",
    action: "configure",
    visibilityTargets: [{ type: "attendance" }],
  },
  {
    id: "buy",
    label: "청휘석 구매",
    group: "paid",
    action: "add",
    visibilityTargets: [{ type: "buy" }],
  },
  {
    id: "package",
    label: "월간 패키지",
    group: "paid",
    action: "add",
    visibilityTargets: [
      { type: "package_onetime", label: "초회" },
      { type: "package_daily", label: "일간" },
    ],
  },
  {
    id: "other",
    label: "직접 등록하기",
    group: "manual",
    action: "add",
    visibilityTargets: [{ type: "other" }],
  },
];

export function isPyroxeneTimelineSourceVisible(
  display: TimelineSourceType[],
  sourceType: TimelineSourceType,
): boolean {
  return display.includes(sourceType);
}

export function togglePyroxeneTimelineSourceVisibility(
  display: TimelineSourceType[],
  sourceType: TimelineSourceType,
  visible?: boolean,
): TimelineSourceType[] {
  const currentlyVisible = isPyroxeneTimelineSourceVisible(display, sourceType);
  const nextVisible = visible ?? !currentlyVisible;

  if (nextVisible === currentlyVisible) {
    return display;
  }

  if (nextVisible) {
    return [...display, sourceType];
  }

  return display.filter((type) => type !== sourceType);
}

type OptimisticTimelineItemInput = {
  uid?: string;
  eventAt: Date | string;
  source: PyroxeneTimelineItem["source"];
  description: string;
  pyroxeneDelta?: number;
  oneTimeTicketDelta?: number;
  tenTimeTicketDelta?: number;
  repeatIntervalDays?: number | null;
  repeatCount?: number | null;
};

function createOptimisticTimelineItem(input: OptimisticTimelineItemInput): PyroxeneTimelineItem {
  // Keep optimistic timestamps as the selected Date to preserve current UI behavior.
  // Server writers normalize persisted rows to KST 04:00.
  return {
    uid: input.uid ?? nanoid(8),
    userId: 0,
    eventAt: typeof input.eventAt === "string" ? input.eventAt : input.eventAt.toISOString(),
    source: input.source,
    description: input.description,
    pyroxeneDelta: input.pyroxeneDelta ?? 0,
    oneTimeTicketDelta: input.oneTimeTicketDelta ?? 0,
    tenTimeTicketDelta: input.tenTimeTicketDelta ?? 0,
    repeatIntervalDays: input.repeatIntervalDays ?? null,
    repeatCount: input.repeatCount ?? null,
  };
}

export function createOptimisticBuyTimelineItems(quantity: number, date: Date): PyroxeneTimelineItem[] {
  return [
    createOptimisticTimelineItem({
      eventAt: date,
      source: "buy",
      description: "청휘석 구매",
      pyroxeneDelta: quantity,
    }),
  ];
}

export function createOptimisticPackageTimelineItems(
  startDate: Date,
  packageType: PyroxenePackageType,
): PyroxeneTimelineItem[] {
  const uid = nanoid(8);
  const eventAt = startDate.toISOString();
  const { name, oneTime, daily } = PYROXENE_PACKAGE_CONFIG[packageType];

  return [
    createOptimisticTimelineItem({
      uid: `${uid}::onetime`,
      eventAt,
      source: "package_onetime",
      description: `${name} (초회)`,
      pyroxeneDelta: oneTime,
    }),
    createOptimisticTimelineItem({
      uid: `${uid}::daily`,
      eventAt,
      source: "package_daily",
      description: `${name} (일간)`,
      pyroxeneDelta: daily,
      repeatIntervalDays: PYROXENE_PACKAGE_DAILY_REPEAT_INTERVAL_DAYS,
      repeatCount: PYROXENE_PACKAGE_DAILY_REPEAT_COUNT,
    }),
  ];
}

export function createOptimisticAttendanceTimelineItems(startDate: Date): PyroxeneTimelineItem[] {
  const uid = nanoid(8);
  const start = dayjs(startDate);

  return PYROXENE_ATTENDANCE_CONFIG.map(({ day, pyroxene }) =>
    createOptimisticTimelineItem({
      uid: `${uid}::${day}`,
      eventAt: start.add(day - 1, "day").toDate(),
      source: "attendance",
      description: `출석 ${day}일차`,
      pyroxeneDelta: pyroxene,
      repeatIntervalDays: PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS,
    }),
  );
}

export function createOptimisticOtherTimelineItems(
  resources: PickupResources,
  description: string,
  date: Date,
): PyroxeneTimelineItem[] {
  return [
    createOptimisticTimelineItem({
      eventAt: date,
      source: "other",
      description,
      pyroxeneDelta: resources.pyroxene,
      oneTimeTicketDelta: resources.oneTimeTicket,
      tenTimeTicketDelta: resources.tenTimeTicket,
    }),
  ];
}
