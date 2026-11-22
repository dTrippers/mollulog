import type { Student } from "~/models/student";
import type { GrowthAvailableStudent } from "./types";

// The students the 학생 추가 search offers: everyone not in the planner yet, newest first. Other names come along so
// the search matches them too.
export function listAvailableGrowthStudents(
  allStudentsMap: Record<string, Pick<Student, "uid" | "name" | "altNames" | "order">>,
  managedUids: ReadonlySet<string>,
): GrowthAvailableStudent[] {
  return Object.values(allStudentsMap)
    .filter((student) => !managedUids.has(student.uid))
    .sort((a, b) => b.order - a.order)
    .map((student) => ({ uid: student.uid, name: student.name, altNames: student.altNames }));
}
