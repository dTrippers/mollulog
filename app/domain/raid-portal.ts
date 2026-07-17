export type RaidPortalSeasonStudentUsage = {
  raidKey: string;
  studentCounts: Record<string, number>;
};

export type RaidPortalRecurringStudent = {
  studentUid: string;
  raidKeys: string[];
  totalCount: number;
};

export function getRecurringRaidStudents(
  seasonUsages: RaidPortalSeasonStudentUsage[],
  limit = 10,
): RaidPortalRecurringStudent[] {
  const students = new Map<string, RaidPortalRecurringStudent>();

  for (const { raidKey, studentCounts } of seasonUsages) {
    for (const [studentUid, count] of Object.entries(studentCounts)) {
      if (!studentUid || !Number.isFinite(count) || count <= 0) {
        continue;
      }

      const student = students.get(studentUid) ?? {
        studentUid,
        raidKeys: [],
        totalCount: 0,
      };
      if (!student.raidKeys.includes(raidKey)) {
        student.raidKeys.push(raidKey);
      }
      student.totalCount += count;
      students.set(studentUid, student);
    }
  }

  return [...students.values()]
    .filter(({ raidKeys }) => raidKeys.length >= 2)
    .sort((a, b) => {
      if (a.totalCount !== b.totalCount) {
        return b.totalCount - a.totalCount;
      }
      if (a.raidKeys.length !== b.raidKeys.length) {
        return b.raidKeys.length - a.raidKeys.length;
      }
      return a.studentUid.localeCompare(b.studentUid);
    })
    .slice(0, Math.max(0, limit));
}
