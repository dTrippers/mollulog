export type {
  RunType,
  TimelineContent,
  TimelineContentType,
  TimelineContentVideo,
} from "~/domain/timeline-content";

import type { TimelineContent } from "~/domain/timeline-content";

/**
 * Groups timeline contents by their recruitmentGroupUid without dropping entries when
 * multiple events share the same group (unlike `new Map(contents.map(...))`, which keeps
 * only the last event per key).
 */
export function groupTimelineContentsByRecruitmentGroupUid(
  contents: TimelineContent[],
): Map<string, TimelineContent[]> {
  const map = new Map<string, TimelineContent[]>();
  for (const content of contents) {
    if (!content.recruitmentGroupUid) continue;

    const existing = map.get(content.recruitmentGroupUid);
    if (existing) {
      existing.push(content);
    } else {
      map.set(content.recruitmentGroupUid, [content]);
    }
  }
  return map;
}

/**
 * Picks which of a shared recruitment group's events a given student "belongs to", based on
 * each event's recruitmentStudentUids allowlist. Events with no allowlist (null) match every
 * student, which keeps the common one-event-per-group case working unchanged. Falls back to
 * every candidate event when nothing matches, since a student is expected to always be listed
 * under at least one event.
 */
export function findEventsForRecruitmentStudent(
  events: TimelineContent[],
  studentUid: string | null,
): TimelineContent[] {
  if (events.length === 0) return [];

  const matches = events.filter(
    (event) =>
      event.recruitmentStudentUids === null ||
      (studentUid !== null && event.recruitmentStudentUids.includes(studentUid)),
  );
  return matches.length > 0 ? matches : events;
}
