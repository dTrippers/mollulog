import { isInstantAfter, type UtcIsoString } from "~/lib/date-time";
import type { RecruitmentCompletionMeta, RecruitmentResultStudent } from "./recruitment-result";

type RecruitmentResultCompletionState = {
  contentUid: string | null;
  completedAt: string | null;
  recruitedStudents: RecruitmentResultStudent[];
  exchangedStudents: RecruitmentResultStudent[];
};

function removeOneRecruitmentResultStudent<T extends { studentUid: string }>(students: T[], studentUid: string): T[] {
  let removed = false;
  return students.filter((student) => {
    if (!removed && student.studentUid === studentUid) {
      removed = true;
      return false;
    }

    return true;
  });
}

export function applyRecruitmentResultStudentCompletion<T extends RecruitmentResultCompletionState>(
  result: T,
  {
    contentUid,
    studentUid,
    completed,
    recruitment,
    now,
  }: {
    contentUid: string;
    studentUid: string;
    completed: boolean;
    recruitment: RecruitmentCompletionMeta;
    now: UtcIsoString;
  },
): T {
  const recruitedStudents = completed
    ? [...result.recruitedStudents, { studentUid, tier: recruitment.tier, pickup: recruitment.pickup }]
    : removeOneRecruitmentResultStudent(result.recruitedStudents, studentUid);
  const completedAt =
    recruitedStudents.length > 0 || result.exchangedStudents.length > 0 ? (result.completedAt ?? now) : null;

  return {
    ...result,
    contentUid,
    completedAt,
    recruitedStudents,
  };
}

export function canCompleteRecruitmentStudent({
  recruitmentSince,
  favorited,
  now,
}: {
  recruitmentSince: UtcIsoString;
  favorited: boolean;
  now: UtcIsoString;
}): boolean {
  return favorited && !isInstantAfter(recruitmentSince, now);
}
