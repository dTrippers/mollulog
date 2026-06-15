import {
  type UtcIsoString,
  compareInstantAsc,
  formatInstantDateKey,
  isInstantAfter,
  isInstantBefore,
  nowUtcIso,
} from "~/lib/date-time";
import { CONTENT_ORDER } from "~/models/content-rules";
import type { ContentTimelineProps } from "./ContentTimeline";

export type ContentTimelineGroup = {
  groupDate: UtcIsoString | null;
  contents: ContentTimelineProps["contents"];
};

export function groupContents(contents: ContentTimelineProps["contents"], timeZone: string): ContentTimelineGroup[] {
  const groups: ContentTimelineGroup[] = [];

  const now = nowUtcIso();
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
