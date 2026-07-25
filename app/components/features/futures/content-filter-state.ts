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

  const onlyPickups = "onlyPickups" in value && typeof value.onlyPickups === "boolean" ? value.onlyPickups : false;

  return { types, onlyPickups };
}
