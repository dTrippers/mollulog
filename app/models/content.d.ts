// 전투 관련
export type AttackType = "explosive" | "piercing" | "mystic" | "sonic";
export type DefenseType = "light" | "heavy" | "special" | "elastic";
export type Terrain = "indoor" | "outdoor" | "street";
export type Role = "striker" | "special";
export type Position = "front" | "middle" | "back";
export type TacticRole = "attacker" | "tank" | "support" | "healer" | "tactical_support";

// 컨텐츠 관련
export type EventType = "event" | "mini_event" | "guide_mission" | "immortal_event" | "pickup" | "fes" | "campaign" | "exercise" | "main_story" | "collab" | "archive_pickup";
export type RaidType = "total_assault" | "elimination" | "unlimit";
export type PickupType = "usual" | "limited" | "given" | "fes" | "archive";

export const attackTypeColorMap: Record<AttackType, "red" | "yellow" | "blue" | "purple"> = {
  explosive: "red",
  piercing: "yellow",
  mystic: "blue",
  sonic: "purple",
};

export const defenseTypeColorMap: Record<DefenseType, "red" | "yellow" | "blue" | "purple"> = {
  light: "red",
  heavy: "yellow",
  special: "blue",
  elastic: "purple",
};
