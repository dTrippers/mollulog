// 모집 추천 timeline: the pickups of the coming contents, each paired with the service's answer for one goal. The
// service owns the judgment; this module only places each pickup student under a heading, the students the member has
// already recruited under their own.
import { isInstantAfter, type UtcIsoString } from "~/lib/date-time";
import type {
  RecruitRecommendationAnswer,
  RecruitRecommendationStudent,
} from "~/models/recruit-recommendation-contract";
import { hasRecruitRecommendation, type RecruitGoal } from "./recruit-recommendation";

export type RecruitTimelinePickup = {
  favoriteKey: string;
  // Null while the student is not yet known. Such a pickup is never judged.
  studentUid: string | null;
  since: UtcIsoString;
  until: UtcIsoString | null;
};

export type RecruitTimelineContentInput<P extends RecruitTimelinePickup> = {
  uid: string;
  until: UtcIsoString | null;
  pickups: P[];
};

export type RecommendedPickup<P> = { pickup: P; student: RecruitRecommendationStudent; aiRecommended: boolean };
export type JudgedPickup<P> = { pickup: P; student: RecruitRecommendationStudent };

export type RecruitTimelineContent<C, P> = {
  content: C;
  // A row each, in the content's order; for the newbie goal, in the order of the newbie rank.
  recommended: RecommendedPickup<P>[];
  // Judged, with no recommendation under the goal.
  notRecommended: JudgedPickup<P>[];
  // Not judged yet: a pickup that came after the last daily computation.
  pending: P[];
  // Already in the member's 학생부, whatever the answer says.
  recruited: P[];
};

export type RecruitTimeline<C, P> = {
  contents: RecruitTimelineContent<C, P>[];
  // Every pickup student with a recommendation is recruited, and there was at least one.
  allRecommendedRecruited: boolean;
};

/** The key of one pickup of one student, as the answer and the 미래시 marks match them. */
export function recruitPickupKey(studentUid: string, startAt: string): string {
  return `${studentUid}\u0000${startAt}`;
}

/**
 * The pickups 미래시 marks "AI 추천": the ones the answer recommends, without the students the Sensei has recruited.
 */
export function selectRecruitMarks(
  pickups: RecruitRecommendationAnswer["pickups"],
  recruitedStudentUids: ReadonlySet<string>,
): { studentUid: string; startAt: string }[] {
  return pickups
    .filter((pickup) => pickup.aiRecommended && !recruitedStudentUids.has(pickup.studentUid))
    .map(({ studentUid, startAt }) => ({ studentUid, startAt }));
}

/**
 * Places the pickup students that can still be recruited, in the contents that have not ended. A recruited student is
 * placed as recruited, a content with no student left is left out, and a student the answer does not have is pending.
 */
export function buildRecruitTimeline<C extends RecruitTimelineContentInput<P>, P extends RecruitTimelinePickup>({
  goal,
  answer,
  contents,
  recruitedStudentUids,
  now,
}: {
  goal: RecruitGoal;
  answer: Pick<RecruitRecommendationAnswer, "students" | "pickups">;
  contents: readonly C[];
  recruitedStudentUids: ReadonlySet<string>;
  now: UtcIsoString;
}): RecruitTimeline<C, P> {
  const studentByUid = new Map(answer.students.map((student) => [student.studentUid, student]));
  const aiRecommended = new Set(
    answer.pickups
      .filter((pickup) => pickup.aiRecommended)
      .map((pickup) => recruitPickupKey(pickup.studentUid, pickup.startAt)),
  );
  let recruitedRecommended = 0;
  let remainingRecommended = 0;
  const timelineContents: RecruitTimelineContent<C, P>[] = [];

  for (const content of contents) {
    if (content.until !== null && !isInstantAfter(content.until, now)) continue;
    const seen = new Set<string>();
    const recommended: RecommendedPickup<P>[] = [];
    const notRecommended: JudgedPickup<P>[] = [];
    const pending: P[] = [];
    const recruited: P[] = [];
    for (const pickup of content.pickups) {
      if (seen.has(pickup.favoriteKey)) continue;
      if (pickup.until !== null && !isInstantAfter(pickup.until, now)) continue;
      seen.add(pickup.favoriteKey);
      const student = pickup.studentUid === null ? undefined : studentByUid.get(pickup.studentUid);
      const judged = student !== undefined && hasRecruitRecommendation(goal, student.recommendation);
      if (pickup.studentUid !== null && recruitedStudentUids.has(pickup.studentUid)) {
        if (judged) recruitedRecommended += 1;
        recruited.push(pickup);
        continue;
      }
      if (student === undefined) {
        pending.push(pickup);
      } else if (judged) {
        recommended.push({
          pickup,
          student,
          aiRecommended: aiRecommended.has(recruitPickupKey(student.studentUid, pickup.since)),
        });
      } else {
        notRecommended.push({ pickup, student });
      }
    }
    if (goal === "newbie") {
      recommended.sort(
        (a, b) => (a.student.recommendation.newbie?.rank ?? 0) - (b.student.recommendation.newbie?.rank ?? 0),
      );
    }
    remainingRecommended += recommended.length;
    if (recommended.length + notRecommended.length + pending.length + recruited.length === 0) continue;
    timelineContents.push({ content, recommended, notRecommended, pending, recruited });
  }

  return {
    contents: timelineContents,
    allRecommendedRecruited: recruitedRecommended > 0 && remainingRecommended === 0,
  };
}
