import type { TimelineSourceType } from "~/domain/pyroxene-planner";

export type PyroxeneSourceAction = "add" | "configure" | "none";
export type PyroxeneSourceRowGroup = "regular" | "paid" | "consumption";

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

export const PYROXENE_PANEL_HIDDEN_SOURCE_TYPES = ["event"] as const satisfies readonly TimelineSourceType[];

export const PYROXENE_SOURCE_ROW_GROUP_LABELS: Record<PyroxeneSourceRowGroup, string> = {
  regular: "게임 내 획득처",
  paid: "유료 구매처",
  consumption: "픽업 외 소비처",
};

export const PYROXENE_SOURCE_ROW_DEFINITIONS = [
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
    label: "청휘석 패키지",
    group: "paid",
    action: "add",
    visibilityTargets: [
      { type: "package_onetime", label: "초회" },
      { type: "package_daily", label: "일간" },
    ],
  },
  {
    id: "ap_package",
    label: "AP 패키지",
    group: "paid",
    action: "add",
    visibilityTargets: [{ type: "package_ap" }],
  },
  {
    id: "other",
    label: "직접 등록",
    group: "paid",
    action: "add",
    visibilityTargets: [{ type: "other" }],
  },
  {
    id: "ap_charge",
    label: "AP 충전",
    group: "consumption",
    action: "configure",
    visibilityTargets: [{ type: "ap_charge" }],
  },
] as const satisfies readonly PyroxeneSourceRowDefinition[];
