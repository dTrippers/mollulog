import type { RecruitGoal } from "~/domain/recruit-recommendation";
import { selectRecruitMarks } from "~/domain/recruit-recommendation-timeline";
import { isInstantAfter, nowUtcIso } from "~/lib/date-time";
import { getRecruitRecommendations } from "~/models/recruit-recommendation.server";
import type { RecruitRecommendationAnswer } from "~/models/recruit-recommendation-contract";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRecruitmentResultsByRecruitmentGroupUids } from "~/models/recruitment-result.server";
import { getAllStudentsMap } from "~/models/student";
import type { FutureContent } from "./futures";

/**
 * The account's recruited students, which the screens leave out of the answer: none for a guest, the students of both
 * records when both were read, and none with `unavailable` when either read failed (the screens then say so, or hide
 * the marks).
 */
export type RecruitedStudentsStatus = "guest" | "available" | "unavailable";

export type RecruitRecommendationView =
  | {
      status: "ok";
      answer: RecruitRecommendationAnswer;
      recruited: RecruitedStudentsStatus;
      recruitedStudentUids: string[];
      // The names of the students that 대체 tags point at.
      substituteNames: Record<string, string>;
    }
  | { status: "unavailable" };

/** The pickups the answer marks: every pickup student that can still be recruited, in a content that has not ended. */
export function collectRecommendationPickups(contents: FutureContent[], now: string = nowUtcIso()) {
  const pickups = new Map<string, { studentUid: string; startAt: string }>();
  for (const content of contents) {
    if (content.endAt !== null && !isInstantAfter(content.endAt, now)) continue;
    for (const recruitment of content.recruitments) {
      if (!recruitment.pickup || !recruitment.student) continue;
      if (recruitment.until !== null && !isInstantAfter(recruitment.until, now)) continue;
      const pickup = { studentUid: recruitment.student.uid, startAt: recruitment.since };
      pickups.set(`${pickup.studentUid}\u0000${pickup.startAt}`, pickup);
    }
  }
  return [...pickups.values()];
}

/**
 * The account's recruited students: the students in its 학생부, and the students its recruitment results on the
 * schedule mark as recruited or exchanged.
 */
async function readRecruitedStudentUids(env: Env, userId: number, contents: FutureContent[]): Promise<string[]> {
  const recruitmentGroupUids = contents.flatMap((content) =>
    content.recruitmentGroupUid ? [content.recruitmentGroupUid] : [],
  );
  const [recruitedStudents, results] = await Promise.all([
    getRecruitedStudents(env, userId),
    getRecruitmentResultsByRecruitmentGroupUids(env, userId, recruitmentGroupUids),
  ]);
  const uids = new Set(recruitedStudents.map((student) => student.studentUid));
  for (const result of results) {
    if (result.completedAt === null) continue;
    for (const student of [...result.recruitedStudents, ...result.exchangedStudents]) uids.add(student.studentUid);
  }
  return [...uids];
}

/**
 * The names of the students the answer's 대체 tags point at. A tag whose student is unknown is a data error: it is
 * reported and the tag is left out, so a tag never names a student by its UID.
 */
async function resolveSubstituteNames(
  env: Env,
  answer: RecruitRecommendationAnswer,
  onUnknownSubstitute?: (studentUid: string) => void,
): Promise<{ answer: RecruitRecommendationAnswer; substituteNames: Record<string, string> }> {
  const uids = new Set(
    answer.students.flatMap((student) =>
      student.tags.flatMap((tag) => (tag.substituteStudentUid === undefined ? [] : [tag.substituteStudentUid])),
    ),
  );
  if (uids.size === 0) return { answer, substituteNames: {} };
  const students = await getAllStudentsMap(env, true);
  const substituteNames: Record<string, string> = {};
  for (const uid of uids) {
    const student = students[uid];
    if (student) {
      substituteNames[uid] = student.name;
    } else {
      onUnknownSubstitute?.(uid);
    }
  }
  return {
    answer: {
      ...answer,
      students: answer.students.map((student) => ({
        ...student,
        tags: student.tags.filter(
          (tag) => tag.substituteStudentUid === undefined || substituteNames[tag.substituteStudentUid] !== undefined,
        ),
      })),
    },
    substituteNames,
  };
}

export async function loadRecruitRecommendations(
  env: Env,
  input: {
    goal: RecruitGoal;
    userId: number | null;
    contents: FutureContent[];
    onRecruitedReadFailure?: (error: unknown) => void;
    onUnknownSubstitute?: (studentUid: string) => void;
  },
): Promise<RecruitRecommendationView> {
  let recruited: RecruitedStudentsStatus = "guest";
  let recruitedStudentUids: string[] = [];
  if (input.userId !== null) {
    try {
      recruitedStudentUids = await readRecruitedStudentUids(env, input.userId, input.contents);
      recruited = "available";
    } catch (error) {
      input.onRecruitedReadFailure?.(error);
      recruited = "unavailable";
    }
  }
  const call = await getRecruitRecommendations(env, {
    goal: input.goal,
    pickups: collectRecommendationPickups(input.contents),
  });
  if (!call.ok) return { status: "unavailable" };
  const { answer, substituteNames } = await resolveSubstituteNames(env, call.answer, input.onUnknownSubstitute);
  return { status: "ok", answer, recruited, recruitedStudentUids, substituteNames };
}

export type RecruitMarksView =
  | { status: "ok"; marks: { studentUid: string; startAt: string }[] }
  | { status: "hidden" };

/**
 * The 미래시 "AI 추천" marks of a goal: the recommended pickups without the recruited students. When the recruited
 * students or the answer cannot be read, no mark shows, so a recruited student is never marked.
 */
export async function loadRecruitMarks(
  env: Env,
  input: {
    goal: RecruitGoal;
    userId: number | null;
    contents: FutureContent[];
    onRecruitedReadFailure?: (error: unknown) => void;
    onServiceFailure?: () => void;
  },
): Promise<RecruitMarksView> {
  let recruitedStudentUids: string[] = [];
  if (input.userId !== null) {
    try {
      recruitedStudentUids = await readRecruitedStudentUids(env, input.userId, input.contents);
    } catch (error) {
      input.onRecruitedReadFailure?.(error);
      return { status: "hidden" };
    }
  }
  const call = await getRecruitRecommendations(env, {
    goal: input.goal,
    pickups: collectRecommendationPickups(input.contents),
  });
  if (!call.ok) {
    input.onServiceFailure?.();
    return { status: "hidden" };
  }
  return { status: "ok", marks: selectRecruitMarks(call.answer.pickups, new Set(recruitedStudentUids)) };
}
