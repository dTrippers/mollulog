import type { RecruitmentGroup, RecruitmentPoolStudent } from "~/models/recruitment";
import type { RecruitmentResult, RecruitmentResultStudent } from "./recruitment-result";
import type { StudentMap } from "./student";

type StudentInfo = {
  uid: string;
  name?: string | null;
  initialTier?: number | null;
};

type RecruitmentInfo = {
  pickup: boolean;
  recruitmentType?: string | null;
  student?: StudentInfo | null;
};

type RecruitmentGroupForStats = Pick<RecruitmentGroup, "recruitmentType"> & {
  recruitments: RecruitmentInfo[];
};

export type StudentLookup = {
  allStudentsMap?: StudentMap | Record<string, StudentInfo | undefined>;
  poolStudentsMap?: Map<string, RecruitmentPoolStudent | StudentInfo>;
  group?: RecruitmentGroupForStats | null;
};

export type ResolvedRecruitmentResultStudent = {
  uid: string;
  name: string;
  tier: number;
  pickup: boolean;
};

export type RecruitmentResultCountStats = {
  totalTrial: number | null;
  tier3Count: number;
  tier3DrawCount: number;
  tier3RateCount: number;
  pickupCount: number;
  pickupDrawCount: number;
  pickupRateCount: number;
};

function getGroupRecruitment(group: RecruitmentGroupForStats | null | undefined, studentUid: string) {
  return group?.recruitments.find((recruitment) => recruitment.student?.uid === studentUid) ?? null;
}

function getGroupStudent(group: RecruitmentGroupForStats | null | undefined, studentUid: string) {
  return getGroupRecruitment(group, studentUid)?.student ?? undefined;
}

function getStudentInfo(studentUid: string, lookup: StudentLookup): StudentInfo | undefined {
  return (
    lookup.allStudentsMap?.[studentUid] ??
    lookup.poolStudentsMap?.get(studentUid) ??
    getGroupStudent(lookup.group, studentUid)
  );
}

function resolveStudentTier(student: RecruitmentResultStudent, lookup: StudentLookup): number {
  return getStudentInfo(student.studentUid, lookup)?.initialTier ?? student.tier;
}

function resolveStudentPickup(student: RecruitmentResultStudent, lookup: StudentLookup): boolean {
  const groupRecruitment = getGroupRecruitment(lookup.group, student.studentUid);
  if (!groupRecruitment) {
    return student.pickup;
  }

  if (groupRecruitment.recruitmentType === "given") {
    return false;
  }

  return groupRecruitment.pickup;
}

export function resolveRecruitmentResultStudent(
  student: RecruitmentResultStudent,
  lookup: StudentLookup,
  onMissingStudent?: (studentUid: string) => never,
): ResolvedRecruitmentResultStudent {
  const studentInfo = getStudentInfo(student.studentUid, lookup);
  if (!studentInfo?.name) {
    onMissingStudent?.(student.studentUid);
  }

  return {
    uid: student.studentUid,
    name: studentInfo?.name ?? student.studentUid,
    tier: resolveStudentTier(student, lookup),
    pickup: resolveStudentPickup(student, lookup),
  };
}

export function resolveRecruitmentResultStudents(
  students: RecruitmentResultStudent[],
  lookup: StudentLookup,
  onMissingStudent?: (studentUid: string) => never,
): ResolvedRecruitmentResultStudent[] {
  return students
    .filter(({ studentUid }) => studentUid)
    .map((student) => resolveRecruitmentResultStudent(student, lookup, onMissingStudent));
}

export function getRecruitmentResultCountStats(
  result: Pick<RecruitmentResult, "recruitedStudents" | "tier3Count" | "trial">,
  lookup: StudentLookup,
): RecruitmentResultCountStats {
  const recruitedStudents = resolveRecruitmentResultStudents(result.recruitedStudents, lookup);
  const tier3Students = recruitedStudents.filter(({ tier }) => tier === 3);
  // Count-only entries intentionally cannot contribute to pickup counts because no student identity is recorded.
  const pickupStudents = tier3Students.filter(({ pickup }) => pickup);
  const tier3Count = result.tier3Count ?? tier3Students.length;
  const rateMultiplier = lookup.group?.recruitmentType === "fes" ? 0.5 : 1;
  const hasTrial = result.trial !== null;

  return {
    totalTrial: result.trial,
    tier3Count,
    tier3DrawCount: tier3Count,
    tier3RateCount: hasTrial ? tier3Count * rateMultiplier : 0,
    pickupCount: pickupStudents.length,
    pickupDrawCount: pickupStudents.length,
    pickupRateCount: hasTrial ? pickupStudents.length * rateMultiplier : 0,
  };
}
