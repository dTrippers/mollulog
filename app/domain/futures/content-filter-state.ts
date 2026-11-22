import type { EventType, RaidType } from "~/models/content.d";

export type ContentFilterState = {
  types: (EventType | RaidType)[];
  onlyPickups: boolean;
};

export const defaultContentFilterState: ContentFilterState = {
  types: [],
  onlyPickups: false,
};

const legacyTypeMap: Partial<Record<string, EventType | RaidType>> = {
  exercise: "joint_firing_drill",
};

const allowedFilterTypes = new Set<EventType | RaidType>([
  "live",
  "event",
  "immortal_event",
  "fes",
  "collab",
  "mini_event",
  "main_story",
  "mini_story",
  "ko_voice",
  "campaign",
  "joint_firing_drill",
  "pickup",
  "total_assault",
  "elimination",
  "unlimit",
  "allied",
]);

export function normalizeContentFilterState(value: unknown): ContentFilterState {
  if (!value || typeof value !== "object") {
    return defaultContentFilterState;
  }

  const maybeTypes = "types" in value ? value.types : undefined;
  const types = Array.isArray(maybeTypes)
    ? Array.from(
        new Set(
          maybeTypes
            .filter((type): type is string => typeof type === "string")
            .map((type) => legacyTypeMap[type] ?? type)
            .filter((type): type is EventType | RaidType => allowedFilterTypes.has(type as EventType | RaidType)),
        ),
      )
    : [];

  // The story chip gained ko_voice later. A saved story filter predates it, so it gets the whole chip group back.
  if (types.some((type) => type === "main_story" || type === "mini_story") && !types.includes("ko_voice")) {
    types.push("ko_voice");
  }

  const onlyPickups = "onlyPickups" in value && typeof value.onlyPickups === "boolean" ? value.onlyPickups : false;

  return { types, onlyPickups };
}
