export type PyroxeneSourceDefinition = {
  type: string;
  label: string;
  defaultVisible: boolean;
};

export const PYROXENE_SOURCE_DEFINITIONS = [
  { type: "event", label: "모집 소비", defaultVisible: true },
  { type: "event_reward", label: "이벤트 보상", defaultVisible: true },
  { type: "raid", label: "총력전/대결전 보상", defaultVisible: true },
  { type: "buy", label: "청휘석 구매", defaultVisible: true },
  { type: "package_onetime", label: "패키지 (초회)", defaultVisible: true },
  { type: "package_daily", label: "패키지 (일간)", defaultVisible: false },
  { type: "daily_mission", label: "일일 임무", defaultVisible: false },
  { type: "weekly_mission", label: "주간 임무", defaultVisible: false },
  { type: "ap_charge", label: "AP 충전", defaultVisible: true },
  { type: "tactical", label: "전술대회 보상", defaultVisible: false },
  { type: "attendance", label: "출석", defaultVisible: false },
  { type: "other", label: "기타", defaultVisible: false },
] as const satisfies readonly PyroxeneSourceDefinition[];

export type PyroxeneSourceType = (typeof PYROXENE_SOURCE_DEFINITIONS)[number]["type"];

export const DEFAULT_PYROXENE_TIMELINE_DISPLAY = PYROXENE_SOURCE_DEFINITIONS.filter(
  (source) => source.defaultVisible,
).map((source) => source.type) satisfies PyroxeneSourceType[];
