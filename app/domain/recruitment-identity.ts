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
