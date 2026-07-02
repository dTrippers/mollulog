import { useMemo } from "react";
import { type PyroxeneScheduleItem, buildPyroxeneScheduleItems } from "~/domain/pyroxene-schedule";
import type { PyroxeneTimelineItem } from "~/models/pyroxene-planner";
import type { PyroxenePlannerContent } from "~/views/pyroxene";

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
    return buildPyroxeneScheduleItems(contents, favoritedStudents, timelineItems);
  }, [contents, favoritedStudents, timelineItems]);
}
