import type { EventType, RaidType } from "./content.d";

export const CONTENT_ORDER: (EventType | RaidType)[] = [
  "update",
  "event",
  "immortal_event",
  "main_story",
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
