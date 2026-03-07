// 전투 관련
export type AttackType = "explosive" | "piercing" | "mystic" | "sonic" | "chemical";
export type DefenseType = "light" | "heavy" | "special" | "elastic" | "composite";
export type Terrain = "indoor" | "outdoor" | "street";
export type Role = "striker" | "special";
export type Position = "front" | "middle" | "back";
export type TacticRole = "attacker" | "tank" | "support" | "healer" | "tactical_support";

// 컨텐츠 관련
export type EventType = "event" | "mini_event" | "guide_mission" | "immortal_event" | "pickup" | "fes" | "campaign" | "joint_firing_drill" | "main_story" | "collab" | "battle_pass" | "update";
export type RaidType = "total_assault" | "elimination" | "unlimit" | "allied";

export const attackTypeColorMap: Record<AttackType, "red" | "yellow" | "green" | "blue" | "purple"> = {
  explosive: "red",
  piercing: "yellow",
  mystic: "blue",
  sonic: "purple",
  chemical: "green",
};

export const defenseTypeColorMap: Record<DefenseType, "red" | "yellow" | "blue" | "purple"> = {
  light: "red",
  heavy: "yellow",
  special: "blue",
  elastic: "purple",
  composite: "green",
};
