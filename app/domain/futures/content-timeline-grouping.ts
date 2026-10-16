import {
  compareInstantAsc,
  formatInstantDateKey,
  isInstantAfter,
  isInstantBefore,
  type UtcIsoString,
} from "~/lib/date-time";
import type { EventType, RaidType } from "~/models/content.d";
import { CONTENT_ORDER } from "~/models/content-rules";

export type FutureGroupableContent = {
  since: UtcIsoString;
  until: UtcIsoString | null;
  contentType: EventType | RaidType;
};

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
    contents: contents.sort((a, b) => CONTENT_ORDER.indexOf(a.contentType) - CONTENT_ORDER.indexOf(b.contentType)),
  }));
}
