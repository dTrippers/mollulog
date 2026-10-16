import type { EventType, RaidType } from "~/models/content.d";

export type FilterChipOption = {
  label: string;
  types: (EventType | RaidType)[];
};

// Event chips toggle a group of types together, as in the 1.x filter panel.
export const eventFilterOptions: FilterChipOption[] = [
  { label: "메인 이벤트", types: ["event", "immortal_event", "fes", "collab"] },
  { label: "미니 이벤트", types: ["mini_event"] },
  { label: "스토리", types: ["main_story", "mini_story"] },
  { label: "캠페인", types: ["campaign"] },
  { label: "종합전술시험", types: ["joint_firing_drill"] },
  { label: "픽업 모집", types: ["pickup"] },
  { label: "공식 방송", types: ["live"] },
];

export const raidFilterOptions: FilterChipOption[] = [
  { label: "총력전", types: ["total_assault"] },
  { label: "대결전", types: ["elimination"] },
  { label: "제약해제결전", types: ["unlimit"] },
  { label: "연합작전", types: ["allied"] },
];
