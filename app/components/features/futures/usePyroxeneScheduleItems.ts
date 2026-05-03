import { useMemo } from "react";
import type { PyroxenePlannerContent, PyroxeneTimelineItem } from "~/models/pyroxene-planner";
import type { PyroxeneScheduleItem } from "./types";

type FavoritedStudentRef = {
  contentUid: string;
  studentUid: string;
};

export function usePyroxeneScheduleItems(
  contents: PyroxenePlannerContent[],
  favoritedStudents: FavoritedStudentRef[],
  timelineItems: PyroxeneTimelineItem[],
): PyroxeneScheduleItem[] {
  return useMemo(() => {
    const items: PyroxeneScheduleItem[] = [];
    for (const content of contents) {
      if (content.kind === "event") {
        items.push({
          event: {
            uid: content.uid,
            name: content.name,
            since: content.since,
            until: content.until,
            earnablePyroxene: content.earnablePyroxene ?? null,
            recruitments: content.recruitments.map((recruitment) => ({
              ...recruitment,
              favorited: favoritedStudents.some(
                ({ contentUid, studentUid }) => contentUid === content.uid && studentUid === recruitment.student?.uid,
              ),
            })),
          },
        });
      } else if (content.kind === "raid") {
        items.push({
          raid: {
            uid: content.uid,
            name: content.name,
            type: content.type,
            since: content.since,
            until: content.until,
          },
        });
      }
    }

    for (const item of timelineItems) {
      if (item.source === "buy") {
        items.push({
          onetimeGain: {
            uid: item.uid,
            source: "buy",
            description: item.description,
            date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta,
          },
        });
      } else if (item.source === "package_onetime") {
        items.push({
          onetimeGain: {
            uid: item.uid,
            source: "package_onetime",
            description: item.description,
            date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta,
          },
        });
      } else if (item.source === "package_daily") {
        items.push({
          repeatedGain: {
            uid: item.uid,
            source: "package_daily",
            description: item.description,
            date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta,
            repeatIntervalDays: item.repeatIntervalDays ?? 0,
            repeatCount: item.repeatCount ?? 0,
          },
        });
      } else if (item.source === "attendance") {
        items.push({
          repeatedGain: {
            uid: item.uid,
            source: "attendance",
            description: item.description,
            date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta,
            repeatIntervalDays: item.repeatIntervalDays ?? 0,
          },
        });
      } else if (item.source === "other") {
        items.push({
          onetimeGain: {
            uid: item.uid,
            source: "other",
            description: item.description,
            date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta,
            oneTimeTicketDelta: item.oneTimeTicketDelta,
            tenTimeTicketDelta: item.tenTimeTicketDelta,
          },
        });
      }
    }

    return items;
  }, [contents, favoritedStudents, timelineItems]);
}
