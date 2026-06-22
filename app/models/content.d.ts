import type { Attack, Defense } from "~/graphql/graphql";

// 전투 관련
export type Terrain = "indoor" | "outdoor" | "street";
export type Role = "striker" | "special";
export type Position = "front" | "middle" | "back";
export type TacticRole = "attacker" | "tank" | "support" | "healer" | "tactical_support";

// 컨텐츠 관련
export type EventType = "event" | "mini_event" | "guide_mission" | "immortal_event" | "pickup" | "fes" | "campaign" | "joint_firing_drill" | "main_story" | "mini_story" | "collab" | "battle_pass" | "update";
export type RaidType = "total_assault" | "elimination" | "unlimit" | "allied" | "raid";

export const attackTypeColorMap: Record<Attack, "red" | "yellow" | "green" | "blue" | "purple" | "grey"> = {
  explosive: "red",
  piercing: "yellow",
  mystic: "blue",
  sonic: "purple",
  chemical: "green",
  normal: "grey",
};

export const defenseTypeColorMap: Record<Defense, "red" | "yellow" | "blue" | "purple" | "green" | "grey"> = {
  light: "red",
  heavy: "yellow",
  special: "blue",
  elastic: "purple",
  composite: "green",
  normal: "grey",
};
