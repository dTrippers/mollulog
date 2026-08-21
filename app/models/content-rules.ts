import type { EventType, RaidType } from "./content.d";

export const CONTENT_ORDER: (EventType | RaidType)[] = [
  "live",
  "update",
  "event",
  "immortal_event",
  "main_story",
  "mini_story",
  "fes",
  "pickup",
  "collab",
  "allied",
  "raid",
  "total_assault",
  "elimination",
  "unlimit",
  "campaign",
  "joint_firing_drill",
  "mini_event",
  "guide_mission",
  "battle_pass",
];

export const SHOW_LINK_CONTENT_TYPES: (EventType | RaidType)[] = [
  "live",
  "update",
  "fes",
  "event",
  "immortal_event",
  "main_story",
  "pickup",
  "collab",
  "raid",
  "battle_pass",
];

export const SHOW_LINK_RAID_TYPES: readonly string[] = ["total_assault", "elimination"];

/** 미래시 타임라인과 목록에만 노출하고 일정표에서는 제외하는 컨텐츠 타입 */
export const TIMELINE_ONLY_CONTENT_TYPES: readonly (EventType | RaidType)[] = ["live"];

/** 모집 학생이 없어도 의견을 남길 수 있는 컨텐츠 타입 */
export const COMMENT_ENABLED_WITHOUT_RECRUITMENT_CONTENT_TYPES: readonly (EventType | RaidType)[] = [
  "live",
  "event",
];
