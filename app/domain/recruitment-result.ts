import { type UtcIsoString, isInstantAfter } from "~/lib/date-time";
import type { PickupHistory } from "~/models/pickup-history";
import type { RecruitmentGroup, RecruitmentPoolStudent } from "~/models/recruitment";
import type {
  RecruitmentCompletionMeta,
  RecruitmentResult,
  RecruitmentResultStudent,
} from "~/models/recruitment-result";
import type { StudentMap } from "~/models/student";

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

export function normalizeRecruitmentResultStudents(
  students: RecruitmentResultStudent[] | undefined,
): RecruitmentResultStudent[] {
  const byStudentUid = new Map<string, RecruitmentResultStudent>();
  for (const student of students ?? []) {
    const studentUid = student.studentUid?.trim();
    if (!studentUid) {
      continue;
    }

    const tier = Math.max(1, Math.min(9, Number.isFinite(student.tier) ? Math.trunc(student.tier) : 3));
    const existing = byStudentUid.get(studentUid);
    byStudentUid.set(studentUid, {
      studentUid,
      tier: Math.max(existing?.tier ?? 0, tier),
      pickup: Boolean(existing?.pickup || student.pickup),
    });
  }

  return [...byStudentUid.values()];
}

export function appendRecruitmentResultStudent(
  students: RecruitmentResultStudent[] | undefined,
  student: RecruitmentResultStudent,
): RecruitmentResultStudent[] {
  return sanitizeRecruitmentResultStudents([...(students ?? []), student]);
}

export function removeRecruitmentResultStudent(
  students: RecruitmentResultStudent[] | undefined,
  studentUid: string,
): RecruitmentResultStudent[] {
  let removed = false;
  return sanitizeRecruitmentResultStudents(
    (students ?? []).filter((student) => {
      if (!removed && student.studentUid === studentUid) {
        removed = true;
        return false;
      }

      return true;
    }),
  );
}

export function sanitizeRecruitmentResultStudents(
  students: RecruitmentResultStudent[] | undefined,
): RecruitmentResultStudent[] {
  return (students ?? []).flatMap((student) => {
    const studentUid = student.studentUid?.trim();
    if (!studentUid) {
      return [];
    }

    const tier = Math.max(1, Math.min(9, Number.isFinite(student.tier) ? Math.trunc(student.tier) : 3));
    return [{ studentUid, tier, pickup: Boolean(student.pickup) }];
  });
}

export function createRecruitmentResultStudentsFromPickupHistory(
  history: Pick<PickupHistory, "result">,
  pickupStudentUids: Set<string> = new Set(),
  studentInitialTiers: Record<string, number> = {},
): RecruitmentResultStudent[] {
  return sanitizeRecruitmentResultStudents(
    history.result.flatMap((trial) =>
      trial.tier3StudentIds.map((studentUid) => ({
        studentUid,
        tier: studentInitialTiers[studentUid] ?? 3,
        pickup: pickupStudentUids.has(studentUid),
      })),
    ),
  );
}

export function mergeEditableRecruitmentResultStudents({
  existingStudents,
  history,
  lookup,
  pickupStudentUids = new Set(),
  studentInitialTiers = {},
}: {
  existingStudents: RecruitmentResultStudent[];
  history: Pick<PickupHistory, "result">;
  lookup: StudentLookup;
  pickupStudentUids?: Set<string>;
  studentInitialTiers?: Record<string, number>;
}): RecruitmentResultStudent[] {
  // The edit form owns only 3-star draw rows; non-3-star rows written by quick-complete flows must survive saves.
  const preservedExistingStudents = sanitizeRecruitmentResultStudents(existingStudents).flatMap((student) => {
    const resolvedStudent = resolveRecruitmentResultStudent(student, lookup);
    if (resolvedStudent.tier === 3) {
      return [];
    }

    return [
      {
        studentUid: student.studentUid,
        tier: resolvedStudent.tier,
        pickup: resolvedStudent.pickup,
      },
    ];
  });
  const editedFormStudents = createRecruitmentResultStudentsFromPickupHistory(
    history,
    pickupStudentUids,
    studentInitialTiers,
  );

  return sanitizeRecruitmentResultStudents([...preservedExistingStudents, ...editedFormStudents]);
}

export function getRecruitmentResultTrialFromPickupHistory(history: Pick<PickupHistory, "result">): number | null {
  if (history.result.length === 0) {
    return null;
  }

  return Math.max(...history.result.map((trial) => trial.trial));
}

export function getRecruitmentResultTier3CountFromPickupHistory(history: Pick<PickupHistory, "result">): number {
  return history.result.reduce((sum, trial) => sum + trial.tier3Count, 0);
}

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
