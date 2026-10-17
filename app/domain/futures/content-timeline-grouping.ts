import {
  compareInstantAsc,
  formatInstantDateKey,
  isInstantAfter,
  isInstantBefore,
  type UtcIsoString,
} from "~/lib/date-time";
import type { EventType, RaidType } from "~/models/content.d";

export type FutureGroupableContent = {
  since: UtcIsoString;
  until: UtcIsoString | null;
  contentType: EventType | RaidType;
  runType: "first" | "rerun" | "permanent";
  students: readonly unknown[];
};

// Priority applies within one date group. Types outside the requested order keep their chronological order before pickup.
function contentPriority(content: FutureGroupableContent): number {
  switch (content.contentType) {
    case "live":
      return 0;
    case "event":
      return content.runType === "permanent" ? 5 : content.runType === "rerun" ? 2 : 1;
    case "main_story":
      return 3;
    case "mini_story":
      return 4;
    case "immortal_event":
      return 5;
    case "raid":
    case "total_assault":
    case "elimination":
    case "unlimit":
    case "allied":
      return 6;
    case "mini_event":
      return 7;
    case "joint_firing_drill":
      return 8;
    case "campaign":
      return 9;
    case "pickup":
      return 11;
    default:
      return 10;
  }
}

export type FutureContentGroup<T extends FutureGroupableContent> = {
  // null marks the in-progress group, which comes first.
  groupDate: UtcIsoString | null;
  contents: T[];
};

// Groups contents by start date in the display time zone. Contents that are running now share one leading group.
export function groupFutureContents<T extends FutureGroupableContent>(
  contents: readonly T[],
  timeZone: string,
  now: UtcIsoString,
): FutureContentGroup<T>[] {
  const groups: FutureContentGroup<T>[] = [];

  for (const content of [...contents].sort((a, b) => compareInstantAsc(a.since, b.since))) {
    const isCurrent =
      isInstantBefore(content.since, now) && (content.until === null || isInstantAfter(content.until, now));

    const groupDate = isCurrent ? null : content.since;
    const lastGroup = groups[groups.length - 1];
    if (
      (lastGroup?.groupDate === null && isCurrent) ||
      (lastGroup?.groupDate &&
        groupDate &&
        formatInstantDateKey(lastGroup.groupDate, timeZone) === formatInstantDateKey(groupDate, timeZone))
    ) {
      lastGroup.contents.push(content);
    } else {
      groups.push({ groupDate, contents: [content] });
    }
  }

  return groups.map(({ groupDate, contents }) => ({
    groupDate,
    contents: contents.sort(
      (a, b) =>
        Number(b.students.length > 0) - Number(a.students.length > 0) ||
        contentPriority(a) - contentPriority(b) ||
        compareInstantAsc(a.since, b.since),
    ),
  }));
}
