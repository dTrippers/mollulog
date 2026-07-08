const PROVISIONAL_STUDENT_KEY_PREFIX = "provisional:";

export function normalizeRecruitmentStudentName(name: string): string {
  return name.normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

function hashName(name: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

export function getProvisionalRecruitmentStudentKey(studentName: string): string {
  return `${PROVISIONAL_STUDENT_KEY_PREFIX}${hashName(normalizeRecruitmentStudentName(studentName))}`;
}

export function getRecruitmentFavoriteKey({
  student,
  studentName,
}: {
  student: { uid: string } | null;
  studentName: string;
}): string {
  return student?.uid ?? getProvisionalRecruitmentStudentKey(studentName);
}

/**
 * Restricts a recruitment group's recruitments to the students an event's page is allowed
 * to show. `studentUids: null` means "no restriction" (show every recruitment in the group),
 * which is the default for events that don't share their recruitment group with another event.
 */
export function filterRecruitmentsByStudentUids<T extends { student: { uid: string } | null }>(
  recruitments: T[],
  studentUids: string[] | null,
): T[] {
  if (studentUids === null) {
    return recruitments;
  }

  const allowedUids = new Set(studentUids);
  return recruitments.filter((recruitment) => recruitment.student !== null && allowedUids.has(recruitment.student.uid));
}
